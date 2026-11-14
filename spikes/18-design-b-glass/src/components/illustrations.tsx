/**
 * Original SVG illustrations for Glass (drawn for this spike; no third-party artwork).
 *
 * Every colour is a theme token (`var(--…)`), so the art re-tints with the brand hue and flips
 * with dark mode. They are decorative: `aria-hidden`, with the meaning carried by nearby text.
 *
 * @example <EmptyInvoicesArt className="h-36" />
 */
import { useId } from 'react'

interface ArtProps {
  readonly className?: string
}

/** Shared gradient + soft-glass defs; ids are unique per instance (several can be on one page). */
function useIds(...names: string[]): Record<string, string> {
  const base = useId().replace(/:/g, '')
  return Object.fromEntries(names.map((name) => [name, `${base}-${name}`]))
}

/** Floating glass sheets with a magnifier: "no invoices match". */
export function EmptyInvoicesArt({ className }: ArtProps) {
  const id = useIds('brand', 'sheet', 'glow')
  return (
    <svg viewBox="0 0 240 180" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id['brand']} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
        <linearGradient id={id['sheet']} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--glass-highlight)" />
          <stop offset="1" stopColor="var(--glass-card)" />
        </linearGradient>
        <radialGradient id={id['glow']}>
          <stop offset="0" stopColor="var(--mesh-1)" />
          <stop offset="1" stopColor="var(--mesh-1)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="96" rx="104" ry="72" fill={`url(#${id['glow']})`} />
      <rect x="58" y="44" width="96" height="116" rx="14" fill={`url(#${id['sheet']})`} stroke="var(--glass-border)" transform="rotate(-8 106 102)" />
      <rect x="82" y="30" width="96" height="116" rx="14" fill="var(--surface)" stroke="var(--glass-border)" />
      <rect x="96" y="48" width="36" height="8" rx="4" fill={`url(#${id['brand']})`} />
      <rect x="96" y="66" width="66" height="6" rx="3" fill="var(--neutral-soft)" />
      <rect x="96" y="80" width="54" height="6" rx="3" fill="var(--neutral-soft)" />
      <rect x="96" y="94" width="60" height="6" rx="3" fill="var(--neutral-soft)" />
      <rect x="96" y="120" width="30" height="10" rx="5" fill="var(--primary-soft)" />
      <circle cx="172" cy="122" r="22" fill="var(--glass-overlay)" stroke={`url(#${id['brand']})`} strokeWidth="6" />
      <path d="M188 138 L204 154" stroke={`url(#${id['brand']})`} strokeWidth="8" strokeLinecap="round" />
      <circle cx="44" cy="40" r="5" fill="var(--chart-2)" opacity="0.7" />
      <circle cx="206" cy="52" r="3.5" fill="var(--chart-3)" />
      <path d="M200 24 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="var(--chart-4)" opacity="0.85" />
    </svg>
  )
}

