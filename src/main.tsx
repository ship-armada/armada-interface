// ABOUTME: Mount + provider tree for @armada/interface — Wagmi → Query → RainbowKit → Jotai → Router → Motion.
// ABOUTME: Order is load-bearing (see PLAN_ARMADA_INTERFACE.md §6). Toaster is sibling of Routes so it survives navigation.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Provider as JotaiProvider } from 'jotai'
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

import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <JotaiProvider>
            <BrowserRouter>
              <MotionConfig reducedMotion="user">
                <Routes>
                  <Route element={<App />}>
                    <Route index element={<Dashboard />} />
                    <Route path="history" element={<History />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="address-book" element={<AddressBook />} />
                  </Route>
                </Routes>
                <Toaster theme="dark" position="bottom-right" />
              </MotionConfig>
            </BrowserRouter>
          </JotaiProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
