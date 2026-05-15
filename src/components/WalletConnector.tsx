// ABOUTME: Header wallet button — RainbowKit ConnectButton.Custom render-prop wired to @armada/ui WalletButton.
// ABOUTME: All four states (loading/disconnected/wrong-network/connected) use WalletButton; truncation matches the mockup.

import { Loader2 } from 'lucide-react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { WalletButton } from '@armada/ui'
import { truncateAddress } from '@/lib/format'

export function WalletConnector() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, authenticationStatus, openAccountModal, openChainModal, openConnectModal }) => {
        const isReady = mounted && authenticationStatus !== 'loading'
        const isConnected =
          isReady &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated')

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
          return <WalletButton label="Connect Wallet" onClick={openConnectModal} />
        }

        if (chain.unsupported) {
          return (
            <WalletButton
              label="Wrong network"
              variant="destructive"
              onClick={openChainModal}
              ariaLabel="Wrong network — click to switch"
            />
          )
        }

        const label = account.displayName.startsWith('0x')
          ? truncateAddress(account.address)
          : account.displayName
        return (
          <WalletButton
            label={label}
            onClick={openAccountModal}
            ariaLabel={`Wallet ${label}`}
          />
        )
      }}
    </ConnectButton.Custom>
  )
}
