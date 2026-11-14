/**
 * The demo: a minimal admin shell (sidebar + page header + theme switch) around the dashboards,
 * so the charts can be judged in context, in light and dark. The real shell is spike 14's.
 *
 * @module
 */
import { IconChartBar, IconChartLine, IconDeviceDesktop, IconLayoutDashboard, IconMoon, IconSun } from '@tabler/icons-react'
import { clsx } from 'clsx'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Dashboard } from '../ui/Dashboard.tsx'
import { createAggregateClient } from '../ui/data.ts'
import type { WidgetContext } from '../ui/Widget.tsx'
import { CUSTOMER_NAMES } from './seed.ts'
import { demoPages, metadata, resolved } from './setup.ts'

type Theme = 'light' | 'dark' | 'system'
const THEME_KEY = 'strutvane.theme'

/** Icons by name (the closed list the sidebar uses). */
const ICONS = { dashboard: IconLayoutDashboard, 'chart-line': IconChartLine, 'chart-bar': IconChartBar } as const

/**
 * The demo app.
 *
 * @example
 * createRoot(element).render(<App />)
 */
export function App({ context: given }: { readonly context?: WidgetContext }): ReactElement {
  const pages = useMemo(() => demoPages(), [])
  const [pageId, setPageId] = useState('home')
  const page = pages.find((candidate) => candidate.id === pageId) ?? pages[0]
  const context = useMemo<WidgetContext>(
    () =>
      given ?? {
        client: createAggregateClient(),
        metadata,
        now: () => new Date(),
        relationLabels: async (_resource, ids) => Object.fromEntries(ids.map((id) => [id, CUSTOMER_NAMES[id] ?? `#${id}`])),
        minGroupSize: (resource) => resolved.get(resource)?.minGroupSize ?? null,
      },
    [given],
  )
  return (
    <div className="min-h-screen md:grid md:grid-cols-[16.25rem_minmax(0,1fr)]">
      <nav aria-label="Main" className="border-b border-border/60 bg-sidebar p-4 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <p className="mb-4 px-2 text-xl font-semibold">Strutvane</p>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {pages.map((entry, index) => {
            const Icon = ICONS[entry.icon as keyof typeof ICONS] ?? IconChartBar
            const showGroup = entry.group !== undefined && pages[index - 1]?.group !== entry.group
            return (
              <li key={entry.id} className="shrink-0">
                {showGroup ? <p className="mt-3 mb-1 hidden px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase md:block">{entry.group}</p> : null}
                <button
                  type="button"
                  aria-current={entry.id === page?.id ? 'page' : undefined}
                  onClick={() => setPageId(entry.id)}
                  className={clsx(
                    'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-base transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    entry.id === page?.id ? 'bg-primary font-medium text-primary-foreground shadow-primary' : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" stroke={1.75} />
                  {entry.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <main className="mx-auto w-full max-w-[90rem] space-y-6 p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{page?.title}</h1>
            <p className="text-sm text-muted-foreground">Numbers for your team only, computed on the server, in UTC.</p>
          </div>
          <ThemeSwitch />
        </header>
        {page === undefined ? null : <Dashboard key={page.id} label={page.title} widgets={page.widgets} context={context} />}
      </main>
    </div>
  )
}

/** Light / Dark / System, remembered when storage works (it can throw in private windows). */
function ThemeSwitch(): ReactElement {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY)
      return saved === 'light' || saved === 'dark' ? saved : 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Not remembered; the theme still applies.
    }
  }, [theme])
  const options: readonly (readonly [Theme, string, typeof IconSun])[] = [
    ['light', 'Light theme', IconSun],
    ['dark', 'Dark theme', IconMoon],
    ['system', 'System theme', IconDeviceDesktop],
  ]
  return (
    <div role="group" aria-label="Theme" className="inline-flex rounded-lg bg-muted p-1">
      {options.map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          aria-label={label}
          onClick={() => setTheme(value)}
          className={clsx('inline-flex size-8 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring', theme === value ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          <Icon aria-hidden="true" className="size-4" />
        </button>
      ))}
    </div>
  )
}
