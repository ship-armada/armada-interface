// ABOUTME: Local-mode developer panel — contract addresses, wallet balances on each chain, and a faucet drip button.
// ABOUTME: Hidden in sepolia mode (the faucet endpoint doesn't exist and these addresses are public-record).

import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { useAtomValue } from 'jotai'
import { useAccount } from 'wagmi'
import { Card, SectionHeader } from '@/components/ui'
import { Button } from '@armada/ui'
import { useWallet } from '@/hooks/useWallet'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import { loadDeployments, type ResolvedDeployments } from '@/config/deployments'
import { getNetworkConfig, isLocalMode, type ChainIdentity } from '@/config/network'
import { railgunEngineAtom, shieldedUsdcAtom } from '@/state/wallet'
import { formatUsdcAmount, truncateAddress } from '@/lib/format'
import styles from './Debug.module.css'

const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)']

/** Secondary manifest shape (hub-v3.json / client-v3.json / clientB-v3.json). */
interface FaucetManifest {
  chainId: number
  contracts: {
    usdc: string
    faucet?: string
  }
}

/** Manifest filename per role; mirrors the convention in deployments/ at the repo root. */
const FAUCET_MANIFEST_NAMES: Record<'hub' | 'clientA' | 'clientB', string> = {
  hub: 'hub-v3.json',
  clientA: 'client-v3.json',
  clientB: 'clientB-v3.json',
}

async function loadFaucetManifest(role: 'hub' | 'clientA' | 'clientB'): Promise<FaucetManifest | null> {
  try {
    const res = await fetch(`/api/deployments/${FAUCET_MANIFEST_NAMES[role]}`)
    if (!res.ok) return null
    return (await res.json()) as FaucetManifest
  } catch {
    return null
  }
}

interface ChainBalance {
  chainId: number
  name: string
  rpcUrl: string
  faucetAddress: string | null
  ethBalance: bigint | null
  usdcBalance: bigint | null
  usdcAddress: string
  error: string | null
}

async function queryChainBalance(
  chain: ChainIdentity,
  evmAddress: string,
  usdcAddress: string,
  faucetAddress: string | null,
): Promise<ChainBalance> {
  const rpcUrl = chain.rpcUrls[0]!
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const usdc = new ethers.Contract(usdcAddress, ERC20_BALANCE_ABI, provider)
    // ethers v6 Contract method types are dynamic / optional under strict TS; non-null asserts
    // because the ABI we passed makes balanceOf+drip statically guaranteed to exist.
    const balanceOfFn = usdc.balanceOf as (a: string) => Promise<bigint>
    const [ethBalance, usdcBalance] = await Promise.all([
      provider.getBalance(evmAddress),
      balanceOfFn(evmAddress),
    ])
    return {
      chainId: chain.chainId,
      name: chain.name,
      rpcUrl,
      faucetAddress,
      ethBalance,
      usdcBalance,
      usdcAddress,
      error: null,
    }
  } catch (err) {
    return {
      chainId: chain.chainId,
      name: chain.name,
      rpcUrl,
      faucetAddress,
      ethBalance: null,
      usdcBalance: null,
      usdcAddress,
      error: err instanceof Error ? err.message : 'query failed',
    }
  }
}

