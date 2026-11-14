/**
 * Original spot illustrations for this mockup (hand-written SVG, no third-party art).
 *
 * Every fill and stroke is a theme token, so the illustrations recolour with the accent hue and
 * look native in dark mode. They are decorative (`aria-hidden`): the surrounding text always says
 * what matters.
 *
 * - {@link AuthIllustration}: floating dashboard cards for the sign-in brand panel;
 * - {@link GrowthIllustration}: a rising chart with coins for the welcome card;
 * - {@link EmptyIllustration}: an empty tray with a magnifier for empty states;
 * - {@link ShieldIllustration}: a shield with a check for 2FA;
 * - {@link MailIllustration}: an envelope with a key for "check your email".
 *
 * @module
 */
import { useId, type ReactElement } from 'react'
import { cn } from '../lib/cn.ts'

interface IllustrationProps {
  readonly className?: string
}

/** On the brand panel: translucent "glass" cards with a chart, a donut and people. */
export function AuthIllustration({ className }: IllustrationProps): ReactElement {
  const glass = 'var(--primary-foreground)'
  return (
    <svg viewBox="0 0 440 340" aria-hidden className={cn('w-full', className)}>
      {/* Main chart card */}
      <rect x="40" y="40" width="300" height="180" rx="18" fill={glass} fillOpacity="0.14" stroke={glass} strokeOpacity="0.28" />
      <rect x="64" y="64" width="90" height="10" rx="5" fill={glass} fillOpacity="0.75" />
      <rect x="64" y="82" width="56" height="8" rx="4" fill={glass} fillOpacity="0.4" />
      <path d="M64 186c26-6 38-34 64-36s34 22 60 14 30-48 58-52 40 14 66 2" fill="none" stroke={glass} strokeWidth="4" strokeLinecap="round" />
      <path d="M64 186c26-6 38-34 64-36s34 22 60 14 30-48 58-52 40 14 66 2V200H64Z" fill={glass} fillOpacity="0.12" />
      <circle cx="246" cy="112" r="7" fill={glass} />
      <circle cx="246" cy="112" r="13" fill={glass} fillOpacity="0.25" />
      {/* Donut card */}
      <rect x="270" y="150" width="140" height="150" rx="18" fill={glass} fillOpacity="0.2" stroke={glass} strokeOpacity="0.32" />
      <circle cx="340" cy="212" r="34" fill="none" stroke={glass} strokeOpacity="0.25" strokeWidth="12" />
      <circle cx="340" cy="212" r="34" fill="none" stroke={glass} strokeWidth="12" strokeDasharray="150 214" strokeLinecap="round" transform="rotate(-90 340 212)" />
      <rect x="300" y="266" width="80" height="8" rx="4" fill={glass} fillOpacity="0.5" />
      {/* People card */}
      <rect x="18" y="238" width="220" height="70" rx="16" fill={glass} fillOpacity="0.2" stroke={glass} strokeOpacity="0.32" />
      {[52, 80, 108].map((cx, index) => (
        <circle key={cx} cx={cx} cy="273" r="15" fill={glass} fillOpacity={0.9 - index * 0.2} stroke="var(--primary)" strokeWidth="3" />
      ))}
      <rect x="138" y="262" width="80" height="9" rx="4.5" fill={glass} fillOpacity="0.75" />
      <rect x="138" y="278" width="52" height="7" rx="3.5" fill={glass} fillOpacity="0.4" />
      {/* Sparkles */}
      <path d="M380 54l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill={glass} fillOpacity="0.8" />
      <circle cx="24" cy="120" r="5" fill={glass} fillOpacity="0.5" />
      <circle cx="410" cy="120" r="3" fill={glass} fillOpacity="0.5" />
    </svg>
  )
}

/** For the welcome card: a rising bar chart, a trend arrow and a coin stack. */
export function GrowthIllustration({ className }: IllustrationProps): ReactElement {
  const shade = useId()
  return (
    <svg viewBox="0 0 220 160" aria-hidden className={cn('w-full', className)}>
      <defs>
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="148" rx="96" ry="8" fill="var(--primary)" fillOpacity="0.1" />
      {[
        [34, 96],
        [70, 76],
        [106, 86],
        [142, 52],
      ].map(([x = 0, y = 0], index) => (
        <rect key={x} x={x} y={y} width="26" height={146 - y} rx="7" fill={index === 3 ? `url(#${shade})` : 'var(--primary-soft)'} />
      ))}
      <path d="M30 78 70 56l36 12 52-44" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M146 22h14v14" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {/* Coins */}
      {[0, 1, 2].map((index) => (
        <g key={index} transform={`translate(176 ${128 - index * 10})`}>
          <ellipse cx="14" cy="6" rx="16" ry="6" fill="var(--chart-3)" />
          <ellipse cx="14" cy="3" rx="16" ry="6" fill="var(--warning-soft)" stroke="var(--chart-3)" strokeWidth="2" />
        </g>
      ))}
      <path d="M188 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="var(--chart-3)" />
    </svg>
  )
}

