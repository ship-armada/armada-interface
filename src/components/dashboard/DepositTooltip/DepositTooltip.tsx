// ABOUTME: Callout card guiding users into the shielded pool; doubles as an earn/APY banner via optional props.
// ABOUTME: Ported from the armada-app design mockup.
import { useState, type ComponentType, SVGProps } from 'react'
import { InformationCircleIcon, PlusIcon } from '@heroicons/react/24/outline'
import { TokenBadge } from '@/components/dashboard/TokenBadge'
import { VaultHowItWorksDialog } from '@/components/dashboard/VaultHowItWorksDialog/VaultHowItWorksDialog'
import styles from './DepositTooltip.module.css'

const TOOLTIP_ICON_PX = 34

const DEFAULT_HEADLINE = 'Shield your USDC'
const DEFAULT_BODY =
  "Shielding into Armada's shielded pool is the first step to move funds privately."

export interface DepositTooltipProps {
  variant?: 'default' | 'v2'
  onDeposit?: () => void
  /** Earn banner: an info button opens the vault explainer. */
  howItWorks?: boolean
  /** The vault's fee on earnings (basis points), named in the explainer when known. */
  yieldFeeBps?: bigint
  headline?: string
  hideHeadline?: boolean
  body?: string
  ariaLabel?: string
  BadgeIcon?: ComponentType<SVGProps<SVGSVGElement>>
  /** `white` = solid white badge (earn APY card). Default is the brand gradient. */
  badgeBackground?: 'brand' | 'white'
  /** Icon tile fill. Earn uses purple; deposit uses amber. */
  iconTileTone?: 'amber' | 'purple'
  stretch?: boolean
  className?: string
}

export function DepositTooltip({
  onDeposit,
  howItWorks = false,
  yieldFeeBps,
  headline = DEFAULT_HEADLINE,
  hideHeadline = false,
  body = DEFAULT_BODY,
  ariaLabel,
  BadgeIcon = PlusIcon,
  badgeBackground = 'brand',
  iconTileTone = 'amber',
  stretch = false,
  className,
}: DepositTooltipProps) {
  const [howOpen, setHowOpen] = useState(false)
  const wrapAsButton = Boolean(onDeposit) && !howItWorks
  const accessibleName = ariaLabel ?? headline

  const rootClassName = [
    styles.root,
    stretch && styles.stretch,
    wrapAsButton && styles.rootInteractive,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const icon = (
      <div className={[
        styles.iconTile,
        iconTileTone === 'purple' && styles.iconTilePurple,
        (wrapAsButton || howItWorks) && styles.iconTileStatic,
      ].filter(Boolean).join(' ')}>
        <div className={styles.iconCluster} aria-hidden>
          <div className={styles.tokenBadgeSlot}>
            <TokenBadge size={TOOLTIP_ICON_PX} />
          </div>
          <div className={styles.depositButtonSlot}>
            <span
              className={[styles.depositIcon, badgeBackground === 'white' && styles.depositIconWhite]
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            >
              <BadgeIcon className={styles.depositIconGlyph} strokeWidth={1.5} />
            </span>
          </div>
        </div>
      </div>
  )

  const text = (
      <div className={styles.textBlock}>
        {hideHeadline ? null : <p className={styles.headline}>{headline}</p>}
        <p className={`armada-text-ui-body-sm ${styles.body}`}>{body}</p>
      </div>
  )

  const howControl = howItWorks ? (
    <button
      type="button"
      className={styles.howItWorks}
      aria-label="How the shielded vault works"
      onClick={() => setHowOpen(true)}
    >
      <InformationCircleIcon className={styles.howIcon} strokeWidth={1.5} aria-hidden />
    </button>
  ) : null

  const howDialog = howOpen ? (
    <VaultHowItWorksDialog yieldFeeBps={yieldFeeBps} onClose={() => setHowOpen(false)} />
  ) : null

  if (wrapAsButton) {
    return (
      <button
        type="button"
        className={rootClassName}
        onClick={onDeposit}
        aria-label={accessibleName}
        data-testing-click="deposit_first_button"
      >
        {icon}
        {text}
      </button>
    )
  }

  if (howItWorks) {
    return (
      <aside className={[rootClassName, styles.rootDismissable].filter(Boolean).join(' ')}>
        {howControl}
        {onDeposit ? (
          <button type="button" className={styles.activate} onClick={onDeposit} aria-label={accessibleName}>
            {icon}
            {text}
          </button>
        ) : (
          <>
            {icon}
            {text}
          </>
        )}
        {howDialog}
      </aside>
    )
  }

  return (
    <aside className={rootClassName} aria-label={accessibleName}>
      {icon}
      {text}
    </aside>
  )
}
