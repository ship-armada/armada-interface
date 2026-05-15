// ABOUTME: Dashboard page — balance overview + action triggers for shield / unshield / yield / pay (modals).
// ABOUTME: Scaffold: renders a placeholder card. Real content arrives with the balance/action passes.

export function Dashboard() {
  return (
    <div className="w-full max-w-3xl px-6 text-center">
      <h1 style={{ fontFamily: 'Charis SIL, serif', fontSize: 44, lineHeight: 1.1 }}>
        Dashboard
      </h1>
      <p className="mt-4 text-muted-foreground">
        Balance overview and quick actions land here. Action flows (shield, unshield, yield, pay) open as modals.
      </p>
    </div>
  )
}
