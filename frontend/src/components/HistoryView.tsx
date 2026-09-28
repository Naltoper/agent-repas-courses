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

export function HistoryView() {
  const { resumeSession, startFresh, session, restoring, running } =
    useAgentWorkspace()
  const [items, setItems] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchSessionHistory(controller.signal)
      .then(setItems)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Historique indisponible')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [session?.id, session?.updated_at, session?.title, refreshKey])

  async function onResume(id: string) {
    setLoadingId(id)
    try {
      await resumeSession(id)
    } finally {
      setLoadingId(null)
    }
  }

  function startRename(item: SessionSummary) {
    setEditingId(item.id)
    setDraftTitle(item.title || item.prompt)
    setError(null)
  }

  async function confirmRename(id: string) {
    const title = draftTitle.trim()
    if (title.length < 1) {
      setError('Le titre ne peut pas être vide.')
      return
    }
    setBusyId(id)
    try {
      await renameHistorySession(id, title)
      setEditingId(null)
      if (session?.id === id) {
        // Refresh active session title without full reload
        await resumeSession(id)
      }
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Renommage impossible')
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(id: string) {
    const ok = window.confirm(
      'Supprimer cette session de l’historique ? Cette action est définitive.',
    )
    if (!ok) return
    setBusyId(id)
    try {
      await deleteHistorySession(id)
      if (session?.id === id) {
        await startFresh()
      }
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Suppression impossible')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-sage-800">Historique</h3>
          <p className="text-sm text-muted">
            Reprenez, renommez ou supprimez une session (menu, courses et
            cases cochées inclus).
          </p>
        </div>
        <button
          type="button"
          disabled={running || restoring}
          onClick={() => void startFresh()}
          className="rounded-lg bg-sage-800 px-4 py-2 text-sm font-medium text-white hover:bg-sage-600 disabled:opacity-60"
        >
          Nouvelle liste
        </button>
      </div>

      {loading && <p className="text-sm text-muted">Chargement…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted">
          Aucune session enregistrée pour l’instant.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const active = session?.id === item.id
          const editing = editingId === item.id
          const busy = busyId === item.id
          return (
            <li
              key={item.id}
              className={`rounded-xl px-4 py-3 ring-1 transition ${
                active
                  ? 'bg-sage-50 ring-sage-300'
                  : 'bg-white/80 ring-sage-100 hover:ring-sage-300'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <input
                      type="text"
                      value={draftTitle}
                      maxLength={120}
                      autoFocus
                      disabled={busy}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void confirmRename(item.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="w-full rounded-lg border border-sage-200 bg-white px-2 py-1.5 text-sm text-sage-800 outline-none ring-sage-600 focus:ring-2"
                    />
                  ) : (
                    <p className="truncate font-medium text-sage-800">
                      {item.title || item.prompt}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(item.updated_at)} · {item.days_count} j ·{' '}
                    {item.checked_count}/{item.shopping_count} courses
                    {item.estimated_total_eur != null
                      ? ` · ${item.estimated_total_eur.toFixed(2)} €`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void confirmRename(item.id)}
                        className="rounded-lg bg-sage-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-sage-600 disabled:opacity-50"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-sage-200 bg-white px-3 py-1.5 text-sm text-muted hover:bg-sage-50"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={running || restoring || loadingId === item.id || active}
                        onClick={() => void onResume(item.id)}
                        className="rounded-lg border border-sage-200 bg-white px-3 py-1.5 text-sm font-medium text-sage-800 hover:bg-sage-50 disabled:opacity-50"
                      >
                        {active
                          ? 'En cours'
                          : loadingId === item.id
                            ? 'Ouverture…'
                            : 'Reprendre'}
                      </button>
                      <button
                        type="button"
                        disabled={busy || running}
                        onClick={() => startRename(item)}
                        className="rounded-lg border border-sage-200 bg-white px-3 py-1.5 text-sm text-sage-700 hover:bg-sage-50 disabled:opacity-50"
                      >
                        Renommer
                      </button>
                      <button
                        type="button"
                        disabled={busy || running}
                        onClick={() => void onDelete(item.id)}
                        className="rounded-lg border border-red-100 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
