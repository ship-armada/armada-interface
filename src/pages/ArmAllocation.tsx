// ABOUTME: Public ARM allocation page — paste an address to read a revenue-locked allocation from Ethereum.
// ABOUTME: Lives outside the signed-in app shell. The public ledger and claim transactions are not wired yet.

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowUpRight, ChevronDown } from 'lucide-react'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { RollingBalanceValue } from '@/components/dashboard/RollingBalanceValue'
import { ArmadaLogo, Text } from '@/design'
import { isEvmAddress } from '@/lib/address'
import { truncateAddress } from '@/lib/format'
import {
  ARM_DISTRIBUTOR_URL,
  ARM_UNLOCK_STEPS,
  formatArm,
  formatUsd,
  readAllocation,
  readDirectLedger,
  readUnlockSnapshot,
  type FoundAllocation,
  type LedgerRow,
  type UnlockSnapshot,
} from '@/lib/armAllocation'
import { burstAllocationConfetti } from './allocationConfetti'
import styles from './ArmAllocation.module.css'

const SITE_URL = 'https://armada.blue'
const CROWDFUND_URL = 'https://fund.armada.blue'
const DRONE_VIDEO = '/videos/drone-360.mp4'
const COIN_VIDEO = '/videos/coin-spin.mp4'
const FADE_MS = 220
const REVENUE_LOCKED_ARM = 2_400_000

type Phase = 'form' | 'loading' | 'result'

type Lookup =
  | { status: 'idle' }
  | { status: 'invalid' }
  | { status: 'error' }
  | { status: 'empty'; address: string }
  | { status: 'found'; position: FoundAllocation }

function wait(ms: number) {
  const reduce =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) return Promise.resolve()
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function whenCoinReady(video: HTMLVideoElement | null): Promise<void> {
  if (!video || video.canPlayType('video/mp4') === '') return Promise.resolve()
  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      video.removeEventListener('canplay', finish)
      video.removeEventListener('error', finish)
      resolve()
    }
    video.addEventListener('canplay', finish)
    video.addEventListener('error', finish)
    video.load()
  })
}

type LedgerState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: LedgerRow[] }

function cascadeIndex(index: number): CSSProperties {
  return { '--cascade-index': index } as CSSProperties
}

function useEnterCascade<T extends HTMLElement>(immediate: boolean) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const reveal = () => setVisible(true)

    if (reduced || immediate) {
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(reveal)
      })
      return () => window.cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(reveal)
        })
        observer.disconnect()
      },
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(root)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [immediate])

  return {
    ref,
    className: visible ? `${styles.cascade} ${styles.cascadeVisible}` : styles.cascade,
  }
}

