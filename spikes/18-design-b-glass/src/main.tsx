/**
 * Browser entry point: styles, providers, and the history router.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AppRoutes, Providers } from './App.tsx'
import { ScrollToTop } from './shell/ScrollToTop.tsx'
import './styles/app.css'

const container = document.getElementById('root')
if (container === null) throw new Error('index.html must contain <div id="root"></div>.')

createRoot(container).render(
  <StrictMode>
    <Providers>
      <BrowserRouter>
        <ScrollToTop />
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  </StrictMode>,
)
