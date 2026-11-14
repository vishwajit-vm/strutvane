/**
 * Demo notifications for the navbar. A real app would get these from a notifications package
 * (planned `@strutvane/notify`) through the navbar extension point described in DESIGN.md §8.
 *
 * @module
 */

/**
 * One notification.
 *
 * @example
 * const note: Notification = { id: 'ready', title: 'Your admin is ready', detail: 'Every table has a screen.' }
 */
export interface Notification {
  readonly id: string
  readonly title: string
  readonly detail: string
}

/**
 * What the demo shows.
 *
 * @example
 * NOTIFICATIONS.length // 2
 */
export const NOTIFICATIONS: readonly Notification[] = [
  { id: 'ready', title: 'Your admin is ready', detail: 'Every table now has a screen and a menu entry.' },
  { id: 'customise', title: 'Make it yours', detail: 'Edit resources/ui/*.ui.ts; migrate never overwrites it.' },
]
