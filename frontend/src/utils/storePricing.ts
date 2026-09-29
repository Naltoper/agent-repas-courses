/** Store brand display coefficients for client-side budget estimate. */

import type { StoreBrand } from '../types/domain'

export const STORE_OPTIONS: { id: StoreBrand; label: string; factor: number }[] =
  [
    { id: 'lidl', label: 'Lidl', factor: 0.85 },
    { id: 'leclerc', label: 'E.Leclerc', factor: 0.92 },
    { id: 'intermarche', label: 'Intermarché', factor: 0.95 },
    { id: 'carrefour', label: 'Carrefour', factor: 1.0 },
    { id: 'auchan', label: 'Auchan', factor: 1.02 },
    { id: 'monoprix', label: 'Monoprix', factor: 1.18 },
    { id: 'autre', label: 'Autre', factor: 1.0 },
  ]

export function storeFactor(brand: StoreBrand): number {
  return STORE_OPTIONS.find((s) => s.id === brand)?.factor ?? 1
}

export function storeLabel(brand: StoreBrand): string {
  return STORE_OPTIONS.find((s) => s.id === brand)?.label ?? brand
}

export function adjustPrice(baseEur: number, brand: StoreBrand): number {
  return Math.round(baseEur * storeFactor(brand) * 100) / 100
}
