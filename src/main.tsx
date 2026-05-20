// ABOUTME: Mount + provider tree for @armada/interface — Wagmi → Query → RainbowKit → Router → Motion.
// ABOUTME: Jotai intentionally has no Provider so React hooks share `getDefaultStore()` with the module-scope tx executor.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'

import { wagmiConfig } from '@/config/wagmi'
import { App } from '@/App'
import { Dashboard } from '@/pages/Dashboard'
import { History } from '@/pages/History'
import { Settings } from '@/pages/Settings'
import { AddressBook } from '@/pages/AddressBook'
import { Debug } from '@/pages/Debug'

import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            // Brand tokens lifted from @armada/ui:
            //   accent      = --primitives-color-purple-500 (brand-lavender)
            //   foreground  = --primitives-color-purple-900 (brand-deep) — high-contrast on lavender
            // Hex literals (not CSS vars) because RainbowKit's theme builder feeds these
            // straight to its inline style props, not to a stylesheet.
            accentColor: '#c491e5',
            accentColorForeground: '#291433',
            // RainbowKit borderRadius is a 4-value enum: 'none' | 'small' | 'medium' | 'large'.
            // 'large' (~16px) is the closest match to our Card radius (8px) without going harsh.
            borderRadius: 'large',
            overlayBlur: 'small',
          })}
        >
          {/* No <Provider> from jotai — without one, useAtomValue/useSetAtom fall back to
              getDefaultStore(), which is the SAME store the module-scope tx executor reads.
              Wrapping with <Provider> here would create an isolated store and cause submit()
              writes to be invisible to the executor. Tests still wrap with Provider+createStore
              for isolation (overriding the default store via context). */}
          <BrowserRouter>
            <MotionConfig reducedMotion="user">
              <Routes>
                <Route element={<App />}>
                  <Route index element={<Dashboard />} />
                  <Route path="history" element={<History />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="address-book" element={<AddressBook />} />
                  {/* Debug page is available in both modes — contract addresses + per-chain
                      balances are useful diagnostics regardless. The local-only faucet UI is
                      gated inside the page itself. */}
                  <Route path="debug" element={<Debug />} />
                </Route>
              </Routes>
              <Toaster theme="dark" position="bottom-right" />
            </MotionConfig>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
