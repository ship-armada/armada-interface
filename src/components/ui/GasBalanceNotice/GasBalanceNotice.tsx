// ABOUTME: Warning below the amount card when the EVM wallet lacks native token for gas.
// ABOUTME: Adds "You have X; about Y is needed" when the balance / estimate are known. Presentational (role="status").

import styles from './GasBalanceNotice.module.css'

export interface GasBalanceNoticeProps {
  nativeSymbol: string
  formattedBalance: string | null
  /** The estimated gas the wallet needs (formatted); adds "about N needed" when known. */
  formattedNeeded?: string | null
}

export function GasBalanceNotice({ nativeSymbol, formattedBalance, formattedNeeded = null }: GasBalanceNoticeProps) {
  const balanceHint =
    formattedBalance != null
      ? ` You have ${formattedBalance} ${nativeSymbol}${formattedNeeded != null ? `; about ${formattedNeeded} is needed` : ''}.`
      : ''
  return (
    <div className={styles.notice} role="status">
      Not enough {nativeSymbol} in your wallet to pay network gas.{balanceHint} Add funds on
      this chain, then try again.
    </div>
  )
}
