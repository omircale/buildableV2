import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useDesign } from './state/designStore'
import { useUi } from './state/uiStore'

// Development-only handle for automated UI checks; never included in production builds.
if (import.meta.env.DEV) Object.assign(window, { __buildable: { design: useDesign, ui: useUi } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
