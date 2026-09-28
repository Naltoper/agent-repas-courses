/** Shared display helpers for shopping quantities & prices. */

import type { Ingredient, ShoppingItem } from '../types/domain'

export function formatIngredientLine(ing: Ingredient | string): string {
  if (typeof ing === 'string') return ing
  const label = ing.quantity_label?.trim() || `${ing.quantity_g} g`
  return `${ing.name} — ${label}`
}

export function formatShoppingQuantity(item: ShoppingItem): string {
  const label = item.quantity?.trim()
  if (label) return label
  if (item.quantity_g != null && item.quantity_g > 0) {
    const g = item.quantity_g
    return Number.isInteger(g) ? `${g} g` : `${g} g`
  }
  return '—'
}

export function formatShoppingPrice(item: ShoppingItem): string {
  if (item.estimated_price_eur == null) return '—'
  return `${item.estimated_price_eur.toFixed(2)} €`
}

export function formatUnitPrice(item: ShoppingItem): string | null {
  if (item.unit_price_eur == null) return null
  if (item.unit === 'unit') {
    return `${item.unit_price_eur.toFixed(2)} €/u`
  }
  return `${item.unit_price_eur.toFixed(2)} €/kg`
}

export function priceSourceHint(item: ShoppingItem): string | null {
  if (item.price_source === 'gemini') return 'estim. IA'
  if (item.price_source === 'heuristic') return 'approx.'
  if (item.price_source === 'override') return 'ajusté'
  return null
}
