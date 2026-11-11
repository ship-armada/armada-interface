// ABOUTME: Address book page — parked placeholder. Linked from nowhere until built; the route is still reachable.
// ABOUTME: Renders an "Address book" empty state; see docs/ARCHITECTURE.md §12 (pages and routes).

export function AddressBook() {
  return (
    <div className="w-full max-w-3xl px-6 text-center">
      <h1 style={{ fontFamily: 'Charis SIL, serif', fontSize: 44, lineHeight: 1.1 }}>
        Address book
      </h1>
      <p className="mt-4 text-muted-foreground">
        Coming later. This page will store named EVM and shielded addresses for repeat payments.
      </p>
    </div>
  )
}
