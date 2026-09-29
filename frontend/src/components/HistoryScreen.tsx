import { useEffect, useState } from 'react'
import {
  deleteHistorySession,
  fetchSessionHistory,
  renameHistorySession,
} from '../api/client'
import { useAgentWorkspace } from '../state/AgentWorkspaceContext'
import type { SessionSummary } from '../types/domain'

function formatDate(value: string | null): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function HistoryScreen() {
  const { resumeSession, startFresh, session, restoring, running } =
    useAgentWorkspace()
  const [items, setItems] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const c = new AbortController()
    setLoading(true)
    fetchSessionHistory(c.signal)
      .then(setItems)
      .catch((err: unknown) => {
        if (!c.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Historique indisponible')
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [session?.id, session?.updated_at, refreshKey])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-sage-800">Historique</h2>
          <p className="text-sm text-muted">
            Rouvrir un menu pour le réutiliser ou l’ajuster.
          </p>
        </div>
        <button
          type="button"
          disabled={running || restoring}
          onClick={() => void startFresh()}
          className="min-h-11 rounded-xl bg-sage-800 px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          Nouveau
        </button>
      </div>

      {loading && <p className="text-sm text-muted">Chargement…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted">Aucun menu sauvegardé.</p>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const active = session?.id === item.id
          const editing = editingId === item.id
          return (
            <li
              key={item.id}
              className={`rounded-2xl px-3 py-3 ring-1 ${
                active ? 'bg-sage-50 ring-sage-300' : 'bg-white ring-sage-100'
              }`}
            >
              {editing ? (
                <div className="flex gap-2">
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-sage-200 px-3 text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-sage-800 px-3 text-sm text-white"
                    onClick={() => {
                      void (async () => {
                        setBusyId(item.id)
                        try {
                          await renameHistorySession(item.id, draftTitle.trim())
                          setEditingId(null)
                          setRefreshKey((k) => k + 1)
                        } catch (err: unknown) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Renommage impossible',
                          )
                        } finally {
                          setBusyId(null)
                        }
                      })()
                    }}
                  >
                    OK
                  </button>
                </div>
              ) : (
                <>
                  <p className="font-medium text-sage-800">
                    {item.title || item.prompt}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(item.updated_at)} · {item.days_count} j
                    {item.estimated_total_eur != null
                      ? ` · ${item.estimated_total_eur.toFixed(2)} €`
                      : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={active || busyId === item.id}
                      onClick={() => void resumeSession(item.id)}
                      className="min-h-10 rounded-xl bg-sage-800 px-3 text-sm text-white disabled:opacity-50"
                    >
                      {active ? 'Ouvert' : 'Ouvrir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id)
                        setDraftTitle(item.title || item.prompt)
                      }}
                      className="min-h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-sage-200"
                    >
                      Renommer
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Supprimer ce menu de l’historique ?',
                          )
                        )
                          return
                        void (async () => {
                          setBusyId(item.id)
                          try {
                            await deleteHistorySession(item.id)
                            if (session?.id === item.id) await startFresh()
                            setRefreshKey((k) => k + 1)
                          } catch (err: unknown) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Suppression impossible',
                            )
                          } finally {
                            setBusyId(null)
                          }
                        })()
                      }}
                      className="min-h-10 rounded-xl bg-white px-3 text-sm text-red-700 ring-1 ring-red-100"
                    >
                      Supprimer
                    </button>
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
