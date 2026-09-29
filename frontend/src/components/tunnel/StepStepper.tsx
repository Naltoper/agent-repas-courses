import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'
import type { TunnelStep } from '../../types/domain'

const STEPS: { id: TunnelStep; label: string }[] = [
  { id: 1, label: 'Recettes' },
  { id: 2, label: 'Courses' },
  { id: 3, label: 'En Magasin' },
]

export function StepStepper() {
  const { tunnelStep, maxReachedStep, goToStep, goToStoreMode, menuValidated } =
    useAgentWorkspace()

  return (
    <ol className="mb-4 flex items-center gap-1" aria-label="Étapes du parcours">
      {STEPS.map((step, index) => {
        const reachable =
          step.id === 1 ||
          (step.id === 2 && menuValidated) ||
          (step.id === 3 && maxReachedStep >= 3)
        const active = tunnelStep === step.id
        const done = tunnelStep > step.id

        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => {
                if (step.id === 3 && maxReachedStep < 3 && menuValidated) {
                  goToStoreMode()
                  return
                }
                goToStep(step.id)
              }}
              className={`flex min-h-10 w-full flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center transition ${
                active
                  ? 'bg-sage-800 text-white'
                  : done
                    ? 'bg-sage-100 text-sage-800'
                    : reachable
                      ? 'bg-white text-sage-700 ring-1 ring-sage-100'
                      : 'bg-white/50 text-muted/50'
              }`}
            >
              <span className="text-[10px] font-semibold opacity-80">
                {step.id}
              </span>
              <span className="truncate text-xs font-medium leading-tight">
                {step.label}
              </span>
            </button>
            {index < STEPS.length - 1 ? (
              <span className="shrink-0 text-sage-200" aria-hidden>
                ›
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
