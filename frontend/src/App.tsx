import { useEffect, useState } from 'react'
import { fetchHealth } from './api/client'
import { AgentConsole } from './components/AgentConsole'
import { EstimationView } from './components/EstimationView'
import { HistoryView } from './components/HistoryView'
import { ProfileForm } from './components/ProfileForm'
import {
  AgentWorkspaceProvider,
  useAgentWorkspace,
} from './state/AgentWorkspaceContext'
import type { AppSection, HealthResponse } from './types/domain'

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; data: HealthResponse }
  | { status: 'error'; message: string }

function IntegrationPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm ${
        ready
          ? 'bg-sage-100 text-sage-800'
          : 'bg-white/70 text-muted ring-1 ring-sage-100'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${ready ? 'bg-sage-600' : 'bg-citrus'}`}
        aria-hidden
      />
      {label}
      <span className="text-xs opacity-70">{ready ? 'prêt' : 'à configurer'}</span>
    </span>
  )
}

function AppShell() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const { section, setSection, menuValidated, session, startFresh } =
    useAgentWorkspace()

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((data) => setState({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message =
          err instanceof Error ? err.message : 'Impossible de joindre l’API'
        setState({ status: 'error', message })
      })
    return () => controller.abort()
  }, [])

  const navBtn = (id: AppSection, label: string) => (
    <button
      type="button"
      onClick={() => setSection(id)}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        section === id
          ? 'bg-sage-100 font-medium text-sage-800'
          : 'bg-white/60 text-muted ring-1 ring-sage-100 hover:ring-sage-600/30'
      }`}
    >
      {label}
      {id === 'results' && menuValidated && session?.result ? (
        <span className="ml-1 text-citrus">●</span>
      ) : null}
    </button>
  )

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col px-5 py-10 sm:px-8">
      <header className="mb-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium tracking-wide text-sage-600 uppercase">
            SmartChef Agent
          </p>
          {session?.result ? (
            <button
              type="button"
              onClick={() => void startFresh()}
              className="text-xs font-medium text-muted underline-offset-2 hover:text-sage-800 hover:underline"
            >
              Nouvelle liste
            </button>
          ) : null}
        </div>
        <h1 className="font-display text-4xl leading-tight text-sage-800 sm:text-5xl">
          Planifier. Cuisiner. Courses.
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Peaufinez votre menu avec l’agent, validez-le, puis cochez vos courses —
          l’historique conserve chaque session.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-3" aria-label="Navigation modules">
        {navBtn('agent', 'Console')}
        {navBtn('results', 'Estimation')}
        {navBtn('history', 'Historique')}
        {navBtn('profile', 'Profil')}
        {navBtn('status', 'Statut')}
      </nav>

      {section === 'agent' && (
        <section
          aria-labelledby="agent-heading"
          className="rounded-2xl border border-sage-100 bg-white/80 p-5 shadow-sm backdrop-blur-sm"
        >
          <h2
            id="agent-heading"
            className="mb-1 text-lg font-semibold text-sage-800"
          >
            Console de peaufinage
          </h2>
          <p className="mb-5 text-sm text-muted">
            Générez et ajustez le menu. Validez uniquement quand vous êtes
            satisfait.
          </p>
          <AgentConsole />
        </section>
      )}

      {section === 'results' && (
        <section
          aria-labelledby="results-heading"
          className="rounded-2xl border border-sage-100 bg-white/80 p-5 shadow-sm backdrop-blur-sm"
        >
          <h2 id="results-heading" className="sr-only">
            Estimation et courses
          </h2>
          <EstimationView />
        </section>
      )}

      {section === 'history' && (
        <section
          aria-labelledby="history-heading"
          className="rounded-2xl border border-sage-100 bg-white/80 p-5 shadow-sm backdrop-blur-sm"
        >
          <h2 id="history-heading" className="sr-only">
            Historique des sessions
          </h2>
          <HistoryView />
        </section>
      )}

      {section === 'profile' && (
        <section
          aria-labelledby="profile-heading"
          className="rounded-2xl border border-sage-100 bg-white/80 p-5 shadow-sm backdrop-blur-sm"
        >
          <h2
            id="profile-heading"
            className="mb-1 text-lg font-semibold text-sage-800"
          >
            Profil & préférences
          </h2>
          <p className="mb-5 text-sm text-muted">
            Foyer, budget de période, jours de recettes (max. 14) et régimes.
          </p>
          <ProfileForm />
        </section>
      )}

      {section === 'status' && (
        <section
          aria-live="polite"
          className="rounded-2xl border border-sage-100 bg-white/80 p-5 shadow-sm backdrop-blur-sm"
        >
          <h2 className="mb-3 text-lg font-semibold text-sage-800">
            Statut backend
          </h2>
          {state.status === 'loading' && (
            <p className="text-muted">
              Vérification de <code className="text-sage-800">/health</code>…
            </p>
          )}
          {state.status === 'error' && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-red-700">API injoignable</p>
              <p className="text-muted">{state.message}</p>
            </div>
          )}
          {state.status === 'ok' && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                <span className="font-medium text-sage-800">
                  {state.data.service}
                </span>
                {' · '}v{state.data.version}
                {' · '}
                {state.data.environment}
              </p>
              <div className="flex flex-wrap gap-2">
                <IntegrationPill
                  label="Gemini"
                  ready={state.data.integrations.gemini}
                />
                <IntegrationPill
                  label="YouTube"
                  ready={state.data.integrations.youtube}
                />
                <IntegrationPill
                  label="Google Keep"
                  ready={state.data.integrations.google_keep}
                />
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default function App() {
  return (
    <AgentWorkspaceProvider>
      <AppShell />
    </AgentWorkspaceProvider>
  )
}
