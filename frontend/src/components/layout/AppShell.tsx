import type { ReactNode } from 'react'
import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'
import type { AppView } from '../../types/domain'

const NAV: { id: AppView; label: string }[] = [
  { id: 'tunnel', label: 'Planifier' },
  { id: 'history', label: 'Historique' },
  { id: 'settings', label: 'Paramètres' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { appView, setAppView } = useAgentWorkspace()

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
      <header className="mb-4 shrink-0">
        <p className="text-xs font-semibold tracking-wide text-sage-600 uppercase">
          SmartChef
        </p>
        <h1 className="font-display text-2xl leading-tight text-sage-800 sm:text-3xl">
          Que mange-t-on ?
        </h1>
      </header>

      <main className="min-h-0 flex-1">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-sage-100 bg-white/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navigation principale"
      >
        <div className="mx-auto flex max-w-lg justify-around px-2 py-2">
          {NAV.map((item) => {
            const active = appView === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAppView(item.id)}
                className={`min-h-11 min-w-[5.5rem] rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-sage-100 text-sage-800'
                    : 'text-muted hover:bg-sage-50'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
