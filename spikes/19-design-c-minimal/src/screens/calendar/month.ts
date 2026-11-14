/**
 * Month-grid maths for the calendar view, kept pure so it is unit-tested apart from the UI.
 */

export interface DayCell {
  /** `YYYY-MM-DD` (UTC). */
  date: string
  day: number
  inMonth: boolean
}

/**
 * The 5 or 6 weeks (Monday first) that cover a month, including the trailing days of the
 * previous month and the leading days of the next, so every row has 7 cells.
 *
 * @example monthGrid(2026, 10) // November 2026 → starts Mon 26 Oct, ends Sun 6 Dec
 */
export function monthGrid(year: number, monthIndex: number): DayCell[] {
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const offset = (first.getUTCDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const weeks = Math.ceil((offset + daysInMonth) / 7)
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, 1 - offset + index))
    return { date: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: date.getUTCMonth() === monthIndex }
  })
}

/** `November 2026`. */
export function monthTitle(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthIndex, 1)))
}

/** Step a `{ year, month }` by whole months, rolling over the year. */
export function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}
