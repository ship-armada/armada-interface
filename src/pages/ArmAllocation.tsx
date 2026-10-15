// ABOUTME: Public ARM allocation page — paste an address to read a revenue-locked allocation from Ethereum.
// ABOUTME: Lives outside the signed-in app shell. The public ledger and claim transactions are not wired yet.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { ArmadaLogo, Text } from '@/design'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { isEvmAddress } from '@/lib/address'
import { truncateAddress } from '@/lib/format'
import {
  ARM_DISTRIBUTOR_URL,
  ARM_UNLOCK_STEPS,
  formatArm,
  formatUsd,
  readAllocation,
  readUnlockSnapshot,
  schedulePosition,
  type FoundAllocation,
  type UnlockSnapshot,
} from '@/lib/armAllocation'
import styles from './ArmAllocation.module.css'

const SITE_URL = 'https://armada.blue'
const APP_URL = '/'
const DRONE_VIDEO = '/videos/drone-360.mp4'
const COIN_VIDEO = '/videos/coin-spin.mp4'
const FADE_MS = 220

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

type LedgerFilter = 'all' | 'direct' | 'reserve'

export function ArmAllocation() {
  const addressId = useId()
  const errorId = useId()
  const resultRef = useRef<HTMLDivElement>(null)
  const coinPreloadRef = useRef<HTMLVideoElement>(null)
  const [address, setAddress] = useState('')
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' })
  const [phase, setPhase] = useState<Phase>('form')
  const [panelOut, setPanelOut] = useState(false)
  const [showCoin, setShowCoin] = useState(false)
  const [snapshot, setSnapshot] = useState<UnlockSnapshot | null>(null)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all')
  const [ledgerQuery, setLedgerQuery] = useState('')

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
          <a className={styles.openApp} href={APP_URL}>
            Open App
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
            <div className={`${styles.panel} ${phase === 'result' ? styles.panelResult : ''}`}>
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
                  <div className={styles.panelCopy}>
                    <div className={styles.panelIntro}>
                      <Text as="p" variant="ui-label-tag" className={styles.eyebrow}>
                        <span className={styles.eyebrowDesktop}>ARM token launch</span>
                        <span className={styles.eyebrowMobile}>Revenue-locked ARM</span>
                      </Text>
                      <Text as="h1" variant="display-hero-sm" id="allocation-title" className={styles.panelTitle}>
                        Check your ARM allocation, sailor.
                      </Text>
                    </div>
                    <form className={styles.lookup} onSubmit={onSubmit} aria-label="Check your allocation">
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
                  </div>
                ) : null}
                {phase === 'result' ? (
                  <div className={styles.resultBar}>
                    <button type="button" className={styles.back} onClick={goBack}>
                      <ArrowLeft aria-hidden="true" />
                      Back
                    </button>
                    {resultAddress ? <AddressCopy address={resultAddress} /> : null}
                  </div>
                ) : null}
                {phase === 'result' && lookup.status === 'empty' ? (
                  <>
                    <Text as="h1" variant="display-hero-sm" id="allocation-title" className={styles.srOnly}>
                      Check your ARM allocation, sailor.
                    </Text>
                    <EmptyResult />
                  </>
                ) : null}
                {phase === 'result' && lookup.status === 'found' ? (
                  <>
                    <Text as="h1" variant="display-hero-sm" id="allocation-title" className={styles.srOnly}>
                      Check your ARM allocation, sailor.
                    </Text>
                    <FoundResult position={lookup.position} snapshot={snapshot} />
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      <main className={styles.below}>
          <section className={styles.card} id="how-arm-is-split" aria-labelledby="split-title">
            <Text as="h2" variant="ui-heading-sm" id="split-title" className={styles.srOnly}>
              How ARM is split
            </Text>
            <div className={styles.supplyHead}>
              <Text as="p" variant="ui-label-md" className={styles.muted}>
                ARM total supply
              </Text>
              <Text as="p" variant="display-lg">
                12,000,000 ARM
              </Text>
            </div>
            <div
              className={styles.splitBar}
              role="img"
              aria-label="Treasury 65 percent, Revenue-locked 20 percent, Crowdfund up to 15 percent"
            >
              <span className={styles.segTreasury} />
              <span className={styles.segRev} />
              <span className={styles.segCrowd} />
            </div>
            <ul className={styles.splitLabels}>
              <SplitLabel swatch="treasury" name="Treasury" detail="7.8M · 65%" />
              <SplitLabel swatch="rev" name="Revenue-locked" detail="2.4M · 20%" />
              <SplitLabel swatch="crowd" name="Crowdfund" detail="up to 1.8M · 15%" />
            </ul>
            <div className={styles.subHead}>
              <Text as="h3" variant="ui-heading-sm">
                Revenue-locked
              </Text>
              <Text as="p" variant="ui-body-sm" className={styles.muted}>
                2.4M ARM
              </Text>
            </div>
            <div
              className={styles.subBar}
              role="img"
              aria-label="Revenue-locked 2.4 million: launch team 1,992,950, airdrop 324,850, contributors and advisors 82,200"
            >
              <span className={styles.subTeam} />
              <span className={styles.subAirdrop} />
              <span className={styles.subContrib} />
            </div>
              <ul className={styles.subLabels}>
                <SplitLabel swatch="team" name="Launch team" detail="1,992,950" />
                <SplitLabel swatch="airdrop" name="Airdrop" detail="324,850" />
                <SplitLabel swatch="contrib" name="Contributors and advisors" detail="82,200" />
              </ul>
              <div className={styles.compareBlock}>
                <Text as="h3" variant="ui-heading-sm" id="compare-title">
                  Revenue-locked and crowdfund
                </Text>
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
              </div>
              <Text as="p" variant="ui-body-sm" className={styles.footnote}>
                Unsold crowdfund ARM goes back to the treasury. The revenue-locked pool includes a 402,950 ARM
                reserve for future contributors. Same token either way. Transfers are restricted for everyone until
                they’re enabled.
              </Text>
          </section>

          <section className={styles.card} id="how-it-unlocks" aria-labelledby="unlock-title">
            <div className={styles.sectionHead}>
              <Text as="h2" variant="ui-heading-lg" id="unlock-title">
                How it unlocks
              </Text>
              <Text as="p" variant="ui-body-sm" className={styles.muted}>
                Unlocks follow Armada’s total protocol revenue, not time. $1M unlocks everything.
              </Text>
            </div>
              <Text as="p" variant="ui-label-md" className={styles.muted}>
                % of every revenue-locked allocation
              </Text>
              <div className={styles.stair} aria-hidden="true">
                {ARM_UNLOCK_STEPS.map((step) => {
                  const reached = snapshot != null && snapshot.unlockBps >= step.bps
                  return (
                    <div key={step.revenue} className={reached ? `${styles.stepCol} ${styles.stepColHit}` : styles.stepCol}>
                      <span className={styles.stepVal}>{step.pct}%</span>
                      <span className={styles.stepBar} style={{ height: `${step.pct * 0.78}%` }} />
                    </div>
                  )
                })}
                {snapshot ? (
                  <div
                    className={`${styles.stairToday} ${schedulePosition(snapshot.effectiveRevenueUsd) > 75 ? styles.stairTodayEnd : ''}`}
                    style={{ left: `${schedulePosition(snapshot.effectiveRevenueUsd)}%` }}
                  >
                    <span>Today · {formatUsd(snapshot.revenueUsd)}</span>
                  </div>
                ) : null}
              </div>
              <div className={styles.stepAxis} aria-hidden="true">
                {ARM_UNLOCK_STEPS.map((step) => (
                  <span key={step.revenue}>{step.revenue}</span>
                ))}
              </div>
              <ol className={styles.stepList}>
                {ARM_UNLOCK_STEPS.map((step) => (
                  <li key={step.revenue} className={snapshot && snapshot.unlockBps >= step.bps ? styles.scheduleHit : undefined}>
                    <span>{step.revenue} revenue</span>
                    <span>{step.pct}%</span>
                    {snapshot && snapshot.unlockBps >= step.bps ? (
                      <span className={styles.reached}>Reached</span>
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ol>
              <dl className={styles.liveStrip}>
                <div>
                  <dt>Protocol revenue</dt>
                  <dd>{snapshot ? formatUsd(snapshot.revenueUsd) : '—'}</dd>
                </div>
                <div>
                  <dt>Unlocked</dt>
                  <dd>{snapshot ? `${snapshot.unlockBps / 100}%` : '—'}</dd>
                </div>
                <div>
                  <dt>Next unlock</dt>
                  <dd>
                    {snapshot ? (
                      snapshot.next ? (
                        <>
                          {formatUsd(snapshot.next.usd)} revenue
                          <span className={styles.liveNote}>{formatUsd(snapshot.next.remainingUsd)} to go</span>
                        </>
                      ) : (
                        'Fully unlocked'
                      )
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
              <Text as="p" variant="ui-body-sm" className={styles.footnote}>
                {snapshot ? 'Live from Ethereum.' : 'Reading Ethereum…'}
              </Text>
          </section>

          <section className={styles.card} aria-labelledby="detail-title">
            <Text as="h2" variant="ui-heading-lg" id="detail-title">
              More detail
            </Text>
            <div className={styles.detailStack}>
            <Disclosure summary="All revenue-locked allocations">
              <div className={styles.ledgerTools}>
                <SegmentedControl
                  size="sm"
                  surface="raised"
                  aria-label="Allocation source"
                  value={ledgerFilter}
                  onChange={setLedgerFilter}
                  options={[
                    { id: 'all', label: 'All' },
                    { id: 'direct', label: 'Direct' },
                    { id: 'reserve', label: 'Reserve' },
                  ]}
                />
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
              <div className={styles.tableScroll}>
                <table className={styles.ledger}>
                  <caption className={styles.srOnly}>Revenue-locked allocations</caption>
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
                    <tr>
                      <td colSpan={6} className={styles.emptyCell}>
                        The public list loads from Ethereum. It is not connected yet.
                      </td>
                    </tr>
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
              Labels are metadata, not contract state.
            </Text>
            <a className={styles.textLink} href={ARM_DISTRIBUTOR_URL} target="_blank" rel="noopener noreferrer">
              Reserve distributor on Etherscan
            </a>
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
        <Text as="h2" variant="ui-heading-sm" className={styles.srOnly}>
          Allocation found
        </Text>
        <Text as="p" variant="ui-label-tag" className={styles.eyebrow}>
          Your allocation
        </Text>
        <p className={styles.amount}>
          <span className={styles.amountValue}>{formatArm(position.total)}</span>
          <span className={styles.amountUnit}>ARM</span>
        </p>
        <ul className={styles.tags}>
          <li className={styles.tag}>Revenue-locked</li>
          {/* TODO: cohort is not on the lock read. Launch team is the label until airdrop and contributor wallets can be told apart. */}
          <li className={styles.tag}>Launch team</li>
        </ul>
      </div>
      <div className={styles.resultFoot}>
        <dl className={styles.stats}>
          <div>
            <dt>Unlocked</dt>
            <dd>{formatArm(position.unlocked)} ARM</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>{formatArm(position.available)} ARM</dd>
          </div>
          <div>
            <dt>Locked</dt>
            <dd>{formatArm(position.locked)} ARM</dd>
          </div>
        </dl>
        <div className={styles.schedule}>
          <Text as="p" variant="ui-body-sm" className={styles.scheduleLabel}>
            Your unlock schedule based on project revenue
          </Text>
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
        </div>
      </div>
    </div>
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

  return (
    <div className={styles.lineChart} aria-hidden="true">
      <div className={styles.lineLabels}>
        {points.map((point, index) => {
          const reached = point.stepIndex === null ? entered : unlockBps != null && unlockBps >= point.bps
          const state = reached ? 'reached' : point.stepIndex === nextIndex ? 'next' : 'later'
          return (
            <span
              key={point.revenue}
              className={styles.lineAmt}
              data-state={state}
              data-edge={edge(index)}
              style={{ left: `${point.x}%` }}
            >
              {point.stepIndex === null ? '0' : formatArm((total * point.pct) / 100)}
            </span>
          )
        })}
      </div>
      <div className={styles.linePlot}>
        <div className={styles.tickTrack}>
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
