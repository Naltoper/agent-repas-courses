import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'
import { Step1ChatTab } from './Step1ChatTab'
import { Step1ExecutionLogs } from './Step1ExecutionLogs'
import { Step1PrefsPanel } from './Step1PrefsPanel'
import { Step1RecipesTab } from './Step1RecipesTab'

export function Step1Planning() {
  const { step1Tab, setStep1Tab, restoring, running } = useAgentWorkspace()

  if (restoring) {
    return <p className="text-sm text-muted">Restauration de la session…</p>
  }

  return (
    <div>
      <Step1PrefsPanel />

      <div className="mb-3 flex gap-2 rounded-xl bg-sage-100/80 p-1">
        {(
          [
            { id: 'recipes' as const, label: 'Recettes' },
            { id: 'chat' as const, label: 'Chat IA' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStep1Tab(tab.id)}
            className={`min-h-11 flex-1 rounded-lg text-sm font-medium transition ${
              step1Tab === tab.id
                ? 'bg-white text-sage-800 shadow-sm'
                : 'text-muted'
            }`}
          >
            {tab.label}
            {tab.id === 'chat' && running ? ' …' : ''}
          </button>
        ))}
      </div>

      {step1Tab === 'recipes' ? <Step1RecipesTab /> : <Step1ChatTab />}

      <Step1ExecutionLogs />
    </div>
  )
}