function Cascade({
  immediate = false,
  className,
  children,
}: {
  immediate?: boolean
  className?: string
  children: ReactNode
}) {
  const enter = useEnterCascade<HTMLDivElement>(immediate)
  return (
    <div ref={enter.ref} className={[enter.className, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

export function ArmAllocation() {
  const addressId = useId()
  const errorId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const [panelLock, setPanelLock] = useState<number | null>(null)
  const coinPreloadRef = useRef<HTMLVideoElement>(null)
  const [address, setAddress] = useState('')
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' })
  const [phase, setPhase] = useState<Phase>('form')
  const [panelOut, setPanelOut] = useState(false)
  const [showCoin, setShowCoin] = useState(false)
  const [snapshot, setSnapshot] = useState<UnlockSnapshot | null>(null)
  const [ledgerQuery, setLedgerQuery] = useState('')
  const [ledger, setLedger] = useState<LedgerState>({ status: 'loading' })

  useEffect(() => {
    const previous = document.title
    document.title = 'Your ARM allocation — Armada'
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => {
      document.title = previous
      robots.remove()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    readDirectLedger()
      .then((rows) => {
        if (!cancelled) setLedger({ status: 'ready', rows })
      })
      .catch(() => {
        if (!cancelled) setLedger({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    readUnlockSnapshot()
      .then((next) => {
        if (!cancelled) setSnapshot(next)
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (phase !== 'result') return
    resultRef.current?.focus()
  }, [phase, lookup])

  useEffect(() => {
    if (phase !== 'result' || lookup.status !== 'found') return
    const origin = panelRef.current
    const confettiClass = styles.confetti
    if (!origin || !confettiClass) return
    return burstAllocationConfetti(origin, confettiClass)
  }, [phase, lookup])

  const requestId = useRef(0)

  async function checkAddress(raw: string) {
    const next = raw.trim()
    if (!isEvmAddress(next)) {
      setLookup({ status: 'invalid' })
      return
    }
    const id = requestId.current + 1
    requestId.current = id
    setPanelOut(true)
    await wait(FADE_MS)
    if (requestId.current !== id) return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 720px)').matches) {
      const height = panelRef.current?.offsetHeight
      if (height) setPanelLock(height)
    }
    setPhase('loading')
    setPanelOut(false)
    try {
      const read = await Promise.all([readAllocation(next), whenCoinReady(coinPreloadRef.current)]).then(
        ([value]) => value,
      )
      if (requestId.current !== id) return
      setLookup(
        read.status === 'empty'
          ? { status: 'empty', address: read.address }
          : { status: 'found', position: read },
      )
      setPanelOut(true)
      await wait(FADE_MS)
      if (requestId.current !== id) return
      setShowCoin(true)
      setPhase('result')
      setPanelOut(false)
    } catch {
      if (requestId.current !== id) return
      setLookup({ status: 'error' })
      setPanelOut(true)
      await wait(FADE_MS)
      if (requestId.current !== id) return
      setPhase('form')
      setShowCoin(false)
      setPanelLock(null)
      setPanelOut(false)
    }
  }

  function onAddressChange(value: string) {
    setAddress(value)
    if (lookup.status === 'invalid' || lookup.status === 'error') setLookup({ status: 'idle' })
  }

  function goBack() {
    requestId.current += 1
    setShowCoin(false)
    setLookup({ status: 'idle' })
    setPhase('form')
    setPanelLock(null)
    setPanelOut(false)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void checkAddress(address)
  }

  const resultAddress =
    lookup.status === 'found' ? lookup.position.address : lookup.status === 'empty' ? lookup.address : null

  return (
    <div className={styles.page}>
      <div className={styles.stage}>
        <header className={styles.header}>
          <a className={styles.brand} href={SITE_URL} aria-label="Armada">
            <ArmadaLogo variant="full" markTone="deep" />
          </a>
          <a className={styles.openApp} href={CROWDFUND_URL}>
            Go to crowdfund
          </a>
        </header>

        <section className={styles.hero} aria-labelledby="allocation-title">
          <div className={styles.split}>
            <div className={styles.media}>
              <video
                key={showCoin ? 'coin' : 'drone'}
                className={styles.video}
                src={showCoin ? COIN_VIDEO : DRONE_VIDEO}
                autoPlay={typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches}
                muted
                loop
                playsInline
                aria-hidden="true"
              />
              <div className={styles.videoShade} aria-hidden="true" />
              <video ref={coinPreloadRef} className={styles.preload} src={COIN_VIDEO} preload="none" muted playsInline />
            </div>
            <div
              ref={panelRef}
              className={`${styles.panel} ${phase === 'result' ? styles.panelResult : ''}`}
              style={panelLock ? ({ '--panel-lock': `${panelLock}px` } as CSSProperties) : undefined}
            >
              <div
                ref={phase === 'result' ? resultRef : undefined}
                className={styles.panelBody}
                data-out={panelOut ? 'true' : 'false'}
                tabIndex={phase === 'result' ? -1 : undefined}
              >
                {phase === 'loading' ? (
                  <div className={styles.spinnerWrap} role="status">
                    <span className={styles.spinner} />
                    <span className={styles.srOnly}>Checking this address.</span>
                  </div>
                ) : null}
                {phase === 'form' ? (
                  <Cascade immediate className={styles.panelCopy}>
                    <div className={styles.panelIntro}>
                      <Text as="p" variant="ui-label-tag" className={styles.eyebrow} data-cascade="" style={cascadeIndex(0)}>
                        <span className={styles.eyebrowDesktop}>ARM token launch</span>
                        <span className={styles.eyebrowMobile}>Revenue-locked ARM</span>
                      </Text>
                      <Text as="h1" variant="display-xl" id="allocation-title" className={styles.panelTitle} data-cascade="" style={cascadeIndex(1)}>
                        Check your ARM allocation, sailor.
                      </Text>
                      <Text as="p" variant="ui-body-sm" className={styles.lede} data-cascade="" style={cascadeIndex(2)}>
                        {'This checks a revenue-locked allocation,'}
                        <br />
                        {'not a crowdfund purchase.'}
                      </Text>
                    </div>
                    <form className={styles.lookup} onSubmit={onSubmit} aria-label="Check your allocation" data-cascade="" style={cascadeIndex(3)}>
                      <label className={styles.srOnly} htmlFor={addressId}>
                        Wallet or Safe address
                      </label>
                      <div className={styles.lookupRow}>
                        <input
                          id={addressId}
                          className={styles.input}
                          value={address}
                          onChange={(event) => onAddressChange(event.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Paste address"
                          aria-invalid={lookup.status === 'invalid' || lookup.status === 'error'}
                          aria-describedby={lookup.status === 'invalid' || lookup.status === 'error' ? errorId : undefined}
                        />
                        <button type="submit" className={styles.check} aria-label="Check allocation">
                          <ArrowRightIcon aria-hidden="true" />
                        </button>
                      </div>
                      {lookup.status === 'invalid' ? (
                        <p id={errorId} className={styles.error} role="alert">
                          Enter a valid Ethereum address.
                        </p>
                      ) : null}
                      {lookup.status === 'error' ? (
                        <p id={errorId} className={styles.error} role="alert">
                          Could not read this address from Ethereum. Try again.
                        </p>
                      ) : null}
                    </form>
                  </Cascade>
                ) : null}
                {phase === 'result' ? (
                  <Cascade immediate className={styles.resultEnter}>
                    <div className={styles.resultBar} data-cascade="" style={cascadeIndex(0)}>
                      <button type="button" className={styles.back} onClick={goBack} aria-label="Back">
                        <ArrowLeft aria-hidden="true" />
                      </button>
                      {resultAddress ? <AddressCopy address={resultAddress} /> : null}
                    </div>
                    <Text as="h1" variant="display-hero-sm" id="allocation-title" className={styles.srOnly}>
                      Check your ARM allocation, sailor.
                    </Text>
                    {lookup.status === 'empty' ? (
                      <div data-cascade="" style={cascadeIndex(1)}>
                        <EmptyResult />
                      </div>
                    ) : null}
                    {lookup.status === 'found' ? (
                      <FoundResult position={lookup.position} snapshot={snapshot} />
                    ) : null}
                  </Cascade>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      <main className={styles.below}>
          <dl className={styles.liveStrip}>
            <div>
              <dt>Protocol revenue</dt>
              <dd>{snapshot ? formatUsd(snapshot.revenueUsd) : '—'}</dd>
            </div>
            <div>
              <dt>Unlocked</dt>
              <dd>{snapshot ? `${snapshot.unlockBps / 100}%` : '—'}</dd>
            </div>
            <div className={styles.liveNext}>
              <dt>Next unlock</dt>
              <dd>
                {snapshot ? (snapshot.next ? `${formatUsd(snapshot.next.usd)} revenue` : 'Fully unlocked') : '—'}
              </dd>
            </div>
          </dl>
          <section className={`${styles.card} ${styles.supplyShell} ${styles.splitSection}`} id="how-arm-is-split" aria-labelledby="split-title">
            <Text as="h2" variant="ui-heading-sm" id="split-title" className={styles.srOnly}>
              How ARM is split
            </Text>
            <div className={styles.supplySplit}>
              <div className={`${styles.supplyCol} ${styles.supplyPieCol}`}>
                <div className={styles.supplyHead}>
                  <Text as="p" variant="ui-label-md" className={styles.muted}>
                    ARM total supply
                  </Text>
                  <Text as="p" variant="display-lg" className={styles.supplyAmount}>
                    12,000,000 ARM
                  </Text>
                </div>
                <SupplyPie />
                <ul className={styles.splitLabels}>
                  <SplitLabel swatch="treasury" name="Treasury" detail="7.8M · 65%" />
                  <SplitLabel swatch="rev" name="Revenue-locked" detail="2.4M · 20%" />
                  <SplitLabel swatch="crowd" name="Crowdfund" detail="up to 1.8M · 15%" />
                </ul>
              </div>
              <div className={styles.supplyCol}>
                <div className={`${styles.supplyHead} ${styles.supplyHeadCenter}`}>
                  <Text as="p" variant="ui-label-md" className={styles.muted}>
                    Revenue-locked breakdown
                  </Text>
                  <Text as="p" variant="display-lg" className={styles.supplyAmount}>
                    2,400,000 ARM
                  </Text>
                </div>
                <ul className={styles.revBars}>
                  <RevBar swatch="team" name="Launch team" amount="1,992,950" pct="16.61%" width="83.04%" />
                  <RevBar swatch="airdrop" name="Airdrop" amount="324,850" pct="2.71%" width="13.54%" />
                  <RevBar swatch="contrib" name="Contributors and advisors" amount="82,200" pct="0.69%" width="3.42%" />
                  <RevBar swatch="guild" name="Protocol Guild" amount="120,000" pct="1%" width="5%" />
                  <RevBar swatch="w3pn" name="w3pn" amount="30,000" pct="0.25%" width="1.25%" />
                </ul>
              </div>
            </div>
              <div className={styles.compareBlock}>
                <div className={styles.sectionHead}>
                  <Text as="h3" variant="ui-heading-sm" id="compare-title">
                    Revenue-locked and crowdfund
                  </Text>
                  <Text as="p" variant="ui-body-sm" className={styles.muted}>
                    Revenue-locked and crowdfund allocations are the same ARM token. The difference is when it
                    unlocks: revenue-locked ARM is released in steps as Armada earns protocol revenue, and crowdfund
                    ARM unlocks at launch.
                  </Text>
                </div>
                <div className={styles.tableScroll}>
                  <table className={styles.compare} aria-labelledby="compare-title">
                    <thead>
                    <tr>
                      <th scope="col">ARM token</th>
                      <th scope="col">Revenue-locked</th>
                      <th scope="col">Crowdfund</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Who gets it</th>
                      <td>Launch team, airdrop, contributors, advisors</td>
                      <td>Crowdfund buyers</td>
                    </tr>
                    <tr>
                      <th scope="row">Unlocks</th>
                      <td>At protocol-revenue milestones</td>
                      <td>At launch</td>
                    </tr>
                    <tr>
                      <th scope="row">Voting</th>
                      <td>Once released</td>
                      <td>Once claimed</td>
                    </tr>
                  </tbody>
                </table>
                </div>
                <Text as="p" variant="ui-body-sm" className={styles.footnote}>
                  Any ARM the crowdfund doesn’t sell goes back to the treasury, and 402,950 revenue-locked ARM is set
                  aside for future contributors. Transfers stay off for everyone until they’re turned on.
                </Text>
              </div>
          </section>

          <section className={`${styles.card} ${styles.supplyShell} ${styles.unlockSection}`} id="how-it-unlocks" aria-labelledby="unlock-title">
            <div className={styles.unlockPanel}>
            <div className={styles.sectionHead}>
              <Text as="h2" variant="ui-heading-lg" id="unlock-title">
                How it unlocks
              </Text>
              <Text as="p" variant="ui-body-sm" className={styles.muted}>
                Unlocks follow Armada’s total protocol revenue, not time. $1M unlocks everything.
              </Text>
            </div>
              <div className={styles.stair} aria-hidden="true">
                {[{ revenue: '$0', pct: 0, bps: 0 }, ...ARM_UNLOCK_STEPS].map((step) => {
                  const reached = step.bps > 0 && snapshot != null && snapshot.unlockBps >= step.bps
                  const arm = (REVENUE_LOCKED_ARM * step.pct) / 100
                  return (
                    <div key={step.revenue} className={reached ? `${styles.stepCol} ${styles.stepColHit}` : styles.stepCol}>
                      <span className={styles.stepVal}>
                        <span>{step.pct}%</span>
                        <span className={styles.stepArm}>{formatArm(arm)} ARM</span>
                      </span>
                      <span className={styles.stepBar} style={{ height: `${step.pct * 0.78}%` }} />
                    </div>
                  )
                })}
              </div>
              <div className={styles.stepAxis} aria-hidden="true">
                {['$0', ...ARM_UNLOCK_STEPS.map((step) => step.revenue)].map((revenue) => (
                  <span key={revenue}>{revenue}</span>
                ))}
              </div>
              <ol className={styles.stepList}>
                {[{ revenue: '$0', pct: 0, bps: 0 }, ...ARM_UNLOCK_STEPS].map((step) => (
                  <li key={step.revenue} className={step.bps > 0 && snapshot && snapshot.unlockBps >= step.bps ? styles.scheduleHit : undefined}>
                    <span>{step.revenue} revenue</span>
                    <span>
                      {step.pct}% · {formatArm((REVENUE_LOCKED_ARM * step.pct) / 100)} ARM
                    </span>
                    {step.bps > 0 && snapshot && snapshot.unlockBps >= step.bps ? (
                      <span className={styles.reached}>Reached</span>
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className={`${styles.card} ${styles.detailCard}`} aria-labelledby="detail-title">
            <Text as="h2" variant="ui-heading-lg" id="detail-title">
              More detail
            </Text>
            <div className={styles.detailStack}>
            <Disclosure summary="Direct allocations">
              <div className={styles.ledgerTools}>
                <div className={styles.searchField}>
                  <label className={styles.fieldLabel} htmlFor="ledger-search">
                    Search allocations
                  </label>
                  <input
                    id="ledger-search"
                    className={styles.search}
                    value={ledgerQuery}
                    onChange={(event) => setLedgerQuery(event.target.value)}
                    placeholder="Address or label"
                  />
                </div>
              </div>
              <div className={`${styles.tableScroll} ${styles.ledgerScroll}`} tabIndex={0} aria-label="Direct allocations">
                <table className={styles.ledger}>
                  <caption className={styles.srOnly}>Direct allocations</caption>
                  <thead>
                    <tr>
                      <th scope="col">Recipient</th>
                      <th scope="col">Allocation</th>
                      <th scope="col">Unlocked</th>
                      <th scope="col">Claimed</th>
                      <th scope="col">Available</th>
                      <th scope="col">Locked</th>
                    </tr>
                  </thead>
                  <tbody>
                    <LedgerBody query={ledgerQuery} ledger={ledger} />
                  </tbody>
                </table>
              </div>
            </Disclosure>

            <Disclosure summary="Revenue and claim history">
              <div className={styles.twoCol}>
                <div>
                  <Text as="h3" variant="ui-heading-sm">
                    Revenue and unlocks
                  </Text>
                  <p className={styles.emptyCopy}>No events yet. History loads from Ethereum.</p>
                </div>
                <div>
                  <Text as="h3" variant="ui-heading-sm">
                    Claims
                  </Text>
                  <p className={styles.emptyCopy}>No claims yet. History loads from Ethereum.</p>
                </div>
              </div>
            </Disclosure>

            <Disclosure summary="How the contracts work">
              <Text as="p" variant="ui-body-lg" className={styles.contractLead}>
                The launch RevenueLock is immutable. Unlock percentages advance as cumulative protocol revenue
                crosses fixed milestones.
              </Text>
              <ol className={styles.contracts}>
                <li>
                  <span className={styles.stepNum}>1</span>
                  <span>
                    <strong>Revenue is recognized</strong>
                    <span>RevenueCounter tracks cumulative protocol revenue.</span>
                  </span>
                </li>
                <li>
                  <span className={styles.stepNum}>2</span>
                  <span>
                    <strong>The schedule advances</strong>
                    <span>RevenueLock observes revenue and only moves upward.</span>
                  </span>
                </li>
                <li>
                  <span className={styles.stepNum}>3</span>
                  <span>
                    <strong>ARM becomes releasable</strong>
                    <span>Recipients release or claim the newly unlocked portion.</span>
                  </span>
                </li>
              </ol>
            </Disclosure>
            </div>
          </section>

          <footer className={styles.footer}>
            <Text as="p" variant="ui-body-sm" className={styles.muted}>
              Data is read from Ethereum mainnet.
            </Text>
            <div className={styles.footerLinks}>
              <a className={styles.textLink} href={ARM_DISTRIBUTOR_URL} target="_blank" rel="noopener noreferrer">
                Reserve distributor
                <ArrowUpRight aria-hidden="true" />
                <span className={styles.srOnly}> (opens in a new tab)</span>
              </a>
              {snapshot?.lockAddress ? (
                <a
                  className={styles.textLink}
                  href={`https://etherscan.io/address/${snapshot.lockAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  RevenueLock
                  <ArrowUpRight aria-hidden="true" />
                  <span className={styles.srOnly}> (opens in a new tab)</span>
                </a>
              ) : null}
            </div>
          </footer>
      </main>
    </div>
  )
}

function AddressCopy({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(id)
  }, [copied])

  return (
    <>
      <button
        type="button"
        className={styles.addressPill}
        aria-label={copied ? `Copied ${address}` : `Copy ${address}`}
        onClick={() => {
          void navigator.clipboard.writeText(address).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }}
      >
        {copied ? 'Copied' : truncateAddress(address)}
      </button>
      <span className={styles.srOnly} role="status">
        {copied ? 'Address copied' : ''}
      </span>
    </>
  )
}

function EmptyResult() {
  return (
    <>
      <Text as="h2" variant="ui-heading-sm">
        No allocation found
      </Text>
      <Text as="p" variant="ui-body-lg" className={styles.lede}>
        This only checks revenue-locked ARM. Crowdfund ARM isn’t shown here.
      </Text>
      <a className={styles.textLink} href="#how-arm-is-split">
        What’s the difference?
      </a>
    </>
  )
}

function FoundResult({
  position,
  snapshot,
}: {
  position: FoundAllocation
  snapshot: UnlockSnapshot | null
}) {
  return (
    <div className={styles.found}>
      <div className={styles.resultMain}>
        <div className={styles.resultIntro}>
          <Text as="h2" variant="ui-heading-sm" className={styles.srOnly}>
            Allocation found
          </Text>
          {/* TODO: cohort is not on the lock read. Launch team is the label until airdrop and contributor wallets can be told apart. */}
          <p className={styles.cohort} data-cascade="" style={cascadeIndex(1)}>
            <span className={`${styles.swatch} ${styles.team}`} aria-hidden="true" />
            Launch team allocation
          </p>
          <p className={styles.amount} data-cascade="" style={cascadeIndex(2)}>
            <RollingBalanceValue
              className={styles.amountValue}
              value={formatArm(position.total)}
              rollStartMs={200}
            />
            <span className={styles.amountUnit}>ARM</span>
          </p>
        </div>
        <dl className={styles.stats} data-cascade="" style={cascadeIndex(3)}>
          <div>
            <dt>Unlocked</dt>
            <dd>{formatArm(position.unlocked)} ARM</dd>
          </div>
          <div>
            <dt>Locked</dt>
            <dd>{formatArm(position.locked)} ARM</dd>
          </div>
        </dl>
      </div>
      <div data-cascade="" style={cascadeIndex(4)}>
        <Schedule position={position} snapshot={snapshot} />
      </div>
    </div>
  )
}

function useMobileLayout() {
  const query = '(max-width: 720px)'
  const [mobile, setMobile] = useState(() => {
    if (typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return mobile
}

function Schedule({
  position,
  snapshot,
}: {
  position: FoundAllocation
  snapshot: UnlockSnapshot | null
}) {
  const mobile = useMobileLayout()
  const chart = (
    <>
      <LineChart total={position.total} unlockBps={snapshot?.unlockBps ?? null} />
      <ol className={styles.scheduleList}>
        {ARM_UNLOCK_STEPS.map((step) => {
          const arm = (position.total * step.pct) / 100
          const reached = snapshot ? snapshot.unlockBps >= step.bps : false
          return (
            <li key={step.revenue} className={reached ? styles.scheduleHit : undefined}>
              <span>{step.revenue} revenue</span>
              <span>{formatArm(arm)} ARM</span>
              {reached ? <span className={styles.reached}>Reached</span> : <span />}
            </li>
          )
        })}
      </ol>
    </>
  )

  if (!mobile) {
    return (
      <div className={styles.schedule}>
        <Text as="p" variant="ui-body-sm" className={styles.scheduleLabel}>
          Your ARM unlock schedule based on project revenue
        </Text>
        {chart}
      </div>
    )
  }

  return (
    <details className={styles.schedule}>
      <summary className={`${styles.scheduleLabel} ${styles.scheduleSummary}`}>
        View your unlock schedule
        <ChevronDown className={styles.scheduleChevron} aria-hidden="true" />
      </summary>
      <Text as="p" variant="ui-body-sm" className={`${styles.scheduleLabel} ${styles.scheduleCaption}`}>
        Your ARM unlock schedule based on project revenue
      </Text>
      {chart}
    </details>
  )
}

function unlockPosition(bps: number | null): number {
  if (bps == null || bps <= 0) return 0
  const points = [0, ...ARM_UNLOCK_STEPS.map((step) => step.bps)]
  const last = points[points.length - 1] ?? 0
  const segments = points.length - 1
  if (segments <= 0 || bps >= last) return 100
  let index = 0
  while (index < segments) {
    const next = points[index + 1]
    if (next == null || bps < next) break
    index += 1
  }
  const lo = points[index] ?? 0
  const hi = points[index + 1] ?? lo
  const span = hi - lo
  const fraction = span === 0 ? 0 : Math.max(0, Math.min(1, (bps - lo) / span))
  return ((index + fraction) / segments) * 100
}

function LineChart({ total, unlockBps }: { total: number; unlockBps: number | null }) {
  const entered = unlockBps != null && unlockBps > 0
  const nextIndex = entered ? ARM_UNLOCK_STEPS.findIndex((step) => unlockBps < step.bps) : -1
  const nodes = [
    { revenue: '$0', pct: 0, bps: 0, stepIndex: null as number | null },
    ...ARM_UNLOCK_STEPS.map((step, index) => ({ ...step, stepIndex: index })),
  ]
  const last = nodes.length - 1
  const points = nodes.map((node, index) => ({ ...node, x: (index / last) * 100 }))
  const edge = (index: number) => (index === 0 ? 'start' : index === last ? 'end' : 'mid')
  const fill = unlockPosition(unlockBps)
  const minorPerSegment = 4
  const minorSteps = last * minorPerSegment
  const minorTicks = Array.from({ length: minorSteps - 1 }, (_, index) => index + 1).filter(
    (step) => step % minorPerSegment !== 0,
  )

  return (
    <div className={styles.lineChart} aria-hidden="true">
      <div className={styles.lineLabels}>
        {points.map((point, index) => {
          const reached = point.stepIndex === null ? entered : unlockBps != null && unlockBps >= point.bps
          const state = reached ? 'reached' : point.stepIndex === nextIndex ? 'next' : 'later'
          const arm = point.stepIndex === null ? 0 : (total * point.pct) / 100
          return (
            <span
              key={point.revenue}
              className={styles.lineAmt}
              data-state={state}
              data-edge={edge(index)}
              style={{ left: `${point.x}%` }}
            >
              {formatArm(arm)}
            </span>
          )
        })}
      </div>
      <div className={styles.linePlot}>
        <div className={styles.tickTrack}>
          {minorTicks.map((step) => (
            <span key={step} className={styles.minorTick} style={{ left: `${(step / minorSteps) * 100}%` }} />
          ))}
          {fill > 0 ? <div className={styles.tickFill} style={{ width: `${fill}%` }} /> : null}
        </div>
        {points.map((point, index) => (
          <span
            key={point.revenue}
            className={styles.lineTick}
            data-edge={edge(index)}
            style={{ left: `${point.x}%` }}
          />
        ))}
      </div>
      <div className={styles.lineLabels}>
        {points.map((point, index) => (
          <span key={point.revenue} className={styles.lineRev} data-edge={edge(index)} style={{ left: `${point.x}%` }}>
            {point.revenue}
          </span>
        ))}
      </div>
    </div>
  )
}

function ringPoint(radius: number, pct: number) {
  const angle = (pct / 100) * Math.PI * 2
  return {
    x: 50 + radius * Math.sin(angle),
    y: 50 - radius * Math.cos(angle),
  }
}

function SupplyPie() {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const slices = [
    { name: 'Treasury', pct: 65, className: styles.pieTreasury },
    { name: 'Revenue-locked', pct: 20, className: styles.pieRev },
    { name: 'Crowdfund', pct: 15, className: styles.pieCrowd },
  ]
  const revStart = ringPoint(radius, 65)
  const revEnd = ringPoint(radius, 85)
  let start = 0
  return (
    <svg
      className={styles.pie}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Treasury 65 percent, Revenue-locked 20 percent, Crowdfund up to 15 percent"
    >
      <defs>
        <linearGradient
          id="arm-revenue-gradient"
          gradientUnits="userSpaceOnUse"
          x1={revStart.x}
          y1={revStart.y}
          x2={revEnd.x}
          y2={revEnd.y}
        >
          <stop offset="0%" stopColor="var(--semantic-color-brand-lavender)" />
          <stop offset="52%" stopColor="var(--semantic-color-brand-gradient-rose)" />
          <stop offset="100%" stopColor="var(--semantic-color-brand-amber)" />
        </linearGradient>
      </defs>
      {slices.map((slice) => {
        const length = (slice.pct / 100) * circumference
        const dashOffset = circumference * 0.25 - (start / 100) * circumference
        start += slice.pct
        return (
          <circle
            key={slice.name}
            className={`${styles.pieRing} ${slice.className}`}
            cx="50"
            cy="50"
            r={radius}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={dashOffset}
          />
        )
      })}
    </svg>
  )
}

function RevBar({
  swatch,
  name,
  amount,
  pct,
  width,
}: {
  swatch: 'team' | 'airdrop' | 'contrib' | 'guild' | 'w3pn'
  name: string
  amount: string
  pct: string
  width: string
}) {
  const swatchClass = {
    team: styles.team,
    airdrop: styles.airdrop,
    contrib: styles.contrib,
    guild: styles.guild,
    w3pn: styles.w3pn,
  }[swatch]
  return (
    <li>
      <div className={styles.revMeta}>
        <span className={styles.splitName}>{name}</span>
        <span className={styles.revFigures}>
          <span>{amount} ARM</span>
          <span className={styles.muted}>{pct}</span>
        </span>
      </div>
      <div className={styles.revTrack} aria-hidden="true">
        <span className={`${styles.revFill} ${swatchClass}`} style={{ width }} />
      </div>
    </li>
  )
}

function SplitLabel({
  swatch,
  name,
  detail,
}: {
  swatch: 'treasury' | 'crowd' | 'rev' | 'team' | 'airdrop' | 'contrib'
  name: string
  detail: string
}) {
  const swatchClass = {
    treasury: styles.treasury,
    crowd: styles.crowd,
    rev: styles.rev,
    team: styles.team,
    airdrop: styles.airdrop,
    contrib: styles.contrib,
  }[swatch]

  return (
    <li>
      <span className={styles.splitNameRow}>
        <span className={`${styles.swatch} ${swatchClass}`} aria-hidden="true" />
        <span className={styles.splitName}>{name}</span>
      </span>
      <span className={styles.splitDetail}>{detail}</span>
    </li>
  )
}

function LedgerBody({
  query,
  ledger,
}: {
  query: string
  ledger: LedgerState
}) {
  if (ledger.status === 'loading') {
    return (
      <tr>
        <td colSpan={6} className={styles.emptyCell} role="status">
          Loading allocations from Ethereum.
        </td>
      </tr>
    )
  }
  if (ledger.status === 'error') {
    return (
      <tr>
        <td colSpan={6} className={styles.emptyCell} role="alert">
          Could not load the public list from Ethereum.
        </td>
      </tr>
    )
  }
  const needle = query.trim().toLowerCase()
  const rows = needle === '' ? ledger.rows : ledger.rows.filter((row) => row.address.toLowerCase().includes(needle))
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={6} className={styles.emptyCell}>
          {ledger.rows.length === 0 ? 'No direct allocations are on the lock.' : 'No allocation matches that address.'}
        </td>
      </tr>
    )
  }
  return rows.map((row) => (
    <tr key={row.address}>
      <th scope="row" className={styles.addressLine}>
        {row.address}
      </th>
      <td>{formatArm(row.total)}</td>
      <td>{formatArm(row.unlocked)}</td>
      <td>{formatArm(row.claimed)}</td>
      <td>{formatArm(row.available)}</td>
      <td>{formatArm(row.locked)}</td>
    </tr>
  ))
}

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className={styles.disclosure}>
      <summary className={styles.summary}>
        <Text as="span" variant="ui-heading-sm">
          {summary}
        </Text>
        <ChevronDown className={styles.chevron} aria-hidden="true" size={18} />
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  )
}
