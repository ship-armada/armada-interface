# components/dashboard/

Dashboard-specific layout pieces. Composed by `pages/Dashboard.tsx`; not generally reusable elsewhere.

## Contents

| Component | Purpose |
|---|---|
| `ActionCard` | Single tile in the action grid — icon + title + subtitle. Click handler supplied by parent. |
| `ActionGrid` | The four ActionCards (Deposit / Withdraw / Send / Earn). Wires each click to `setOpenModal(...)`. |
| `RecentActivityCard` | Terminal-state rows from `txListAtom`, capped at 5, sorted by updatedAt desc. "View all" → `/history`. |
| `InProgressCard` | Non-terminal rows from `pendingTxsAtom`. One row per record with stage copy + progress strip. |

## Conventions

- These components subscribe to atoms directly (one-level read of `txListAtom`, `pendingTxsAtom`) because the dashboard owns the data shape. Deeper components (TxRow, TxStatusChip) stay prop-only.
- Empty states are first-class — never render a card with zero rows and no message.
- `onSelect` is consumer-supplied; default behavior (none) leaves rows non-interactive. For now Dashboard wires it to a noop; later it'll open a detail drawer or navigate.

## Where BalanceHero lives

`BalanceHero` is in `components/balance/`, not here — it's the visual anchor for the page but conceptually a balance-domain component (it could be embedded elsewhere, e.g. Settings or a future portfolio view). Keeping it separate lets the dashboard folder stay focused on dashboard-only chrome.
