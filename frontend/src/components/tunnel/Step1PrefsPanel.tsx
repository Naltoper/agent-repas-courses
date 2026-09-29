import { useEffect, useId, useState } from 'react'
import { fetchProfile, saveProfile } from '../../api/client'
import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'
import type { DietaryRegime, UserProfile } from '../../types/domain'

const DAY_CHIPS = [5, 7, 10, 14] as const

const REGIME_OPTIONS: { value: DietaryRegime; label: string }[] = [
  { value: 'omnivore', label: 'Équilibré' },
  { value: 'vegetarian', label: 'Végétarien' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten_free', label: 'Sans gluten' },
  { value: 'halal', label: 'Sans porc / Halal' },
  { value: 'other', label: 'Économique / Rapide' },
]

const EMPTY: UserProfile = {
  household_size: 2,
  budget_eur: 80,
  recipe_days: 5,
  dietary_regimes: ['omnivore'],
  notes: '',
  model_selection_mode: 'auto',
  preferred_model: 'gemini-3.5-flash-lite',
}

export function Step1PrefsPanel() {
  const formId = useId()
  const { prompt, setPrompt, startRun, running, error } = useAgentWorkspace()
  const [open, setOpen] = useState(true)
  const [profile, setProfile] = useState<UserProfile>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const c = new AbortController()
    fetchProfile(c.signal)
      .then((p) => {
        setProfile({ ...EMPTY, ...p })
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => c.abort()
  }, [])

  async function persistAndGenerate() {
    setSaving(true)
    try {
      const saved = await saveProfile(profile)
      setProfile(saved)
      const tags = saved.dietary_regimes.join(', ')
      const body =
        prompt.trim() ||
        `Menu pour ${saved.recipe_days} jours, ${saved.household_size} personnes.`
      const full = `${body}\n\nCritères: ${tags}. ${saved.notes}`.trim()
      await startRun(full)
      setOpen(false)
    } catch {
      // startRun sets error
    } finally {
      setSaving(false)
    }
  }

  const summary = loaded
    ? `${profile.recipe_days} j · ${profile.household_size} pers. · ${profile.dietary_regimes.length} critère(s)`
    : 'Chargement…'

  return (
    <section className="mb-4 rounded-2xl bg-white/90 ring-1 ring-sage-100">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="min-h-11 flex-1 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <p className="text-sm font-semibold text-sage-800">Préférences</p>
          <p className="text-xs text-muted">{summary}</p>
        </button>
        <button
          type="button"
          disabled={running || saving || !loaded}
          onClick={() => void persistAndGenerate()}
          className="min-h-11 shrink-0 rounded-xl bg-sage-800 px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {running ? '…' : 'Régénérer'}
        </button>
      </div>

      {open ? (
        <div className="space-y-4 border-t border-sage-50 px-3 py-3">
          <div>
            <p className="mb-2 text-xs font-semibold text-sage-700 uppercase">
              Nombre de jours
            </p>
            <div className="flex flex-wrap gap-2">
              {DAY_CHIPS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setProfile((p) => ({ ...p, recipe_days: d }))}
                  className={`min-h-11 min-w-11 rounded-xl px-3 text-sm font-medium ${
                    profile.recipe_days === d
                      ? 'bg-sage-800 text-white'
                      : 'bg-sage-50 text-sage-800 ring-1 ring-sage-100'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-sage-700 uppercase">
              Convives
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-xl bg-sage-50 text-lg font-bold text-sage-800 ring-1 ring-sage-100"
                onClick={() =>
                  setProfile((p) => ({
                    ...p,
                    household_size: Math.max(1, p.household_size - 1),
                  }))
                }
              >
                −
              </button>
              <span className="min-w-8 text-center text-lg font-semibold text-sage-800">
                {profile.household_size}
              </span>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-xl bg-sage-50 text-lg font-bold text-sage-800 ring-1 ring-sage-100"
                onClick={() =>
                  setProfile((p) => ({
                    ...p,
                    household_size: Math.min(12, p.household_size + 1),
                  }))
                }
              >
                +
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-sage-700 uppercase">
              Préférences ({profile.dietary_regimes.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {REGIME_OPTIONS.map((opt) => {
                const on = profile.dietary_regimes.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setProfile((p) => {
                        const has = p.dietary_regimes.includes(opt.value)
                        if (has && p.dietary_regimes.length === 1) return p
                        return {
                          ...p,
                          dietary_regimes: has
                            ? p.dietary_regimes.filter((r) => r !== opt.value)
                            : [...p.dietary_regimes, opt.value],
                        }
                      })
                    }
                    className={`min-h-11 rounded-xl px-3 text-sm ${
                      on
                        ? 'bg-sage-100 font-medium text-sage-800 ring-1 ring-sage-600/30'
                        : 'bg-white text-muted ring-1 ring-sage-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block space-y-1.5" htmlFor={formId}>
            <span className="text-xs font-semibold text-sage-700 uppercase">
              Précisions (langage naturel)
            </span>
            <textarea
              id={formId}
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex. Pas de poisson le soir, légumes de saison…"
              className="w-full resize-y rounded-xl border border-sage-100 bg-white px-3 py-2.5 text-sm outline-none ring-sage-600 focus:ring-2"
            />
          </label>

          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={running || saving}
            onClick={() => void persistAndGenerate()}
            className="min-h-12 w-full rounded-xl bg-citrus text-sm font-semibold text-sage-800 disabled:opacity-60"
          >
            {running || saving ? 'Génération en cours…' : 'Régénérer le menu'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
