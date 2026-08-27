import { eachDayOfInterval, format, isBefore, parseISO, startOfMonth, startOfWeek, subDays } from 'date-fns'
import type { CalorieCandle, CandlePeriod, DaySummary, Entry } from './types'

export function summarizeDay(date: string, entries: Entry[], bmr: number): DaySummary {
  const daily = entries.filter((entry) => entry.date === date)
  const intake = daily.filter((entry) => entry.type === 'intake').reduce((sum, entry) => sum + entry.calories, 0)
  const exercise = daily.filter((entry) => entry.type === 'exercise').reduce((sum, entry) => sum + entry.calories, 0)
  const expenditure = bmr + exercise
  return { date, recorded: daily.length > 0, intake, exercise, expenditure, balance: intake - expenditure }
}

export function calculateStreak(entries: Entry[], bmr: number, deficitTarget: number, today: string): number {
  let cursor = subDays(parseISO(today), 1)
  let streak = 0
  const earliest = entries.length
    ? entries.reduce((min, entry) => (isBefore(parseISO(entry.date), min) ? parseISO(entry.date) : min), parseISO(entries[0].date))
    : cursor

  while (!isBefore(cursor, earliest)) {
    const date = format(cursor, 'yyyy-MM-dd')
    if (summarizeDay(date, entries, bmr).balance > -deficitTarget) break
    streak += 1
    cursor = subDays(cursor, 1)
  }
  return streak
}

export function summarizeRange(start: Date, end: Date, entries: Entry[], bmr: number): DaySummary[] {
  return eachDayOfInterval({ start, end }).map((date) => summarizeDay(format(date, 'yyyy-MM-dd'), entries, bmr))
}

export function buildCandles(days: DaySummary[], period: CandlePeriod): CalorieCandle[] {
  const recorded = days.filter((day) => day.recorded).sort((a, b) => a.date.localeCompare(b.date))
  const groups = new Map<string, DaySummary[]>()

  for (const day of recorded) {
    const date = parseISO(day.date)
    const key = period === 'day'
      ? day.date
      : format(period === 'week' ? startOfWeek(date, { weekStartsOn: 1 }) : startOfMonth(date), 'yyyy-MM-dd')
    groups.set(key, [...(groups.get(key) ?? []), day])
  }

  let cumulative = 0
  return [...groups.entries()].map(([key, group]) => {
    const open = cumulative
    const path = [open]
    for (const day of group) {
      cumulative += day.balance
      path.push(cumulative)
    }
    const label = period === 'day'
      ? format(parseISO(key), 'M/d')
      : period === 'week'
        ? `${format(parseISO(key), 'M/d')}周`
        : format(parseISO(key), 'yyyy/M')
    return {
      key,
      label,
      open,
      close: cumulative,
      low: Math.min(...path),
      high: Math.max(...path),
      change: cumulative - open,
      days: group.length
    }
  })
}