/** For empty states: an open tray, floating cards and a magnifier. */
export function EmptyIllustration({ className }: IllustrationProps): ReactElement {
  return (
    <svg viewBox="0 0 200 150" aria-hidden className={cn('w-full', className)}>
      <ellipse cx="100" cy="134" rx="80" ry="8" fill="var(--primary)" fillOpacity="0.08" />
      <circle cx="100" cy="68" r="58" fill="var(--primary-soft)" />
      <rect x="62" y="30" width="62" height="78" rx="9" fill="var(--card)" stroke="var(--border)" strokeWidth="2" transform="rotate(-8 93 69)" />
      <rect x="78" y="26" width="62" height="78" rx="9" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <rect x="88" y="40" width="34" height="6" rx="3" fill="var(--primary)" fillOpacity="0.55" />
      <rect x="88" y="54" width="42" height="5" rx="2.5" fill="var(--border)" />
      <rect x="88" y="65" width="30" height="5" rx="2.5" fill="var(--border)" />
      <rect x="88" y="76" width="38" height="5" rx="2.5" fill="var(--border)" />
      <path d="M52 100h96l-8 26a6 6 0 0 1-5.7 4H65.7a6 6 0 0 1-5.7-4Z" fill="var(--primary)" />
      <path d="M52 100h28a20 10 0 0 0 40 0h28" fill="none" stroke="var(--primary-foreground)" strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="150" cy="52" r="15" fill="var(--card)" stroke="var(--primary)" strokeWidth="5" />
      <path d="M161 63l12 12" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="40" cy="44" r="4" fill="var(--chart-3)" />
      <circle cx="166" cy="104" r="3" fill="var(--chart-2)" />
    </svg>
  )
}

/** For two-factor authentication: a shield with a check mark. */
export function ShieldIllustration({ className }: IllustrationProps): ReactElement {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn('w-full', className)}>
      <circle cx="60" cy="60" r="52" fill="var(--success-soft)" />
      <path d="M60 22 88 32v24c0 20-12 34-28 42-16-8-28-22-28-42V32Z" fill="var(--card)" stroke="var(--success)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M47 59l9 9 18-19" fill="none" stroke="var(--success)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** For "check your inbox": an envelope with a key. */
export function MailIllustration({ className }: IllustrationProps): ReactElement {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn('w-full', className)}>
      <circle cx="60" cy="60" r="52" fill="var(--primary-soft)" />
      <rect x="24" y="38" width="72" height="50" rx="9" fill="var(--card)" stroke="var(--primary)" strokeWidth="4" />
      <path d="m27 43 33 24 33-24" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="92" cy="34" r="12" fill="var(--primary)" />
      <path d="M88 34h8M92 30v8" stroke="var(--primary-foreground)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** A decorative wave/ring pattern for the profile cover and the hero card background. */
export function CoverPattern({ className }: IllustrationProps): ReactElement {
  return (
    <svg viewBox="0 0 800 200" preserveAspectRatio="xMidYMid slice" aria-hidden className={cn('h-full w-full', className)}>
      <g fill="none" stroke="var(--primary-foreground)" strokeOpacity="0.16" strokeWidth="1.5">
        {[60, 110, 160, 210, 260].map((radius) => (
          <circle key={radius} cx="700" cy="40" r={radius} />
        ))}
        <path d="M0 150c120-40 220 30 340-10s220-90 460-30" strokeOpacity="0.22" strokeWidth="2" />
        <path d="M0 180c140-30 240 20 360-14s240-70 440-24" strokeOpacity="0.14" strokeWidth="2" />
      </g>
      <circle cx="120" cy="40" r="4" fill="var(--primary-foreground)" fillOpacity="0.4" />
      <circle cx="420" cy="70" r="3" fill="var(--primary-foreground)" fillOpacity="0.35" />
    </svg>
  )
}
