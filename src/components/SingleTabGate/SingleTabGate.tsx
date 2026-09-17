// ABOUTME: Full-screen gate shown when another browser tab already holds the shielded scan instance.
// ABOUTME: Armada runs one SDK read instance per origin (concurrent instances corrupt scan state), so a second tab can't load.

import { Button, Text } from '@/design'
import styles from './SingleTabGate.module.css'

/**
 * Rendered at App level when `anotherTabActiveAtom` is set — i.e. the SDK's `IndexedDBStorageAdapter`
 * refused to open the shielded scan DB because another live instance in this origin holds it (a second
 * tab). Concurrent instances corrupt scan state, so the SDK enforces one per origin; we turn that hard
 * error into a clear "use the other tab" screen. Reload re-attempts a clean init (works once the other
 * tab is closed).
 */
export function SingleTabGate() {
  return (
    <div className={styles.root} role="alert">
      <div className={styles.card}>
        <Text variant="display-lg" as="h1" className={styles.title}>
          Armada is open in another tab
        </Text>
        <p className={styles.body}>
          To keep your private balance safe, Armada runs in a single tab per browser — two tabs would
          corrupt its encrypted activity data. This tab can’t load while another is open.
        </p>
        <p className={styles.body}>
          Switch back to the tab you already have open. If you’ve closed it, reload this page to
          continue here.
        </p>
        <Button
          variant="primary"
          size="md"
          label="Reload this tab"
          showIcon={false}
          onClick={() => window.location.reload()}
          className={styles.button}
        />
      </div>
    </div>
  )
}
