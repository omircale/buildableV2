import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useUi } from './state/uiStore'
import { registerOfflineCopy } from './pwa'

// Development-only handle for automated UI checks; never included in production builds.
if (import.meta.env.DEV) Object.assign(window, { __buildable: { ui: useUi } })

registerOfflineCopy()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
