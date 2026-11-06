// ABOUTME: EarnReviewSummary — transparent vault summary table (mode / APY / amount / fees) with a per-tab total row.
// ABOUTME: Shares DepositReviewSummary's CSS so the rows sit inside the review/complete frost card; confirmedAt adds a "Date and time" row.

import { ArmadaLogo } from '@/design'
import { formatTransactionDateTime, formatUsdcAmount } from '@/lib/format'
import { PROJECTED_YIELD_EXPLANATION, formatApyPercent, rateToApy } from '@/lib/yield'
import { InfoTip } from '@/components/ui/InfoTip'
import type { YieldRate } from '@/hooks/useYieldRate'
import usdcAmount from '@/design/styles/usdcAmount.module.css'
import type { EarnTab } from '../EarnInputStep'
import { FeeInfo } from '@/components/tx/FeeInfo'
import styles from '../../deposit/DepositReviewSummary/DepositReviewSummary.module.css'

export interface EarnReviewSummaryProps {
  tab: EarnTab
  /** Requested USDC (raw 6-decimal) — the deposit or withdrawal amount. */
  amount: bigint
  /** Vault rate snapshot — drives the "Estimated APY" row. */
  rate: YieldRate | null
  /** Inclusive fee total — broadcaster + protocol. Rendered as "—" when null (pre-quote-load). */
  fee: bigint | null
  /**
   * Bottom-line USDC number, computed per-tab by the modal. For Add this is the private-balance
   * debit (`amount + fee`); for Withdraw it's the net private-balance gain (`amount - fee`, the fee
   * skimmed from the redeemed proceeds). NOT a blind `amount + fee` — the two tabs' balance flows differ.
   */
  /** Rendered as "—" when null (the deposit's fee isn't known yet). */
  netAmount: bigint | null
  /** Label paired with `netAmount` — also per-tab from the modal. */
  netLabel: string
  /** Completion timestamp (ms) — when present, adds a leading "Date and time" row for confirmations. */
  confirmedAt?: number
  /**
   * When true, the net total is an estimate — a withdrawal redeems fixed SHARES at the execution-time
   * rate, so the received amount depends on yield accrued between review and execution. Renders a `≈`
   * and a caption. Set on the Withdraw review; the confirmed receipt (actual redeemed gross) is exact.
   */
  estimated?: boolean
  /**
   * Whether to render the "Estimated APY" row. Defaults to true. The confirmation screen and the activity receipt show
   * the net APY frozen on the record at submit, and set false when none was captured (unknown, not 0%).
   */
  showApy?: boolean
  /** Review's "Est. time" row ("Usually takes ~15 sec", from `lib/tx/eta::estimatedTimeLabel`); omitted elsewhere. */
  estimatedTime?: string
  /** A deposit Review's "Est. yearly yield" (`lib/yield::projectedYearlyYield`, spec YD-7) — at the reviewed rate, shown "≈"
   *  with an ⓘ saying it isn't guaranteed. Omitted elsewhere (and on a withdrawal). */
  yearlyYield?: bigint | null
}

function formatApy(rate: YieldRate | null): string {
  if (!rate) return 'syncing…'
  const apy = rateToApy(rate.apyBps)
  if (apy === 0) return 'unavailable'
  return `~${formatApyPercent(apy)}`
}

export function EarnReviewSummary({
  tab,
  amount,
  rate,
  fee,
  netAmount,
  netLabel,
  confirmedAt,
  showApy = true,
  estimated,
  estimatedTime,
  yearlyYield = null,
}: EarnReviewSummaryProps) {
  const modeLabel = tab === 'add' ? 'Add to vault' : 'Withdraw from shielded vault'
  const amountLabel = tab === 'add' ? 'Your deposit' : 'Your withdrawal'
  // Vault moves stay inside the shielded pool, so the notice is always the private variant.
  const privacyBody =
    tab === 'add'
      ? "You are sending to Armada's shielded vault"
      : 'You are withdrawing to your shielded address'
  return (
    <div className={styles.summary}>
      <div className={styles.summaryBody}>
        {confirmedAt !== undefined ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Date and time</span>
            <span className={styles.summaryValue}>{formatTransactionDateTime(confirmedAt)}</span>
          </div>
        ) : null}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Mode</span>
          <span className={styles.summaryValue}>{modeLabel}</span>
        </div>
        {showApy ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Estimated APY</span>
            <span className={styles.summaryValue}>{formatApy(rate)}</span>
          </div>
        ) : null}
        {yearlyYield !== null ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>
              Est. yearly yield
              <InfoTip text={PROJECTED_YIELD_EXPLANATION} label="About the yearly yield estimate" />
            </span>
            <span className={[styles.summaryValue, usdcAmount.font].join(' ')}>{`\u2248 ${formatUsdcAmount(yearlyYield)} USDC`}</span>
          </div>
        ) : null}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{amountLabel}</span>
          <span className={[styles.summaryValue, usdcAmount.font].join(' ')}>
            {formatUsdcAmount(amount)} USDC
          </span>
        </div>
        {estimatedTime ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Est. time</span>
            <span className={styles.summaryValue}>{estimatedTime}</span>
          </div>
        ) : null}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>
            Fees
            <FeeInfo parts={['relayer']} />
          </span>
          <span className={[styles.summaryValue, usdcAmount.font].join(' ')}>
            {fee === null ? '—' : `${formatUsdcAmount(fee)} USDC`}
          </span>
        </div>
      </div>
      {/* Total row is the modal's per-tab net figure — deposit debits `amount + fee`; withdraw
          returns the NET `amount - fee` (the fee is skimmed from the redeemed proceeds, not paid from
          pre-existing private USDC). Not a generic `amount + fee`. */}
      <div className={styles.summaryTotalRow}>
        <span className={styles.summaryTotalLabel}>{netLabel}</span>
        <span className={[styles.summaryTotalValue, usdcAmount.font].join(' ')}>
          {netAmount === null ? '—' : `${estimated ? '≈ ' : ''}${formatUsdcAmount(netAmount)} USDC`}
        </span>
      </div>
      {estimated ? (
        <div className={styles.summaryEstimateNote}>
          Estimate — the final amount depends on the vault rate at execution.
        </div>
      ) : null}
      {/* Privacy notice — shown pre-confirmation only; vault moves are always private, so it's the
          brand (private) variant. The confirmation view carries the date row instead. */}
      {confirmedAt === undefined ? (
        <div className={styles.privacyNotice} role="note">
          <span
            className={[styles.privacyNoticeIcon, styles.privacyNoticeIconPrivate].join(' ')}
            aria-hidden
          >
            <ArmadaLogo variant="mark" markTone="deep" className={styles.privacyNoticeMark} />
          </span>
          <div className={styles.privacyNoticeCopy}>
            <p className={styles.privacyNoticeTitle}>Private transfer.</p>
            <p className={styles.privacyNoticeBody}>{privacyBody}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
