/**
 * Entry point: self-hosted font (OFL, via @fontsource), the token stylesheet, and the app.
 */
import '@fontsource-variable/plus-jakarta-sans'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html must contain <div id="root"></div>.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
