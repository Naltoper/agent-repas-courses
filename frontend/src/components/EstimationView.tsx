import { useAgentWorkspace } from '../state/AgentWorkspaceContext'
import {
  BudgetBanner,
  MenuPlanningCards,
  ShoppingByAisle,
} from './MenuDisplays'

export function EstimationView() {
  const { session, menuValidated, editMenu, setSection, running } =
    useAgentWorkspace()

  if (!session?.result) {
    return (
      <div className="space-y-3 text-sm text-muted">
        <p>Aucun menu validé pour le moment.</p>
        <button
          type="button"
          onClick={() => setSection('agent')}
          className="rounded-lg bg-sage-800 px-4 py-2 text-sm font-medium text-white hover:bg-sage-600"
        >
          Aller à la console
        </button>
      </div>
    )
  }

  if (!menuValidated) {
    return (
      <div className="space-y-3 text-sm text-muted">
        <p>
          Un menu est disponible dans la console, mais pas encore validé.
          Peaufinez-le puis cliquez sur <strong>Valider ce menu</strong>.
        </p>
        <button
          type="button"
          onClick={() => setSection('agent')}
          className="rounded-lg bg-sage-800 px-4 py-2 text-sm font-medium text-white hover:bg-sage-600"
        >
          Retour peaufinage
        </button>
      </div>
    )
  }

  const menu = session.result

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-sage-800">
            Estimation & courses
          </h3>
          <p className="text-sm text-muted">
            Vue dédiée après validation — le budget se met à jour si vous
            modifiez puis revalidez le menu.
          </p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={editMenu}
          className="rounded-lg border border-sage-200 bg-white px-4 py-2 text-sm font-medium text-sage-800 hover:bg-sage-50 disabled:opacity-60"
        >
          Modifier le menu
        </button>
      </div>

      <BudgetBanner menu={menu} />

      <section>
        <h4 className="mb-2 text-sm font-semibold text-sage-800">
          Liste de courses par rayon
        </h4>
        <ShoppingByAisle menu={menu} />
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-sage-800">
          Rappel du menu validé
        </h4>
        <MenuPlanningCards menu={menu} />
      </section>
    </div>
  )
}
