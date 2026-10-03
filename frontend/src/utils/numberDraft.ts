/** Draft helpers for number inputs that must allow empty while typing. */

export function clampInt(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const trimmed = raw.trim()
  if (trimmed === '') return fallback
  const n = Number.parseInt(trimmed, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function clampFloat(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return fallback
  const n = Number.parseFloat(trimmed)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Keep only digits (and optional leading empty). */
export function draftDigits(raw: string): string {
  return raw.replace(/[^\d]/g, '')
}

/** Digits + one decimal separator. */
export function draftDecimal(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '')
}
