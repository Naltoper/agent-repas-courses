import { useEffect, useState, type FormEvent } from 'react'
import { fetchHealth, fetchProfile, saveProfile } from '../api/client'
import { useAgentWorkspace } from '../state/AgentWorkspaceContext'
import type { DietaryRegime, HealthResponse, UserProfile } from '../types/domain'
import { STORE_OPTIONS } from '../utils/storePricing'
import type { StoreBrand } from '../types/domain'

const EMPTY: UserProfile = {
  household_size: 2,
  budget_eur: 80,
  recipe_days: 5,
  dietary_regimes: ['omnivore'],
  notes: '',
  model_selection_mode: 'auto',
  preferred_model: 'gemini-3.5-flash-lite',
}

const REGIMES: { value: DietaryRegime; label: string }[] = [
  { value: 'omnivore', label: 'Équilibré' },
  { value: 'vegetarian', label: 'Végétarien' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten_free', label: 'Sans gluten' },
  { value: 'halal', label: 'Halal' },
  { value: 'other', label: 'Autre' },
]

export function SettingsScreen() {
  const { uiPrefs, setUiPrefs } = useAgentWorkspace()
  const [profile, setProfile] = useState<UserProfile>(EMPTY)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const c = new AbortController()
    void fetchProfile(c.signal).then((p) => setProfile({ ...EMPTY, ...p }))
    void fetchHealth(c.signal)
      .then(setHealth)
      .catch(() => setHealth(null))
    return () => c.abort()
  }, [])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const saved = await saveProfile(profile)
      setProfile(saved)
      setMsg('Préférences enregistrées')
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSave}>
      <div>
        <h2 className="text-lg font-semibold text-sage-800">Paramètres</h2>
        <p className="text-sm text-muted">
          Valeurs par défaut mémorisées pour vos prochaines planifications.
        </p>
      </div>

      <fieldset className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-sage-100">
        <legend className="px-1 text-sm font-semibold text-sage-800">
          Magasin favori
        </legend>
        <label className="block text-xs text-muted">
          Enseigne
          <select
            value={uiPrefs.store}
            onChange={(e) =>
              setUiPrefs({
                ...uiPrefs,
                store: e.target.value as StoreBrand,
              })
            }
            className="mt-1 min-h-11 w-full rounded-xl border border-sage-100 px-3 text-sm"
          >
            {STORE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Ville
          <input
            value={uiPrefs.city}
            onChange={(e) => setUiPrefs({ ...uiPrefs, city: e.target.value })}
            className="mt-1 min-h-11 w-full rounded-xl border border-sage-100 px-3 text-sm"
            placeholder="Ex. Nantes"
          />
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-sage-100">
        <legend className="px-1 text-sm font-semibold text-sage-800">
          Planification par défaut
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted">
            Jours
            <input
              type="number"
              min={1}
              max={14}
              value={profile.recipe_days}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  recipe_days: Math.min(
                    14,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                }))
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-sage-100 px-3 text-sm"
            />
          </label>
          <label className="block text-xs text-muted">
            Personnes
            <input
              type="number"
              min={1}
              max={12}
              value={profile.household_size}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  household_size: Math.min(
                    12,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                }))
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-sage-100 px-3 text-sm"
            />
          </label>
        </div>
        <label className="block text-xs text-muted">
          Budget période (€)
          <input
            type="number"
            min={0}
            value={profile.budget_eur}
            onChange={(e) =>
              setProfile((p) => ({
                ...p,
                budget_eur: Number(e.target.value) || 0,
              }))
            }
            className="mt-1 min-h-11 w-full rounded-xl border border-sage-100 px-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {REGIMES.map((r) => {
            const on = profile.dietary_regimes.includes(r.value)
            return (
              <button
                key={r.value}
                type="button"
                onClick={() =>
                  setProfile((p) => {
                    const has = p.dietary_regimes.includes(r.value)
                    if (has && p.dietary_regimes.length === 1) return p
                    return {
                      ...p,
                      dietary_regimes: has
                        ? p.dietary_regimes.filter((x) => x !== r.value)
                        : [...p.dietary_regimes, r.value],
                    }
                  })
                }
                className={`min-h-10 rounded-xl px-3 text-sm ${
                  on
                    ? 'bg-sage-100 text-sage-800'
                    : 'bg-sage-50 text-muted ring-1 ring-sage-100'
                }`}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-sage-100">
        <legend className="px-1 text-sm font-semibold text-sage-800">
          Intelligence artificielle
        </legend>
        <p className="text-sm text-muted">
          La clé Gemini est configurée côté serveur (Render). Statut :{' '}
          <span className="font-medium text-sage-800">
            {health?.integrations.gemini ? 'prête' : 'non configurée / offline'}
          </span>
        </p>
      </fieldset>

      <button
        type="submit"
        disabled={saving}
        className="min-h-12 w-full rounded-xl bg-sage-800 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      {msg ? <p className="text-sm text-sage-700">{msg}</p> : null}
    </form>
  )
}
