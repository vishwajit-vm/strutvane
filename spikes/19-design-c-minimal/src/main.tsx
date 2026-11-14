/**
 * Browser entry: mount the app into #root. Styles are imported here once.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './styles/app.css'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html must contain <div id="root"></div>.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
