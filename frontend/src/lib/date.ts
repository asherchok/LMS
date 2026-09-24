/** Local YYYY-MM-DD for a Date (not UTC — matches the calendar's day keys). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function todayKey(): string {
  return localDateKey(new Date())
}

/** Whole days between today (local midnight) and a YYYY-MM-DD remind date.
 *  Positive = overdue, 0 = today, negative = future. */
export function daysOverdue(remindDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(remindDate + 'T00:00:00')
  return Math.floor((today.getTime() - due.getTime()) / 86400000)
}

export function daysUntil(remindDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(remindDate + 'T00:00:00')
  return Math.ceil((due.getTime() - today.getTime()) / 86400000)
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
