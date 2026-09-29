import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'

export function Step1ChatTab() {
  const {
    messages,
    running,
    sendFollowUp,
    validateMenu,
    session,
    menuValidated,
  } = useAgentWorkspace()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, running])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (t.length < 2) return
    setText('')
    await sendFollowUp(t)
  }

  const canValidate =
    !!session?.result &&
    session.status === 'completed' &&
    !running &&
    !menuValidated

  return (
    <div className="flex min-h-[50vh] flex-col pb-4">
      {canValidate ? (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-sage-800 px-3 py-2.5 text-white">
          <p className="text-sm">Menu prêt à valider</p>
          <button
            type="button"
            onClick={() => void validateMenu()}
            className="min-h-10 rounded-lg bg-citrus px-3 text-sm font-semibold text-sage-800"
          >
            Valider &amp; courses
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl bg-white/80 px-3 py-3 ring-1 ring-sage-100">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            Discutez avec le chef IA pour ajuster le menu (remplacer un jour,
            budget, allergies…).
          </p>
        ) : (
          messages.map((msg, i) => (
            <div
              key={`${msg.timestamp ?? i}-${msg.role}`}
              className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'ml-auto bg-sage-100 text-sage-800'
                  : 'bg-sage-50 text-muted'
              }`}
            >
              {msg.content}
            </div>
          ))
        )}
        {running ? (
          <p className="text-xs text-sage-600">L’agent réfléchit…</p>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className="sticky bottom-0 z-20 mt-3 flex gap-2 rounded-2xl bg-sage-50/95 p-2 ring-1 ring-sage-100 backdrop-blur-sm"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <input
          type="text"
          value={text}
          disabled={running || !session?.result}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex. Remplace le mardi par un risotto…"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-sage-100 bg-white px-3 text-sm outline-none ring-sage-600 focus:ring-2 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={running || text.trim().length < 2}
          className="min-h-12 shrink-0 rounded-xl bg-sage-800 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </div>
  )
}
