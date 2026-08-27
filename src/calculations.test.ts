import { describe, expect, it } from 'vitest'
import { buildCandles, calculateStreak, summarizeDay } from './calculations'
import type { Entry } from './types'

const entries: Entry[] = [
  { date: '2026-08-25', type: 'intake', name: '饮食', calories: 1200, createdAt: 1 },
  { date: '2026-08-25', type: 'exercise', name: '跑步', calories: 300, createdAt: 2 },
  { date: '2026-08-26', type: 'intake', name: '饮食', calories: 1100, createdAt: 3 }
]

describe('calorie calculations', () => {
  it('uses intake minus total expenditure as the balance', () => {
    expect(summarizeDay('2026-08-25', entries, 1600).balance).toBe(-700)
  })

  it('counts completed qualifying days only', () => {
    expect(calculateStreak(entries, 1600, 500, '2026-08-27')).toBe(2)
  })

  it('builds cumulative weekly OHLC candles from recorded days', () => {
    const days = [
      summarizeDay('2026-08-25', entries, 1600),
      summarizeDay('2026-08-26', entries, 1600)
    ]
    expect(buildCandles(days, 'week')).toEqual([{
      key: '2026-08-24', label: '8/24周', open: 0, close: -1200,
      low: -1200, high: 0, change: -1200, days: 2
    }])
  })
})