/** Layered glass panels with a rising chart: the sign-in hero. */
export function DashboardHeroArt({ className }: ArtProps) {
  const id = useIds('brand', 'area', 'glow')
  return (
    <svg viewBox="0 0 420 320" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id['brand']} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
        <linearGradient id={id['area']} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id['glow']}>
          <stop offset="0" stopColor="var(--mesh-2)" />
          <stop offset="1" stopColor="var(--mesh-2)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="300" cy="90" r="110" fill={`url(#${id['glow']})`} />
      {/* Back panel: donut */}
      <rect x="230" y="26" width="160" height="128" rx="20" fill="var(--glass-card)" stroke="var(--glass-border)" />
      <circle cx="286" cy="90" r="34" fill="none" stroke="var(--neutral-soft)" strokeWidth="12" />
      <circle cx="286" cy="90" r="34" fill="none" stroke={`url(#${id['brand']})`} strokeWidth="12" strokeDasharray="150 214" strokeLinecap="round" transform="rotate(-90 286 90)" />
      <rect x="334" y="70" width="40" height="7" rx="3.5" fill="var(--neutral-soft)" />
      <rect x="334" y="86" width="28" height="7" rx="3.5" fill="var(--chart-3)" opacity="0.7" />
      {/* Main panel: area chart */}
      <rect x="30" y="96" width="300" height="190" rx="24" fill="var(--glass-overlay)" stroke="var(--glass-border)" />
      <rect x="54" y="120" width="70" height="9" rx="4.5" fill="var(--neutral-soft)" />
      <rect x="54" y="138" width="112" height="16" rx="8" fill={`url(#${id['brand']})`} />
      <path d="M54 252 C 90 236, 110 244, 140 220 S 200 196, 230 204 S 280 168, 306 160 L306 266 L54 266 Z" fill={`url(#${id['area']})`} />
      <path d="M54 252 C 90 236, 110 244, 140 220 S 200 196, 230 204 S 280 168, 306 160" fill="none" stroke="var(--chart-1)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="306" cy="160" r="7" fill="var(--surface)" stroke="var(--chart-1)" strokeWidth="4" />
      {/* Front chip: trend */}
      <rect x="250" y="226" width="136" height="64" rx="18" fill="var(--glass-card)" stroke="var(--glass-border)" />
      <circle cx="280" cy="258" r="14" fill="var(--success-soft)" />
      <path d="M273 262 l6 -6 4 4 6 -7" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="302" y="246" width="62" height="8" rx="4" fill="var(--neutral-soft)" />
      <rect x="302" y="262" width="40" height="8" rx="4" fill="var(--success)" opacity="0.8" />
      <path d="M60 48 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" fill="var(--chart-4)" />
      <circle cx="120" cy="60" r="6" fill="var(--chart-2)" opacity="0.6" />
    </svg>
  )
}

/** Stacked glass cubes and a spark: the dashboard welcome card. */
export function WelcomeArt({ className }: ArtProps) {
  const id = useIds('brand', 'cube')
  return (
    <svg viewBox="0 0 220 160" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id['brand']} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
        <linearGradient id={id['cube']} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--glass-highlight)" />
          <stop offset="1" stopColor="var(--glass-card)" />
        </linearGradient>
      </defs>
      <ellipse cx="112" cy="140" rx="86" ry="12" fill="var(--neutral-soft)" />
      <path d="M40 98 l40 -22 40 22 -40 22z" fill={`url(#${id['cube']})`} stroke="var(--glass-border)" />
      <path d="M40 98 v28 l40 22 v-28z" fill="var(--primary-soft)" stroke="var(--glass-border)" />
      <path d="M120 98 v28 l-40 22 v-28z" fill="var(--glass-card)" stroke="var(--glass-border)" />
      <path d="M96 62 l40 -22 40 22 -40 22z" fill={`url(#${id['brand']})`} />
      <path d="M96 62 v34 l40 22 v-34z" fill="var(--primary)" opacity="0.75" />
      <path d="M176 62 v34 l-40 22 v-34z" fill="var(--primary-2)" opacity="0.6" />
      <path d="M186 18 l5 11 11 5 -11 5 -5 11 -5 -11 -11 -5 11 -5z" fill="var(--chart-4)" />
      <circle cx="30" cy="54" r="5" fill="var(--chart-3)" />
      <circle cx="200" cy="112" r="4" fill="var(--chart-2)" />
    </svg>
  )
}

/** A cloud with an arrow: the file drop zone. */
export function UploadArt({ className }: ArtProps) {
  const id = useIds('brand')
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id['brand']} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
      </defs>
      <path d="M18 40 h30 a10 10 0 0 0 0 -20 a14 14 0 0 0 -27 -3 a11 11 0 0 0 -3 23z" fill="var(--primary-soft)" stroke="var(--glass-border)" />
      <path d="M32 34 V20 M26 25 l6 -6 6 6" fill="none" stroke={`url(#${id['brand']})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A compass: 404. */
export function LostArt({ className }: ArtProps) {
  const id = useIds('brand')
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id['brand']} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="62" fill="var(--glass-card)" stroke="var(--glass-border)" />
      <circle cx="80" cy="80" r="46" fill="none" stroke="var(--neutral-soft)" strokeWidth="6" strokeDasharray="4 8" />
      <path d="M80 40 l14 40 -14 40 -14 -40z" fill={`url(#${id['brand']})`} transform="rotate(35 80 80)" />
      <circle cx="80" cy="80" r="7" fill="var(--surface)" />
    </svg>
  )
}
