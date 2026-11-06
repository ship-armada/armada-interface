# pages/

Top-level route components. Each is a thin shell that composes header chrome (from `AppLayout`) + page content (from `components/`).

| Page | Route | Purpose |
|---|---|---|
| `Dashboard.tsx` | `/` | Balance overview + action triggers (shield/unshield/yield/pay modals); hosts the "all activity" panel + per-tx receipt overlay. Locked → only `SignInCard` (no activity, no banners); first sync loading → `SyncCard` in the balance spot |
| `AddressBook.tsx` | `/address-book` | Parked placeholder — not in nav until built |
| `Debug.tsx` | `/debug` | Developer panel — contract addresses, per-chain balances, Tx timings (`debug/TxTimings`: p50 / p90 per kind and stage from local history, plus this session's balance-lag and sign-in → balance samples), the tx-notice preview (`debug/TxNoticePreview`: the toast / header-pill style, same preference as Settings, + sample outcome notices). Faucet drip column appears only in local mode (no faucet contracts on Sepolia). |
| `PayViaLinkLanding.tsx` | `/pay-via-link` | Payer's view of a shared payment-request link. Registered **outside** the `<App>` shell (no wallet gate) so an un-onboarded payer can view it. Validates the link (`parsePayViaLinkSearch`), shows the amount ("Any amount" when the request has none)/note/recipient (shortened with a copy button, `ui/CopyableAddress`) + a QR, then "Check this address with the person who sent you this link." (the link could have been altered on the way); "Continue to pay" writes a pending hand-off + navigates to `/`, where `usePayViaLinkIntent` opens the Send flow prefilled. |

## Conventions

- Pages own page-level effects (data fetches that trigger on navigation). They can use hooks freely.
- Pages compose `components/` and `hooks/`. They should be short — most logic belongs in hooks or `lib/`.
- Route registration lives in `src/main.tsx`. Don't add `<BrowserRouter>` or `<Routes>` inside a page.
- Modal flows are NOT pages. They're components inside `components/<feature>/` that open via `openModalAtom`.

## When you add a page

1. Create the `.tsx` file with an ABOUTME header and a default export of a named function component.
2. Register the route in `src/main.tsx` (`<Route path="..." element={<NewPage />} />`).
3. Add the nav entry in `components/AppLayout.tsx` (`NAV` array) if it should appear in the header.
