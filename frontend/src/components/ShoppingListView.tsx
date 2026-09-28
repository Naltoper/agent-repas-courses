import { useMemo, useTransition } from 'react'
import { useAgentWorkspace } from '../state/AgentWorkspaceContext'
import type { ShoppingItem } from '../types/domain'

function sortShopping(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    const aisle = (a.aisle || '').localeCompare(b.aisle || '', 'fr')
    if (aisle !== 0) return aisle
    return a.name.localeCompare(b.name, 'fr')
  })
}

export function ShoppingListView() {
  const {
    session,
    toggleShoppingItem,
    resetChecks,
    setResultsView,
    running,
  } = useAgentWorkspace()
  const [pending, startTransition] = useTransition()

  const items = useMemo(
    () => sortShopping(session?.result?.shopping_list ?? []),
    [session?.result?.shopping_list],
  )

  const checkedCount = items.filter((i) => i.checked).length
  const total = items.length

  if (!session?.result) {
    return (
      <p className="text-sm text-muted">Aucune liste de courses disponible.</p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-sage-800">Liste de courses</h3>
          <p className="text-sm text-muted">
            Cochez au fur et à mesure — les articles pris passent en bas.
            {total > 0 ? (
              <span className="ml-1 font-medium text-sage-700">
                {checkedCount}/{total}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setResultsView('estimation')}
            className="rounded-lg border border-sage-200 bg-white px-3 py-2 text-sm font-medium text-sage-800 hover:bg-sage-50"
          >
            ← Estimation
          </button>
          <button
            type="button"
            disabled={running || pending || checkedCount === 0}
            onClick={() => {
              startTransition(() => {
                void resetChecks()
              })
            }}
            className="rounded-lg border border-sage-200 bg-white px-3 py-2 text-sm font-medium text-sage-700 hover:bg-sage-50 disabled:opacity-50"
          >
            Tout décocher
          </button>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted">La liste est vide.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="transition-all duration-300 ease-out">
              <label
                className={`group flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 ring-1 transition duration-300 ${
                  item.checked
                    ? 'bg-sage-50/80 ring-sage-100 opacity-70'
                    : 'bg-white ring-sage-100 hover:ring-sage-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={running || pending}
                  onChange={(event) => {
                    const next = event.target.checked
                    startTransition(() => {
                      void toggleShoppingItem(item.id, next)
                    })
                  }}
                  className="mt-1 size-4 shrink-0 rounded border-sage-300 text-sage-700 focus:ring-sage-500"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-medium text-sage-800 transition ${
                      item.checked ? 'line-through decoration-sage-400' : ''
                    }`}
                  >
                    {item.name}
                  </span>
                  <span
                    className={`mt-0.5 block text-xs text-muted transition ${
                      item.checked ? 'line-through' : ''
                    }`}
                  >
                    {item.quantity}
                    {item.aisle ? ` · ${item.aisle}` : ''}
                    {item.estimated_price_eur != null
                      ? ` · ${item.estimated_price_eur.toFixed(2)} €`
                      : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
