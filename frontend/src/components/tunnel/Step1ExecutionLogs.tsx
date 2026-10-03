import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../api/client'
import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'

function extractModel(logs: { message: string }[], preferred?: string | null): string {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const m = logs[i].message.match(/Modèle actif\s*:\s*([^\s]+)/i)
    if (m?.[1]) return m[1]
  }
  return preferred?.trim() || '—'
}

function formatTime(ts: string | null): string {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts))
  } catch {
    return ''
  }
}

export function Step1ExecutionLogs() {
  const { logs, session, running, error } = useAgentWorkspace()
  const [open, setOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const prevLen = useRef(0)

  const model = useMemo(
    () => extractModel(logs, session?.profile?.preferred_model),
    [logs, session?.profile?.preferred_model],
  )

  const statusLabel = running
    ? 'en cours'
    : session?.status === 'failed'
      ? 'échec'
      : session?.status === 'completed'
        ? 'terminé'
        : session?.status || 'idle'

  // Auto-open when a run starts producing logs
  useEffect(() => {
    if (running && logs.length > 0) setOpen(true)
  }, [running, logs.length])

  useEffect(() => {
    if (!open || logs.length === prevLen.current) {
      prevLen.current = logs.length
      return
    }
    prevLen.current = logs.length
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs, open])

  return (
    <section className="mt-4 rounded-2xl bg-sage-50/80 ring-1 ring-sage-100">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <p className="text-xs font-semibold tracking-wide text-sage-700 uppercase">
            Logs d&apos;exécution &amp; API
          </p>
          <p className="font-mono text-[11px] text-muted">
            {statusLabel}
            {model !== '—' ? ` · ${model}` : ''}
            {logs.length ? ` · ${logs.length} evt` : ''}
          </p>
        </div>
        <span className="text-sm text-muted" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        <div className="border-t border-sage-100 px-3 pb-3 pt-2">
          <div className="mb-2 space-y-0.5 font-mono text-[11px] text-sage-700">
            <p>
              <span className="text-muted">base</span> {API_BASE}
            </p>
            <p>
              <span className="text-muted">modèle</span> {model}
            </p>
            <p>
              <span className="text-muted">session</span>{' '}
              {session?.id ? `${session.id.slice(0, 8)}…` : '—'} · {statusLabel}
            </p>
            {error ? (
              <p className="text-red-700">
                <span className="text-muted">erreur</span> {error}
              </p>
            ) : null}
          </div>

          <div
            ref={scrollerRef}
            className="max-h-48 overflow-y-auto rounded-xl bg-white/90 p-2 ring-1 ring-sage-100"
          >
            {logs.length === 0 ? (
              <p className="font-mono text-xs text-muted">
                Aucun log pour l&apos;instant. Lancez une génération pour voir
                les appels et étapes agent.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {logs.map((log, i) => (
                  <li
                    key={`${log.timestamp ?? 't'}-${i}`}
                    className="font-mono text-xs leading-snug text-sage-800"
                  >
                    <span className="text-muted">
                      {formatTime(log.timestamp)}
                      {log.level !== 'info' ? ` [${log.level}]` : ''}
                      {log.tool ? ` · tool:${log.tool}` : ''}
                    </span>
                    <br />
                    {log.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
