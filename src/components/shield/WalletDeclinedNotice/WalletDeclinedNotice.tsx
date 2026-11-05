// ABOUTME: WalletDeclinedNotice — the shield Review's quiet note after the user declined a prompt in their wallet (4D):
// ABOUTME: nothing was shielded, confirm to try again. Info-toned, like FeeUpdatedBanner — not the error screen.

import { InformationCircleIcon } from '@heroicons/react/24/outline'
import styles from './WalletDeclinedNotice.module.css'

export function WalletDeclinedNotice() {
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.iconTile} aria-hidden>
        <InformationCircleIcon className={styles.icon} strokeWidth={1.75} />
      </span>
      <span className={styles.text}>You cancelled in your wallet, so nothing was shielded. Confirm to try again.</span>
    </div>
  )
}
