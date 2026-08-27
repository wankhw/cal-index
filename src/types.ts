export type EntryType = 'intake' | 'exercise'

export interface Entry {
  id?: number
  date: string
  type: EntryType
  name: string
  calories: number
  createdAt: number
}

export interface Settings {
  id: 'profile'
  deficitTarget: number
  bmr: number
}

export interface DaySummary {
  date: string
  recorded: boolean
  intake: number
  exercise: number
  expenditure: number
  balance: number
}
