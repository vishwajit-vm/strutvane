/**
 * `<BrandMark>`: Strutvane's small logo mark, drawn here (original artwork, no external asset).
 * It uses the accent token, so it follows `--brand-hue` and both themes.
 *
 * @module
 */
import type { ReactElement } from 'react'

/**
 * The logo mark: a rounded tile with a vane, two struts and a pivot. Decorative (`aria-hidden`):
 * the app name next to it is the accessible text.
 *
 * @example
 * <BrandMark />
 */
export function BrandMark(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8 shrink-0">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M9 22 L16 8 L23 22" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-foreground" />
      <path d="M11.5 17 H20.5" fill="none" strokeWidth="2.6" strokeLinecap="round" className="stroke-primary-foreground opacity-70" />
      <circle cx="16" cy="8" r="2.2" className="fill-primary-foreground" />
    </svg>
  )
}
