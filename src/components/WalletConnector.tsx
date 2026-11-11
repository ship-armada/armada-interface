// ABOUTME: Header wallet control — primary "Connect wallet" runs RainbowKit then the shielded sign-in; connected state is the WalletMenu pill.

import { useAtom, useSetAtom } from 'jotai'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useDisconnect } from 'wagmi'
import { Button, WalletButton } from '@/design'
import { WalletMenu, buildWalletChainBalances } from '@/components/WalletMenu'
import { useBalances } from '@/hooks/useBalances'
import { useOpenActionModal } from '@/hooks/useOpenActionModal'
import { openModalAtom, balanceHiddenAtom } from '@/state/ui'
import { getChainById } from '@/config/network'
import { truncateAddress } from '@/lib/format'
import { walletProviderFromConnector } from '@/lib/walletProvider'
import styles from './WalletConnector.module.css'

export function WalletConnector() {
  const { connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { unshielded } = useBalances()
  const walletProvider = walletProviderFromConnector(connector)
  const setOpenModal = useSetAtom(openModalAtom)
  const [balanceHidden, setBalanceHidden] = useAtom(balanceHiddenAtom)
  const openActionModal = useOpenActionModal()

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        authenticationStatus,
        openChainModal,
      }) => {
        const isReady = mounted && authenticationStatus !== 'loading'
        const isConnected =
          isReady
          && account
          && chain
          && (!authenticationStatus || authenticationStatus === 'authenticated')

        if (!isReady) {
          return (
            <WalletButton
              label="Connecting..."
              icon={<Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              disabled
              ariaLabel="Wallet connecting"
            />
          )
        }

        if (!isConnected) {
          return (
            <Button
              variant="primary"
              size="md"
              label="Connect wallet"
              showIcon={false}
              onClick={() => openActionModal()}
            />
          )
        }

        if (chain.unsupported) {
          // Wrong-network pill wears the same `secondary md` + `styles.trigger` chrome as the
          // connected WalletMenu trigger. The error-tinted warning glyph carries the "switch
          // network" signal; clicking opens RainbowKit's chain modal. "Wrong network" is the
          // button's accessible name.
          return (
            <Button
              variant="secondary"
              size="md"
              label="Wrong network"
              showIcon={false}
              leadingIcon={
                <AlertTriangle
                  className={styles.wrongNetworkIcon}
                  aria-hidden="true"
                  width={16}
                  height={16}
                />
              }
              onClick={openChainModal}
              className={styles.trigger}
            />
          )
        }

        const displayAddress = account.displayName.startsWith('0x')
          ? truncateAddress(account.address)
          : account.displayName

        // Address explorer link — chain explorer base + /address/<addr>. Undefined on local Anvil
        // (no explorer), which disables the "View on explorer" action in the panel.
        const explorerBase = getChainById(chain.id)?.explorerUrl
        const explorerUrl = explorerBase ? `${explorerBase}/address/${account.address}` : undefined
        const networkLabel = chain.name ?? getChainById(chain.id)?.name ?? `Chain ${chain.id}`
        // Per-chain USDC breakdown — a shield is per-chain, so the panel shows where the balance
        // actually sits rather than a misleading combined total (#8).
        const chainBalances = buildWalletChainBalances(
          unshielded,
          chain.id,
          (id) => getChainById(id)?.name ?? `Chain ${id}`,
        )

        return (
          <WalletMenu
            displayAddress={displayAddress}
            fullAddress={account.address}
            walletProvider={walletProvider}
            balances={chainBalances}
            networkLabel={networkLabel}
            explorerUrl={explorerUrl}
            balanceHidden={balanceHidden}
            onBalanceHiddenChange={setBalanceHidden}
            onDisconnect={() => disconnect()}
            onDeposit={() => setOpenModal('shield')}
            triggerClassName={styles.trigger}
          />
        )
      }}
    </ConnectButton.Custom>
  )
}
