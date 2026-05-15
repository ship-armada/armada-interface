// ABOUTME: Address book page — parked placeholder. Removed from nav until built; route is still reachable.
// ABOUTME: Plan §12: "Renders an 'Address book' empty-state placeholder for now; not in the nav until built."

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
