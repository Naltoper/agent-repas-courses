import { useEffect, useId, useState, type FormEvent } from 'react'
import { fetchProfile, saveProfile } from '../api/client'
import type { DietaryRegime, UserProfile } from '../types/domain'

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
  dietary_regimes: ['omnivore'],
  notes: '',
}

type SaveFeedback =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

export function ProfileForm() {
  const formId = useId()
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<SaveFeedback>({ kind: 'idle' })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)

    fetchProfile(controller.signal)
      .then((data) => {
        setProfile(data)
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
        message: 'Préférences enregistrées. Elles seront reprises au prochain chargement.',
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

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
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
            className="w-full rounded-lg border border-sage-100 bg-white px-3 py-2 text-ink outline-none ring-sage-600 focus:ring-2"
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
            className="w-full rounded-lg border border-sage-100 bg-white px-3 py-2 text-ink outline-none ring-sage-600 focus:ring-2"
          />
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
          className="w-full resize-y rounded-lg border border-sage-100 bg-white px-3 py-2 text-ink outline-none ring-sage-600 focus:ring-2"
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
