import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  agentRunStreamUrl,
  fetchAgentRun,
  startAgentRun,
} from '../api/client'
import type { AgentLogEvent, AgentSession, MenuPlan } from '../types/domain'

function logTone(level: string): string {
  switch (level) {
    case 'error':
      return 'text-red-300'
    case 'success':
      return 'text-emerald-300'
    case 'warn':
      return 'text-amber-200'
    default:
      return 'text-sage-50'
  }
}

function MenuResult({ menu }: { menu: MenuPlan }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-sage-800">
          Planning de la semaine
        </h3>
        <ul className="divide-y divide-sage-100 overflow-hidden rounded-lg ring-1 ring-sage-100">
          {menu.days.map((day) => (
            <li
              key={`${day.day}-${day.meal_type}-${day.recipe_title}`}
              className="flex flex-col gap-0.5 bg-white/70 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <span className="font-medium text-sage-800">{day.day}</span>
              <span className="text-sm text-muted">
                {day.recipe_title}
                {day.meal_type ? (
                  <span className="opacity-70"> · {day.meal_type}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-sage-800">Recettes</h3>
        <div className="space-y-3">
          {menu.recipes.map((recipe) => (
            <details
              key={recipe.title}
              className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-sage-100 open:shadow-sm"
            >
              <summary className="cursor-pointer font-medium text-sage-800">
                {recipe.title}
                <span className="ml-2 text-xs font-normal text-muted">
                  {recipe.servings} pers.
                </span>
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                {recipe.steps.map((step, index) => (
                  <li key={`${recipe.title}-${index}`}>{step}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AgentConsole() {
  const formId = useId()
  const [prompt, setPrompt] = useState(
    'Menu équilibré pour la semaine, plats simples et rapides le soir.',
  )
  const [session, setSession] = useState<AgentSession | null>(null)
  const [logs, setLogs] = useState<AgentLogEvent[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    return () => {
      esRef.current?.close()
    }
  }, [])

  function applySession(next: AgentSession) {
    setSession(next)
    setLogs(next.logs)
    if (next.status === 'completed' || next.status === 'failed') {
      setRunning(false)
    }
  }

  function watchRun(runId: string) {
    esRef.current?.close()

    const source = new EventSource(agentRunStreamUrl(runId))
    esRef.current = source

    source.addEventListener('log', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          log: AgentLogEvent
          status: string
        }
        setLogs((prev) => [...prev, payload.log])
        setSession((prev) =>
          prev ? { ...prev, status: payload.status, logs: [...prev.logs, payload.log] } : prev,
        )
      } catch {
        // ignore malformed SSE
      }
    })

    source.addEventListener('done', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          session: AgentSession
        }
        applySession(payload.session)
      } catch {
        void fetchAgentRun(runId).then(applySession).catch(() => undefined)
      } finally {
        source.close()
        setRunning(false)
      }
    })

    source.addEventListener('error', () => {
      // Fallback polling if SSE drops
      source.close()
      void (async () => {
        try {
          for (let i = 0; i < 60; i += 1) {
            const current = await fetchAgentRun(runId)
            applySession(current)
            if (current.status === 'completed' || current.status === 'failed') {
              return
            }
            await new Promise((r) => setTimeout(r, 800))
          }
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Suivi du run impossible')
        } finally {
          setRunning(false)
        }
      })()
    })
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = prompt.trim()
    if (trimmed.length < 3) {
      setError('La consigne doit contenir au moins 3 caractères.')
      return
    }

    setError(null)
    setRunning(true)
    setLogs([])
    setSession(null)

    try {
      const started = await startAgentRun(trimmed)
      applySession(started)
      setRunning(true)
      watchRun(started.id)
    } catch (err: unknown) {
      setRunning(false)
      setError(err instanceof Error ? err.message : 'Lancement impossible')
    }
  }

  return (
    <div className="space-y-5">
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-1.5" htmlFor={formId}>
          <span className="text-sm font-medium text-sage-800">
            Consigne pour l’agent
          </span>
          <textarea
            id={formId}
            rows={3}
            maxLength={2000}
            value={prompt}
            disabled={running}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex. Semaine végétarienne, budget serré, cuisine méditerranéenne…"
            className="w-full resize-y rounded-lg border border-sage-100 bg-white px-3 py-2 text-ink outline-none ring-sage-600 focus:ring-2 disabled:opacity-60"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={running}
            className="rounded-lg bg-sage-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sage-600 disabled:cursor-wait disabled:opacity-70"
          >
            {running ? 'Agent en cours…' : 'Lancer l’agent'}
          </button>
          {session && (
            <span className="text-sm text-muted">
              Statut :{' '}
              <span className="font-medium text-sage-800">{session.status}</span>
            </span>
          )}
        </div>
      </form>

      {error && (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-sage-800">
          Logs d’exécution
        </h3>
        <div
          className="max-h-56 overflow-y-auto rounded-lg bg-sage-800/95 px-3 py-2 font-mono text-xs leading-relaxed text-sage-50"
          aria-live="polite"
        >
          {logs.length === 0 ? (
            <p className="text-sage-100/70">
              Les appels d’outils Gemini apparaîtront ici en direct.
            </p>
          ) : (
            logs.map((log, index) => (
              <p
                key={`${log.timestamp ?? 't'}-${index}`}
                className={`whitespace-pre-wrap ${logTone(log.level)}`}
              >
                {log.tool ? `[${log.tool}] ` : ''}
                {log.message}
              </p>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {session?.status === 'failed' && session.error && (
        <p className="text-sm text-red-700" role="alert">
          {session.error}
        </p>
      )}

      {session?.result && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-sage-800">
            Résultat — menu généré
          </h3>
          {session.summary && (
            <p className="mb-3 text-sm text-muted">{session.summary}</p>
          )}
          <MenuResult menu={session.result} />
        </div>
      )}
    </div>
  )
}
