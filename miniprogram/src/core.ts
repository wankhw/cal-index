export type EntryType = 'intake' | 'exercise'
export type CandlePeriod = 'day' | 'week' | 'month'

export interface Entry { id: number; date: string; type: EntryType; name: string; calories: number; createdAt: number }
export interface Settings { deficitTarget: number; bmr: number }
export interface DaySummary { date: string; recorded: boolean; intake: number; exercise: number; expenditure: number; balance: number }
export interface Candle { key: string; label: string; open: number; close: number; low: number; high: number; change: number }

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function summarizeDay(date: string, entries: Entry[], bmr: number): DaySummary {
  const daily = entries.filter((entry) => entry.date === date)
  const intake = daily.filter((entry) => entry.type === 'intake').reduce((sum, entry) => sum + entry.calories, 0)
  const exercise = daily.filter((entry) => entry.type === 'exercise').reduce((sum, entry) => sum + entry.calories, 0)
  const expenditure = bmr + exercise
  return { date, recorded: daily.length > 0, intake, exercise, expenditure, balance: intake - expenditure }
}

function periodKey(dateText: string, period: CandlePeriod) {
  const date = new Date(`${dateText}T12:00:00`)
  if (period === 'day') return dateText
  if (period === 'month') return dateText.slice(0, 7)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return dateKey(date)
}

export function buildCandles(entries: Entry[], bmr: number, period: CandlePeriod): Candle[] {
  const dates = [...new Set(entries.map((entry) => entry.date))].sort()
  const groups = new Map<string, DaySummary[]>()
  dates.forEach((date) => {
    const key = periodKey(date, period)
    groups.set(key, [...(groups.get(key) || []), summarizeDay(date, entries, bmr)])
  })
  let cumulative = 0
  return [...groups.entries()].map(([key, days]) => {
    const open = cumulative
    const path = [open]
    days.forEach((day) => { cumulative += day.balance; path.push(cumulative) })
    const label = period === 'day' ? key.slice(5).replace('-', '/') : period === 'week' ? `${key.slice(5).replace('-', '/')}周` : key.replace('-', '/')
    return { key, label, open, close: cumulative, low: Math.min(...path), high: Math.max(...path), change: cumulative - open }
  })
}

export function signed(value: number) {
  if (!value) return '0'
  return `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value))}`
}
