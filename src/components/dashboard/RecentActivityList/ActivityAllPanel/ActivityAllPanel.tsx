// ABOUTME: "All activity" panel — SidePanel (desktop) / BottomSheet (mobile) with search + kind-filter toolbar.
// ABOUTME: Renders a full RecentActivityList filtered by the search (hash / address / amount) and kind chip; no matches offers "Clear filters".

import { useEffect, useMemo, useState } from 'react'
import { SidePanel, BottomSheet } from '@/design'
import type { DashboardActivityItem } from '@/components/dashboard/txActivityAdapter'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { matchesActivityKindFilter, matchesActivitySearch } from '@/components/dashboard/activityFilters'
import { ActivityKindFilters, type ActivityKindFilter } from '../ActivityKindFilters'
import { ActivitySearch } from '../ActivitySearch'
import searchStyles from '../ActivitySearch/ActivitySearch.module.css'
import { RecentActivityList } from '../RecentActivityList'
import panelStyles from './ActivityAllPanel.module.css'

export interface ActivityAllPanelProps {
  open: boolean
  onClose: () => void
  items: readonly DashboardActivityItem[]
  /** When set, the list was capped to this many rows — surfaces a "showing latest N" note. */
  truncatedCount?: number
  balanceRevealed?: boolean
  onItemClick?: (item: DashboardActivityItem) => void
}

export function ActivityAllPanel({
  open,
  onClose,
  items,
  truncatedCount,
  balanceRevealed = true,
  onItemClick,
}: ActivityAllPanelProps) {
  const isMobile = useMobileLayout()
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>('all')

  useEffect(() => {
    if (!open) {
      setQuery('')
      setKindFilter('all')
    }
  }, [open])

  function clearFilters() {
    setQuery('')
    setKindFilter('all')
  }

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          // Hidden balances: a typed number never matches an amount, so searching can't reveal one.
          matchesActivitySearch(item, query, { amounts: balanceRevealed }) && matchesActivityKindFilter(item, kindFilter),
      ),
    [items, query, kindFilter, balanceRevealed],
  )

  const hasActiveFilters = query.trim().length > 0 || kindFilter !== 'all'
  const showFilterEmpty = hasActiveFilters && filteredItems.length === 0

  function handleItemClick(item: DashboardActivityItem) {
    onItemClick?.(item)
    onClose()
  }

  const list = (
    <>
      <div className={panelStyles.chrome}>
        <ActivitySearch value={query} onChange={setQuery} amountsSearchable={balanceRevealed} />
        <ActivityKindFilters value={kindFilter} onChange={setKindFilter} />
      </div>
      <div className={panelStyles.listRegion}>
        {showFilterEmpty ? (
          <div className={searchStyles.searchEmpty}>
            <p>No transactions match your filters.</p>
            <button type="button" className={searchStyles.clearFilters} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <RecentActivityList
            variant="full"
            items={filteredItems}
            balanceRevealed={balanceRevealed}
            onItemClick={handleItemClick}
          />
        )}
        {truncatedCount != null ? (
          <p className={panelStyles.truncationNote}>
            Showing your {truncatedCount} most recent transactions.
          </p>
        ) : null}
      </div>
    </>
  )

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        title="All activity"
        headerClassName={panelStyles.sheetHeader}
        sheetClassName={panelStyles.activitySheet}
        bodyClassName={panelStyles.activitySheetBody}
      >
        {list}
      </BottomSheet>
    )
  }

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="All activity"
      panelClassName={panelStyles.panel}
      headerClassName={panelStyles.panelHeader}
      bodyClassName={panelStyles.panelBody}
    >
      {list}
    </SidePanel>
  )
}
