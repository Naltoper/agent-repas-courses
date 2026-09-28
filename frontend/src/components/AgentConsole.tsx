import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAgentWorkspace } from '../state/AgentWorkspaceContext'
import { MenuPlanningCards } from './MenuDisplays'

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

export function AgentConsole() {
  const formId = useId()
  const {
    prompt,
    setPrompt,
    session,
    logs,
    messages,
    running,
    error,
    restoring,
    startRun,
    sendFollowUp,
    validateMenu,
  } = useAgentWorkspace()

  const [followUp, setFollowUp] = useState('')
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await startRun(prompt)
  }

  async function onFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = followUp.trim()
    if (trimmed.length < 2) return
    setFollowUp('')
    await sendFollowUp(trimmed)
  }

  const canChat =
    !!session?.id &&
    !!session.result &&
    (session.status === 'completed' || session.status === 'failed') &&
    !running

  const canValidate =
    !!session?.result &&
    session.status === 'completed' &&
    !running

  if (restoring) {
    return <p className="text-muted">Restauration de la dernière session…</p>
  }

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
            <p className="text-muted">
              Discutez avec l’agent pour peaufiner le menu avant validation.
            </p>
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
            placeholder="Ex. Remplace le mardi par un plat végétarien…"
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
          className="max-h-40 overflow-y-auto rounded-lg bg-sage-800/95 px-3 py-2 font-mono text-xs leading-relaxed text-sage-50"
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
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-sage-800">
            Menu en cours de peaufinage
          </h3>
          <MenuPlanningCards menu={session.result} />
          <button
            type="button"
            disabled={!canValidate}
            onClick={() => void validateMenu()}
            className="w-full rounded-lg bg-citrus px-4 py-3 text-sm font-semibold text-sage-800 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Valider ce menu
          </button>
          <p className="text-xs text-muted">
            La validation ouvre l’estimation budgétaire et la liste de courses
            par rayon.
          </p>
        </div>
      )}
    </div>
  )
}
