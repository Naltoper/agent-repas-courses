import { useAgentWorkspace } from '../state/AgentWorkspaceContext'
import {
  BudgetBanner,
  MenuPlanningCards,
  ShoppingByAisle,
} from './MenuDisplays'
import { ShoppingListView } from './ShoppingListView'

export function EstimationView() {
  const {
    session,
    menuValidated,
    editMenu,
    setSection,
    running,
    resultsView,
    setResultsView,
    startFresh,
    resetChecks,
  } = useAgentWorkspace()

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

  if (resultsView === 'shopping') {
    return <ShoppingListView />
  }

  const menu = session.result
  const checkedCount = menu.shopping_list.filter((i) => i.checked).length

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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => setResultsView('shopping')}
            className="rounded-lg bg-sage-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sage-600 disabled:opacity-60"
          >
            Liste de courses
            {menu.shopping_list.length > 0 ? (
              <span className="ml-1.5 text-xs font-normal opacity-80">
                ({checkedCount}/{menu.shopping_list.length})
              </span>
            ) : null}
          </button>
          <button
            type="button"
            disabled={running}
            onClick={editMenu}
            className="rounded-lg border border-sage-200 bg-white px-4 py-2 text-sm font-medium text-sage-800 hover:bg-sage-50 disabled:opacity-60"
          >
            Modifier le menu
          </button>
        </div>
      </div>

      <BudgetBanner menu={menu} />

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-sage-800">
            Liste de courses par rayon
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setResultsView('shopping')}
              className="text-sm font-medium text-sage-700 underline-offset-2 hover:underline"
            >
              Ouvrir la checklist →
            </button>
            {checkedCount > 0 ? (
              <button
                type="button"
                onClick={() => void resetChecks()}
                className="text-sm text-muted hover:text-sage-800"
              >
                Réinitialiser cochés
              </button>
            ) : null}
          </div>
        </div>
        <ShoppingByAisle menu={menu} />
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-sage-800">
          Rappel du menu validé
        </h4>
        <MenuPlanningCards menu={menu} />
      </section>

      <div className="border-t border-sage-100 pt-4">
        <button
          type="button"
          disabled={running}
          onClick={() => void startFresh()}
          className="text-sm text-muted underline-offset-2 hover:text-sage-800 hover:underline disabled:opacity-50"
        >
          Nouvelle liste (remise à zéro)
        </button>
      </div>
    </div>
  )
}
