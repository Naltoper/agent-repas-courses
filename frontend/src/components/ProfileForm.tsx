import { useEffect, useId, useState, type FormEvent } from 'react'
import { fetchGeminiModels, fetchProfile, saveProfile } from '../api/client'
import type {
  DietaryRegime,
  GeminiModelInfo,
  ModelSelectionMode,
  RecipeDays,
  UserProfile,
} from '../types/domain'

const REGIME_OPTIONS: { value: DietaryRegime; label: string }[] = [
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'vegetarian', label: 'Végétarien' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten_free', label: 'Sans gluten' },
  { value: 'halal', label: 'Halal' },
  { value: 'other', label: 'Autre' },
]

const EMPTY_PROFILE: UserProfile = {
  household_size: 2,
  weekly_budget_eur: 80,
  recipe_days: 5,
  dietary_regimes: ['omnivore'],
  notes: '',
  model_selection_mode: 'auto',
  preferred_model: 'gemini-3.5-flash-lite',
}

type SaveFeedback =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

const selectClass =
  'w-full rounded-lg border border-sage-100 bg-white px-3 py-2 text-ink outline-none ring-sage-600 focus:ring-2'

export function ProfileForm() {
  const formId = useId()
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE)
  const [models, setModels] = useState<GeminiModelInfo[]>([])
  const [fallbackHint, setFallbackHint] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<SaveFeedback>({ kind: 'idle' })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)

    Promise.all([
      fetchProfile(controller.signal),
      fetchGeminiModels(controller.signal),
    ])
      .then(([data, catalog]) => {
        setProfile({
          ...EMPTY_PROFILE,
          ...data,
          preferred_model:
            data.preferred_model || catalog.default_model || EMPTY_PROFILE.preferred_model,
        })
        setModels(catalog.models)
        setFallbackHint(catalog.fallback_models)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message =
          err instanceof Error ? err.message : 'Chargement du profil impossible'
        setLoadError(message)
        setLoading(false)
      })

    return () => controller.abort()
  }, [])

  function toggleRegime(regime: DietaryRegime) {
    setFeedback({ kind: 'idle' })
    setProfile((prev) => {
      const has = prev.dietary_regimes.includes(regime)
      if (has) {
        if (prev.dietary_regimes.length === 1) return prev
        return {
          ...prev,
          dietary_regimes: prev.dietary_regimes.filter((r) => r !== regime),
        }
      }
      return { ...prev, dietary_regimes: [...prev.dietary_regimes, regime] }
    })
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback({ kind: 'saving' })
    try {
      const saved = await saveProfile(profile)
      setProfile(saved)
      setFeedback({
        kind: 'success',
        message:
          'Préférences enregistrées (modèle inclus). Elles seront utilisées au prochain run agent.',
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Échec de la sauvegarde'
      setFeedback({ kind: 'error', message })
    }
  }

  if (loading) {
    return (
      <p className="text-muted" aria-live="polite">
        Chargement du profil…
      </p>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-2 text-sm" role="alert">
        <p className="font-medium text-red-700">Impossible de charger le profil</p>
        <p className="text-muted">{loadError}</p>
      </div>
    )
  }

  const selectedModel = models.find((m) => m.id === profile.preferred_model)

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-3">
        <label className="block space-y-1.5" htmlFor={`${formId}-size`}>
          <span className="text-sm font-medium text-sage-800">
            Nombre de personnes
          </span>
          <input
            id={`${formId}-size`}
            type="number"
            min={1}
            max={12}
            required
            value={profile.household_size}
            onChange={(e) => {
              setFeedback({ kind: 'idle' })
              setProfile((p) => ({
                ...p,
                household_size: Number(e.target.value) || 1,
              }))
            }}
            className={selectClass}
          />
        </label>

        <label className="block space-y-1.5" htmlFor={`${formId}-budget`}>
          <span className="text-sm font-medium text-sage-800">
            Budget hebdomadaire (€)
          </span>
          <input
            id={`${formId}-budget`}
            type="number"
            min={0}
            step={1}
            required
            value={profile.weekly_budget_eur}
            onChange={(e) => {
              setFeedback({ kind: 'idle' })
              setProfile((p) => ({
                ...p,
                weekly_budget_eur: Number(e.target.value) || 0,
              }))
            }}
            className={selectClass}
          />
        </label>

        <label className="block space-y-1.5" htmlFor={`${formId}-days`}>
          <span className="text-sm font-medium text-sage-800">
            Jours de recettes
          </span>
          <select
            id={`${formId}-days`}
            value={profile.recipe_days}
            onChange={(e) => {
              setFeedback({ kind: 'idle' })
              setProfile((p) => ({
                ...p,
                recipe_days: Number(e.target.value) as RecipeDays,
              }))
            }}
            className={selectClass}
          >
            <option value={3}>3 jours</option>
            <option value={5}>5 jours</option>
            <option value={7}>7 jours</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-sage-800">
          Régimes alimentaires
        </legend>
        <div className="flex flex-wrap gap-2">
          {REGIME_OPTIONS.map((option) => {
            const checked = profile.dietary_regimes.includes(option.value)
            return (
              <label
                key={option.value}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm ring-1 transition ${
                  checked
                    ? 'bg-sage-100 text-sage-800 ring-sage-600/30'
                    : 'bg-white/80 text-muted ring-sage-100 hover:ring-sage-600/20'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleRegime(option.value)}
                />
                {option.label}
              </label>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Au moins un régime doit rester sélectionné.
        </p>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl bg-sage-50/60 p-4 ring-1 ring-sage-100">
        <legend className="px-1 text-sm font-semibold text-sage-800">
          Modèle Gemini
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5" htmlFor={`${formId}-mode`}>
            <span className="text-sm font-medium text-sage-800">
              Mode de sélection
            </span>
            <select
              id={`${formId}-mode`}
              value={profile.model_selection_mode}
              onChange={(e) => {
                setFeedback({ kind: 'idle' })
                setProfile((p) => ({
                  ...p,
                  model_selection_mode: e.target.value as ModelSelectionMode,
                }))
              }}
              className={selectClass}
            >
              <option value="auto">Auto (fallback si quota / indispo)</option>
              <option value="manual">Manuel (modèle imposé)</option>
            </select>
          </label>

          <label className="block space-y-1.5" htmlFor={`${formId}-model`}>
            <span className="text-sm font-medium text-sage-800">
              Modèle préféré
            </span>
            <select
              id={`${formId}-model`}
              value={profile.preferred_model}
              onChange={(e) => {
                setFeedback({ kind: 'idle' })
                setProfile((p) => ({ ...p, preferred_model: e.target.value }))
              }}
              className={selectClass}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                  {model.recommended ? ' ★' : ''}
                </option>
              ))}
              {!models.some((m) => m.id === profile.preferred_model) && (
                <option value={profile.preferred_model}>
                  {profile.preferred_model} (persiste)
                </option>
              )}
            </select>
          </label>
        </div>

        {selectedModel?.description && (
          <p className="text-xs text-muted">{selectedModel.description}</p>
        )}
        {profile.model_selection_mode === 'auto' && fallbackHint.length > 0 && (
          <p className="text-xs text-muted">
            Secours auto : {fallbackHint.join(' → ')}
          </p>
        )}
      </fieldset>

      <label className="block space-y-1.5" htmlFor={`${formId}-notes`}>
        <span className="text-sm font-medium text-sage-800">
          Notes / contraintes (optionnel)
        </span>
        <textarea
          id={`${formId}-notes`}
          rows={3}
          maxLength={500}
          value={profile.notes}
          onChange={(e) => {
            setFeedback({ kind: 'idle' })
            setProfile((p) => ({ ...p, notes: e.target.value }))
          }}
          placeholder="Ex. allergies, magasin préféré, repas du midi au bureau…"
          className={`${selectClass} resize-y`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={feedback.kind === 'saving'}
          className="rounded-lg bg-sage-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sage-600 disabled:cursor-wait disabled:opacity-70"
        >
          {feedback.kind === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
        </button>

        <div aria-live="polite" className="text-sm">
          {feedback.kind === 'success' && (
            <p className="font-medium text-sage-600">{feedback.message}</p>
          )}
          {feedback.kind === 'error' && (
            <p className="font-medium text-red-700">{feedback.message}</p>
          )}
        </div>
      </div>
    </form>
  )
}