export function Debug() {
  // Read-only consumers — Sign step gates on these, here we just surface them for inspection.
  const engine = useAtomValue(railgunEngineAtom)
  const shielded = useAtomValue(shieldedUsdcAtom)
  const { address: evmAddress } = useWallet()
  const { state: shieldedState } = useShieldedWallet()
  const { chainId: connectedChainId } = useAccount()

  const [deployments, setDeployments] = useState<ResolvedDeployments | null>(null)
  const [faucetByChainId, setFaucetByChainId] = useState<Record<number, string>>({})
  const [balances, setBalances] = useState<ChainBalance[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [drippingChainId, setDrippingChainId] = useState<number | null>(null)
  const [dripError, setDripError] = useState<string | null>(null)

  // Refresh chain balances against the currently-connected EVM address. Called on mount,
  // after a successful faucet drip, and via the "Refresh" button.
  const refreshBalances = useCallback(async () => {
    if (!evmAddress || !deployments) return
    setRefreshing(true)
    try {
      const cfg = getNetworkConfig()
      const chains: Array<{ chain: ChainIdentity; usdc: string }> = [
        { chain: cfg.hub, usdc: deployments.hub.cctp.usdc },
        ...deployments.clients.map((c, i) => ({
          chain: cfg.clients[i]!,
          usdc: c.cctp.usdc,
        })),
      ]
      const results = await Promise.all(
        chains.map(({ chain, usdc }) =>
          queryChainBalance(chain, evmAddress, usdc, faucetByChainId[chain.chainId] ?? null),
        ),
      )
      setBalances(results)
    } finally {
      setRefreshing(false)
    }
  }, [evmAddress, deployments, faucetByChainId])

  // One-time bootstrap: pull the privacy-pool deployments + the secondary faucet manifests.
  useEffect(() => {
    void (async () => {
      const resolved = await loadDeployments()
      setDeployments(resolved)
      const [hubFaucet, clientFaucet, clientBFaucet] = await Promise.all([
        loadFaucetManifest('hub'),
        loadFaucetManifest('clientA'),
        loadFaucetManifest('clientB'),
      ])
      const map: Record<number, string> = {}
      for (const m of [hubFaucet, clientFaucet, clientBFaucet]) {
        if (m?.contracts.faucet) map[m.chainId] = m.contracts.faucet
      }
      setFaucetByChainId(map)
    })()
  }, [])

  // Refresh balances once deployments + wallet are both ready.
  useEffect(() => {
    void refreshBalances()
  }, [refreshBalances])

  const handleDrip = useCallback(
    async (chainId: number) => {
      if (!evmAddress) {
        setDripError('Connect your wallet first.')
        return
      }
      setDripError(null)
      setDrippingChainId(chainId)
      try {
        // POST to the dev-server endpoint — uses the Anvil deployer to call dripTo(address),
        // sending USDC + sponsor ETH to the user. Sidesteps the chicken-and-egg of needing
        // gas to call drip() directly. The endpoint is local-mode only (503 on sepolia).
        const res = await fetch('/api/fund-gas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: evmAddress, chainId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(data.error ?? 'Drip failed.')
        }
        await refreshBalances()
      } catch (err) {
        setDripError(err instanceof Error ? err.message : 'Drip failed.')
      } finally {
        setDrippingChainId(null)
      }
    },
    [evmAddress, refreshBalances],
  )

  if (!isLocalMode()) {
    return (
      <div className={styles.page}>
        <SectionHeader title="Debug" />
        <Card className={styles.section}>
          <p>The Debug page is only available in local mode (<code>VITE_NETWORK=local</code>).</p>
        </Card>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <SectionHeader title="Debug" />

      <Card className={styles.section}>
        <h3 className={styles.sectionTitle}>Network</h3>
        <dl className={styles.kv}>
          <dt>Mode</dt><dd>local</dd>
          <dt>Engine state</dt><dd>{engine.state}{engine.error ? ` — ${engine.error}` : ''}</dd>
          <dt>Hub chain</dt><dd>{getNetworkConfig().hub.name} ({getNetworkConfig().hub.chainId})</dd>
          <dt>Client chains</dt><dd>{getNetworkConfig().clients.map(c => `${c.name} (${c.chainId})`).join(', ')}</dd>
          <dt>Relayer URL</dt><dd><code>{getNetworkConfig().relayerUrl ?? '—'}</code></dd>
        </dl>
      </Card>

      <Card className={styles.section}>
        <h3 className={styles.sectionTitle}>Connected wallet</h3>
        <dl className={styles.kv}>
          <dt>EVM address</dt><dd>{evmAddress ? <code>{evmAddress}</code> : '— not connected —'}</dd>
          <dt>Wallet chain</dt><dd>{connectedChainId ?? '—'}</dd>
          <dt>Shielded wallet ID</dt><dd>{shieldedState?.id ? <code>{shieldedState.id}</code> : '—'}</dd>
          <dt>Shielded status</dt><dd>{shieldedState?.status ?? 'missing'}</dd>
          <dt>Railgun address</dt><dd>{shieldedState?.railgunAddress ? <code>{truncateAddress(shieldedState.railgunAddress)}</code> : '—'}</dd>
          <dt>Anti-phish checksum</dt><dd>{shieldedState?.checksum ?? '—'}</dd>
          <dt>Shielded USDC</dt><dd>{shielded === null ? '— not synced —' : `${formatUsdcAmount(shielded)} USDC`}</dd>
        </dl>
      </Card>

      <Card className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h3 className={styles.sectionTitle}>Balances per chain</h3>
          <Button
            variant="secondary"
            size="sm"
            showIcon={false}
            label={refreshing ? 'Refreshing…' : 'Refresh'}
            onClick={() => void refreshBalances()}
            disabled={refreshing || !evmAddress}
          />
        </div>
        {!evmAddress ? (
          <p className={styles.muted}>Connect a wallet to see balances.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Chain</th>
                <th>ETH</th>
                <th>USDC</th>
                <th>Faucet</th>
              </tr>
            </thead>
            <tbody>
              {balances.map(b => (
                <tr key={b.chainId}>
                  <td>{b.name} ({b.chainId})</td>
                  <td>{b.ethBalance === null ? '—' : ethers.formatEther(b.ethBalance).slice(0, 8)}</td>
                  <td>{b.usdcBalance === null ? '—' : formatUsdcAmount(b.usdcBalance)}</td>
                  <td>
                    {b.faucetAddress ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        showIcon={false}
                        label={drippingChainId === b.chainId ? 'Dripping…' : 'Drip'}
                        onClick={() => void handleDrip(b.chainId)}
                        disabled={drippingChainId !== null || !evmAddress}
                      />
                    ) : (
                      <span className={styles.muted}>no faucet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {dripError ? (
          <div role="alert" className={styles.error}>{dripError}</div>
        ) : null}
      </Card>

      <Card className={styles.section}>
        <h3 className={styles.sectionTitle}>Hub contracts</h3>
        {deployments ? (
          <dl className={styles.kv}>
            <dt>PrivacyPool</dt><dd><code>{deployments.hub.contracts.privacyPool}</code></dd>
            <dt>MerkleModule</dt><dd><code>{deployments.hub.contracts.merkleModule}</code></dd>
            <dt>VerifierModule</dt><dd><code>{deployments.hub.contracts.verifierModule}</code></dd>
            <dt>ShieldModule</dt><dd><code>{deployments.hub.contracts.shieldModule}</code></dd>
            <dt>TransactModule</dt><dd><code>{deployments.hub.contracts.transactModule}</code></dd>
            <dt>HookRouter</dt><dd><code>{deployments.hub.contracts.hookRouter}</code></dd>
            <dt>USDC</dt><dd><code>{deployments.hub.cctp.usdc}</code></dd>
            <dt>TokenMessenger</dt><dd><code>{deployments.hub.cctp.tokenMessenger}</code></dd>
            <dt>MessageTransmitter</dt><dd><code>{deployments.hub.cctp.messageTransmitter}</code></dd>
            <dt>Faucet</dt><dd>{faucetByChainId[deployments.hub.chainId] ? <code>{faucetByChainId[deployments.hub.chainId]}</code> : '—'}</dd>
          </dl>
        ) : (
          <p className={styles.muted}>Loading…</p>
        )}
      </Card>

      <Card className={styles.section}>
        <h3 className={styles.sectionTitle}>Client contracts</h3>
        {deployments ? (
          deployments.clients.map((c, i) => (
            <div key={c.chainId} className={i > 0 ? styles.clientBlockSpaced : styles.clientBlock}>
              <h4 className={styles.subTitle}>{getNetworkConfig().clients[i]?.name ?? `Client ${i + 1}`} ({c.chainId})</h4>
              <dl className={styles.kv}>
                <dt>PrivacyPoolClient</dt><dd><code>{c.contracts.privacyPoolClient}</code></dd>
                <dt>HookRouter</dt><dd><code>{c.contracts.hookRouter}</code></dd>
                <dt>USDC</dt><dd><code>{c.cctp.usdc}</code></dd>
                <dt>Faucet</dt><dd>{faucetByChainId[c.chainId] ? <code>{faucetByChainId[c.chainId]}</code> : '—'}</dd>
              </dl>
            </div>
          ))
        ) : (
          <p className={styles.muted}>Loading…</p>
        )}
      </Card>
    </div>
  )
}
