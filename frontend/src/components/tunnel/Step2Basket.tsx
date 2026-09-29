import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'
import { adjustPrice, STORE_OPTIONS, storeLabel } from '../../utils/storePricing'
import {
  formatShoppingPrice,
  formatShoppingQuantity,
  formatUnitPrice,
} from '../../utils/shoppingFormat'
import type { StoreBrand } from '../../types/domain'

const AISLE_ORDER = [
  'Fruits & Légumes',
  'Viandes & Poissons',
  'Produits laitiers',
  'Épicerie',
  'Boulangerie',
  'Surgelés',
  'Boissons',
  'Divers',
]

export function Step2Basket() {
  const {
    session,
    menuValidated,
    editMenu,
    goToStoreMode,
    inStockIds,
    toggleInStock,
    uiPrefs,
    setUiPrefs,
  } = useAgentWorkspace()

  if (!session?.result || !menuValidated) {
    return (
      <div className="space-y-3 text-sm text-muted">
        <p>Validez d’abord un menu à l’étape Recettes.</p>
        <button
          type="button"
          onClick={editMenu}
          className="min-h-11 rounded-xl bg-sage-800 px-4 text-sm font-medium text-white"
        >
          Retour aux recettes
        </button>
      </div>
    )
  }

  const items = session.result.shopping_list
  const activeItems = items.filter((i) => !inStockIds.has(i.id))
  const baseTotal = activeItems.reduce(
    (s, i) => s + (i.estimated_price_eur ?? 0),
    0,
  )
  const displayTotal = adjustPrice(baseTotal, uiPrefs.store)

  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const aisle = item.aisle || 'Divers'
    const list = groups.get(aisle) ?? []
    list.push(item)
    groups.set(aisle, list)
  }
  const ordered = [
    ...AISLE_ORDER.filter((a) => groups.has(a)),
    ...[...groups.keys()].filter((a) => !AISLE_ORDER.includes(a)),
  ]

  return (
    <div className="space-y-4 pb-28">
      <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-sage-100">
        <p className="text-sm font-semibold text-sage-800">Magasin & ville</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-muted">
            Enseigne
            <select
              value={uiPrefs.store}
              onChange={(e) =>
                setUiPrefs({
                  ...uiPrefs,
                  store: e.target.value as StoreBrand,
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-sage-100 bg-white px-3 text-sm text-ink"
            >
              {STORE_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            Ville
            <input
              type="text"
              value={uiPrefs.city}
              onChange={(e) =>
                setUiPrefs({ ...uiPrefs, city: e.target.value })
              }
              placeholder="Ex. Lyon"
              className="mt-1 min-h-11 w-full rounded-xl border border-sage-100 bg-white px-3 text-sm"
            />
          </label>
        </div>
        <p className="mt-3 text-lg font-semibold text-sage-800">
          Estimation : {displayTotal.toFixed(2)} €
        </p>
        <p className="text-xs text-muted">
          {storeLabel(uiPrefs.store)}
          {uiPrefs.city ? ` · ${uiPrefs.city}` : ''} ·{' '}
          {activeItems.length}/{items.length} articles à acheter
          {inStockIds.size > 0
            ? ` (${inStockIds.size} déjà en stock)`
            : ''}
        </p>
      </div>

      {ordered.map((aisle) => (
        <section key={aisle}>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-sage-600 uppercase">
            {aisle}
          </h3>
          <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-sage-100">
            {(groups.get(aisle) ?? []).map((item) => {
              const stocked = inStockIds.has(item.id)
              const unit = formatUnitPrice(item)
              const price = item.estimated_price_eur
              const shown =
                price != null
                  ? adjustPrice(price, uiPrefs.store).toFixed(2) + ' €'
                  : formatShoppingPrice(item)
              return (
                <li
                  key={item.id}
                  className={`flex items-start gap-3 border-b border-sage-50 px-3 py-3 last:border-0 ${
                    stocked ? 'bg-sage-50/80 opacity-60' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium text-sage-800 ${
                        stocked ? 'line-through' : ''
                      }`}
                    >
                      {item.name}
                    </p>
                    <p className="text-xs text-muted">
                      {formatShoppingQuantity(item)}
                      {unit ? ` · ${unit}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-sage-800">
                      {stocked ? '—' : shown}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleInStock(item.id)}
                      className={`min-h-10 rounded-lg px-2.5 text-xs font-medium ${
                        stocked
                          ? 'bg-sage-800 text-white'
                          : 'bg-sage-50 text-sage-800 ring-1 ring-sage-100'
                      }`}
                    >
                      {stocked ? 'En stock' : "J'en ai déjà"}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 border-t border-sage-100 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <button
            type="button"
            onClick={goToStoreMode}
            className="min-h-12 w-full rounded-xl bg-sage-800 text-sm font-semibold text-white"
          >
            Passer au mode Courses en magasin
          </button>
          <button
            type="button"
            onClick={editMenu}
            className="min-h-10 text-sm text-muted underline-offset-2 hover:underline"
          >
            Modifier le menu
          </button>
        </div>
      </div>
    </div>
  )
}
