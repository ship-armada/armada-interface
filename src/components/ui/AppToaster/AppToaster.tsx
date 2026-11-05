// ABOUTME: AppToaster — the app's one toast container (sonner, bottom-right). Unstyled sonner + our CSS Module, so every
// ABOUTME: toast uses the design tokens and follows the light/dark theme. Mounted once in main.tsx.

import { Toaster } from 'sonner'
import styles from './AppToaster.module.css'

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: styles.toast,
          title: styles.title,
          description: styles.description,
          actionButton: styles.actionButton,
          closeButton: styles.closeButton,
          icon: styles.icon,
        },
      }}
    />
  )
}
