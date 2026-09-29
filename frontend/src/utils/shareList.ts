/** Format shopping list for share / clipboard. */

import type { ShoppingItem } from '../types/domain'
import { formatShoppingQuantity } from './shoppingFormat'

export function formatChecklistText(
  items: ShoppingItem[],
  title = 'Liste de courses',
): string {
  const lines = [`☐ ${title}`, '']
  const byAisle = new Map<string, ShoppingItem[]>()
  for (const item of items) {
    const aisle = item.aisle || 'Divers'
    const list = byAisle.get(aisle) ?? []
    list.push(item)
    byAisle.set(aisle, list)
  }
  for (const [aisle, group] of byAisle) {
    lines.push(`▸ ${aisle}`)
    for (const item of group) {
      const mark = item.checked ? '☑' : '☐'
      lines.push(
        `${mark} ${item.name} — ${formatShoppingQuantity(item)}` +
          (item.estimated_price_eur != null
            ? ` (~${item.estimated_price_eur.toFixed(2)} €)`
            : ''),
      )
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export async function shareText(text: string, title = 'Liste de courses'): Promise<boolean> {
  if (navigator.share) {
    await navigator.share({ title, text })
    return true
  }
  await copyText(text)
  return false
}
