// ABOUTME: Settings page — Railgun wallet lifecycle (unlock, export, reset), debug toggles, app version.
// ABOUTME: Scaffold placeholder. Real controls arrive with the Railgun wallet pass.

export function Settings() {
  return (
    <div className="w-full max-w-3xl px-6 text-center">
      <h1 style={{ fontFamily: 'Charis SIL, serif', fontSize: 44, lineHeight: 1.1 }}>
        Settings
      </h1>
      <p className="mt-4 text-muted-foreground">
        Wallet unlock and recovery, passphrase change, and reset live here. Debug toggles too.
      </p>
    </div>
  )
}
