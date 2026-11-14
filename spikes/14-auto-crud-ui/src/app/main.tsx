/**
 * Browser entry: wire the generated registry (`ui.gen.ts`, written by `ui:sync`) and the API, and
 * render the app. In `npm run dev`, `/api` is the seeded mock (see vite.config.ts).
 *
 * @module
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { metadata, ownedUi } from '../../example/.strutvane/ui.gen.ts'
import { createApiClient } from './api/client.ts'
import { App } from './App.tsx'
import { buildRegistry } from './registry.tsx'
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html needs an element with id="root" for the app to render into.')

createRoot(root).render(
  <StrictMode>
    <App api={createApiClient({ baseUrl: `${window.location.origin}/api` })} registry={buildRegistry(metadata, ownedUi)} />
  </StrictMode>,
)
