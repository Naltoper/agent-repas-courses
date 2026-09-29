import { useMemo, useState } from 'react'
import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'
import {
  formatShoppingPrice,
  formatShoppingQuantity,
} from '../../utils/shoppingFormat'
import { copyText, formatChecklistText, shareText } from '../../utils/shareList'

type FilterMode = 'all' | 'todo' | 'done'

export function Step3StoreMode() {
  const {
    session,
    menuValidated,
    inStockIds,
    toggleShoppingItem,
    goToStep,
    editMenu,
    running,
  } = useAgentWorkspace()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterMode>('todo')
  const [aisleFilter, setAisleFilter] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const allItems = useMemo(() => {
    const list = session?.result?.shopping_list ?? []
    return list.filter((i) => !inStockIds.has(i.id))
  }, [session?.result?.shopping_list, inStockIds])

  const aisles = useMemo(() => {
    const set = new Set(allItems.map((i) => i.aisle || 'Divers'))
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [allItems])

  const q = query.trim().toLowerCase()
  const recipes = session?.result?.recipes ?? []

  const filtered = useMemo(() => {
    return allItems.filter((item) => {
      if (filter === 'todo' && item.checked) return false
      if (filter === 'done' && !item.checked) return false
      if (aisleFilter && (item.aisle || 'Divers') !== aisleFilter) return false
      if (!q) return true
      if (item.name.toLowerCase().includes(q)) return true
      if ((item.aisle || '').toLowerCase().includes(q)) return true
      // recipe association: ingredient name appears in a recipe
      const hitRecipe = recipes.some(
        (r) =>
          r.title.toLowerCase().includes(q) &&
          r.ingredients.some((ing) => {
            const name = typeof ing === 'string' ? ing : ing.name
            return (
              name.toLowerCase().includes(item.name.toLowerCase()) ||
              item.name.toLowerCase().includes(name.toLowerCase())
            )
          }),
      )
      return hitRecipe
    })
  }, [allItems, filter, aisleFilter, q, recipes])

  const done = allItems.filter((i) => i.checked).length
  const total = allItems.length
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  if (!session?.result || !menuValidated) {
    return (
      <p className="text-sm text-muted">
        Validez le menu et le panier avant le mode magasin.
      </p>
    )
  }

  return (
    <div className="space-y-3 pb-8">
      <div className="sticky top-0 z-20 -mx-1 space-y-2 bg-sage-50/95 px-1 py-2 backdrop-blur-sm">
        <label className="relative block">
          <span className="sr-only">Rechercher</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Produit, rayon ou recette…"
            className="min-h-12 w-full rounded-2xl border border-sage-100 bg-white py-2 pr-10 pl-4 text-sm outline-none ring-sage-600 focus:ring-2"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-muted"
            >
              Effacer
            </button>
          ) : null}
        </label>

        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>
              {done} / {total} articles
            </span>
            <span>{progress} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sage-100">
            <div
              className="h-full rounded-full bg-sage-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'all' as const, label: 'Tous' },
              { id: 'todo' as const, label: 'À prendre' },
              { id: 'done' as const, label: 'Achetés' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`min-h-10 rounded-xl px-3 text-sm font-medium ${
                filter === f.id
                  ? 'bg-sage-800 text-white'
                  : 'bg-white text-sage-800 ring-1 ring-sage-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setAisleFilter(null)}
            className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-medium ${
              !aisleFilter
                ? 'bg-sage-100 text-sage-800'
                : 'bg-white text-muted ring-1 ring-sage-100'
            }`}
          >
            Tous rayons
          </button>
          {aisles.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAisleFilter(a)}
              className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-medium ${
                aisleFilter === a
                  ? 'bg-sage-100 text-sage-800'
                  : 'bg-white text-muted ring-1 ring-sage-100'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-1.5">
        {filtered.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={running}
              onClick={() => void toggleShoppingItem(item.id, !item.checked)}
              className={`flex w-full min-h-14 items-start gap-3 rounded-2xl px-3 py-3 text-left ring-1 transition ${
                item.checked
                  ? 'bg-sage-50/90 ring-sage-100 opacity-70'
                  : 'bg-white ring-sage-100'
              }`}
            >
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border text-xs ${
                  item.checked
                    ? 'border-sage-600 bg-sage-600 text-white'
                    : 'border-sage-300'
                }`}
                aria-hidden
              >
                {item.checked ? '✓' : ''}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-medium text-sage-800 ${
                    item.checked ? 'line-through' : ''
                  }`}
                >
                  {item.name}
                </span>
                <span
                  className={`mt-0.5 block text-xs text-muted ${
                    item.checked ? 'line-through' : ''
                  }`}
                >
                  {formatShoppingQuantity(item)}
                  {item.aisle ? ` · ${item.aisle}` : ''}
                  {' · '}
                  {formatShoppingPrice(item)}
                </span>
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Aucun article pour ce filtre.
          </p>
        ) : null}
      </ul>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          type="button"
          className="min-h-12 rounded-xl bg-sage-800 text-sm font-medium text-white"
          onClick={() => {
            flash('Menu déjà synchronisé dans l’historique')
          }}
        >
          Sauvegarder
        </button>
        <button
          type="button"
          className="min-h-12 rounded-xl bg-white text-sm font-medium text-sage-800 ring-1 ring-sage-200"
          onClick={() => {
            const text = formatChecklistText(allItems)
            void shareText(text).then((shared) =>
              flash(shared ? 'Partage ouvert' : 'Copié (partage indispo)'),
            )
          }}
        >
          Partager
        </button>
        <button
          type="button"
          className="min-h-12 rounded-xl bg-white text-sm font-medium text-sage-800 ring-1 ring-sage-200"
          onClick={() => {
            void copyText(formatChecklistText(allItems)).then(() =>
              flash('Liste copiée'),
            )
          }}
        >
          Copier
        </button>
        <button
          type="button"
          className="min-h-12 rounded-xl bg-white text-sm font-medium text-sage-800 ring-1 ring-sage-200"
          onClick={() => goToStep(2)}
        >
          Modifier le panier
        </button>
      </div>
      <button
        type="button"
        onClick={editMenu}
        className="w-full text-center text-sm text-muted underline-offset-2 hover:underline"
      >
        Revenir aux recettes
      </button>

      {toast ? (
        <p
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-sage-800 px-4 py-2 text-sm text-white shadow-lg"
          role="status"
        >
          {toast}
        </p>
      ) : null}
    </div>
  )
}
