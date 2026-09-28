import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  agentRunStreamUrl,
  fetchAgentRun,
  sendAgentFollowUp,
  startAgentRun,
} from '../api/client'
import type {
  AgentLogEvent,
  AgentSession,
  ChatMessage,
  MenuPlan,
} from '../types/domain'

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

function groupByAisle(menu: MenuPlan) {
  const groups = new Map<string, typeof menu.shopping_list>()
  for (const item of menu.shopping_list) {
    const aisle = item.aisle || 'Divers'
    const list = groups.get(aisle) ?? []
    list.push(item)
    groups.set(aisle, list)
  }
  return [...groups.entries()]
}

function MenuResult({ menu }: { menu: MenuPlan }) {
  const aisleGroups = groupByAisle(menu)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-sage-800">Planning</h3>
        <ul className="divide-y divide-sage-100 overflow-hidden rounded-lg ring-1 ring-sage-100">
          {menu.days.map((day) => (
            <li
              key={`${day.day}-${day.meal_type}-${day.recipe_title}`}
              className="flex flex-col gap-0.5 bg-white/70 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <span className="font-medium text-sage-800">{day.day}</span>
              <span className="text-sm text-muted">{day.recipe_title}</span>
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
              className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-sage-100"
            >
              <summary className="cursor-pointer font-medium text-sage-800">
                {recipe.title}
                <span className="ml-2 text-xs font-normal text-muted">
                  {recipe.servings} pers.
                </span>
              </summary>
              {recipe.ingredients?.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={`${recipe.title}-ing-${i}`}>{ing}</li>
                  ))}
                </ul>
              )}
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                {recipe.steps.map((step, index) => (
                  <li key={`${recipe.title}-${index}`}>{step}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </div>

      {menu.budget && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            menu.budget.within_budget
              ? 'bg-emerald-50 text-sage-800 ring-emerald-200'
              : 'bg-amber-50 text-amber-900 ring-amber-200'
          }`}
        >
          <p className="font-semibold">
            Budget estimé : {menu.budget.estimated_total_eur.toFixed(2)} €
            {' / '}
            {menu.budget.weekly_budget_eur.toFixed(2)} €
          </p>
          <p className="text-xs opacity-80">
            {menu.budget.within_budget
              ? `Dans le budget (marge ${(-menu.budget.delta_eur).toFixed(2)} €)`
              : `Dépassement de ${menu.budget.delta_eur.toFixed(2)} €`}
          </p>
        </div>
      )}

      {aisleGroups.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-sage-800">
            Liste de courses par rayon
          </h3>
          <div className="space-y-3">
            {aisleGroups.map(([aisle, items]) => (
              <div key={aisle}>
                <p className="mb-1 text-xs font-semibold tracking-wide text-sage-600 uppercase">
                  {aisle}
                </p>
                <ul className="rounded-lg bg-white/70 text-sm ring-1 ring-sage-100">
                  {items.map((item, idx) => (
                    <li
                      key={`${aisle}-${item.name}-${idx}`}
                      className="flex items-center justify-between gap-2 border-b border-sage-50 px-3 py-1.5 last:border-0"
                    >
                      <span>
                        {item.name}{' '}
                        <span className="text-muted">× {item.quantity}</span>
                      </span>
                      <span className="text-muted">
                        {item.estimated_price_eur != null
                          ? `${item.estimated_price_eur.toFixed(2)} €`
                          : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AgentConsole() {
  const formId = useId()
  const [prompt, setPrompt] = useState(
    'Menu équilibré, plats simples et rapides le soir.',
  )
  const [followUp, setFollowUp] = useState('')
  const [session, setSession] = useState<AgentSession | null>(null)
  const [logs, setLogs] = useState<AgentLogEvent[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => esRef.current?.close()
  }, [])

  function applySession(next: AgentSession) {
    setSession(next)
    setLogs(next.logs ?? [])
    setMessages(next.messages ?? [])
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
          prev
            ? {
                ...prev,
                status: payload.status,
                logs: [...prev.logs, payload.log],
              }
            : prev,
        )
      } catch {
        // ignore
      }
    })

    source.addEventListener('chat', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          message: ChatMessage
        }
        setMessages((prev) => {
          const exists = prev.some(
            (m) =>
              m.role === payload.message.role &&
              m.content === payload.message.content &&
              m.timestamp === payload.message.timestamp,
          )
          return exists ? prev : [...prev, payload.message]
        })
      } catch {
        // ignore
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
      source.close()
      void (async () => {
        try {
          for (let i = 0; i < 90; i += 1) {
            const current = await fetchAgentRun(runId)
            applySession(current)
            if (current.status === 'completed' || current.status === 'failed') {
              return
            }
            await new Promise((r) => setTimeout(r, 800))
          }
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Suivi impossible')
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
    setMessages([])
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

  async function onFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session?.id) return
    const trimmed = followUp.trim()
    if (trimmed.length < 2) return

    setError(null)
    setRunning(true)
    setFollowUp('')
    try {
      await sendAgentFollowUp(session.id, trimmed)
      setRunning(true)
      watchRun(session.id)
    } catch (err: unknown) {
      setRunning(false)
      setError(err instanceof Error ? err.message : 'Follow-up impossible')
    }
  }

  const canChat =
    !!session?.id &&
    !!session.result &&
    (session.status === 'completed' || session.status === 'failed') &&
    !running

  return (
    <div className="space-y-5">
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-1.5" htmlFor={formId}>
          <span className="text-sm font-medium text-sage-800">
            Consigne initiale
          </span>
          <textarea
            id={formId}
            rows={3}
            maxLength={2000}
            value={prompt}
            disabled={running}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full resize-y rounded-lg border border-sage-100 bg-white px-3 py-2 text-ink outline-none ring-sage-600 focus:ring-2 disabled:opacity-60"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={running}
            className="rounded-lg bg-sage-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sage-600 disabled:cursor-wait disabled:opacity-70"
          >
            {running && !session?.result ? 'Agent en cours…' : 'Lancer l’agent'}
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
        <h3 className="mb-2 text-sm font-semibold text-sage-800">Conversation</h3>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg bg-white/80 px-3 py-2 text-sm ring-1 ring-sage-100">
          {messages.length === 0 ? (
            <p className="text-muted">Les échanges avec l’agent apparaîtront ici.</p>
          ) : (
            messages.map((msg, index) => (
              <div
                key={`${msg.timestamp ?? index}-${msg.role}`}
                className={
                  msg.role === 'user'
                    ? 'rounded-md bg-sage-100 px-2 py-1.5 text-sage-800'
                    : 'rounded-md bg-sage-50 px-2 py-1.5 text-muted'
                }
              >
                <span className="mr-2 text-[10px] font-semibold tracking-wide uppercase opacity-70">
                  {msg.role === 'user' ? 'Vous' : 'Agent'}
                </span>
                <span className="whitespace-pre-wrap">{msg.content}</span>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {canChat && (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onFollowUp}>
          <input
            type="text"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Ex. Remplace le mardi par un plat végétarien, retire le thon…"
            className="min-w-0 flex-1 rounded-lg border border-sage-100 bg-white px-3 py-2 text-sm outline-none ring-sage-600 focus:ring-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-sage-600 px-4 py-2 text-sm font-medium text-white hover:bg-sage-800"
          >
            Envoyer
          </button>
        </form>
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
            <p className="text-sage-100/70">En attente des outils Gemini…</p>
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
            Résultats — menu, courses & budget
          </h3>
          <MenuResult menu={session.result} />
        </div>
      )}
    </div>
  )
}
