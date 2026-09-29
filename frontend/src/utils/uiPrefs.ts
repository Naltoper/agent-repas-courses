/** localStorage helpers for UI prefs and in-stock flags. */

import type { StoreBrand } from '../types/domain'

const PREFS_KEY = 'smartchef.uiPrefs'
const STOCK_PREFIX = 'smartchef.inStock.'

export interface UiPrefs {
  store: StoreBrand
  city: string
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  store: 'carrefour',
  city: '',
}

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_UI_PREFS }
    const parsed = JSON.parse(raw) as Partial<UiPrefs>
    return {
      store: parsed.store ?? DEFAULT_UI_PREFS.store,
      city: parsed.city ?? '',
    }
  } catch {
    return { ...DEFAULT_UI_PREFS }
  }
}

export function saveUiPrefs(prefs: UiPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function loadInStockIds(sessionId: string | null): Set<string> {
  if (!sessionId) return new Set()
  try {
    const raw = localStorage.getItem(STOCK_PREFIX + sessionId)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(arr)
  } catch {
    return new Set()
  }
}

export function saveInStockIds(sessionId: string | null, ids: Set<string>): void {
  if (!sessionId) return
  localStorage.setItem(STOCK_PREFIX + sessionId, JSON.stringify([...ids]))
}
