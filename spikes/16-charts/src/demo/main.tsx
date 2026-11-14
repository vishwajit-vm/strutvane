/**
 * Browser entry of the demo (`npm run dev`, `npm run build`).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../ui/styles.css'
import { App } from './App.tsx'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root element.')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
