import Dexie, { type EntityTable } from 'dexie'
import type { Entry, Settings } from './types'

class CalIndexDB extends Dexie {
  entries!: EntityTable<Entry, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor() {
    super('cal-index')
    this.version(1).stores({
      entries: '++id, date, type, createdAt',
      settings: 'id'
    })
  }
}

export const db = new CalIndexDB()
export const defaultSettings: Settings = { id: 'profile', deficitTarget: 500, bmr: 1650 }
