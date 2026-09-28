import type { MenuPlan, Recipe } from '../types/domain'

export function formatPrepTime(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes) || minutes <= 0) {
    return 'Préparation : ~20 min'
  }
  return `Préparation : ${minutes} min`
}

export function MenuPlanningCards({ menu }: { menu: MenuPlan }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-sage-800">Planning</h3>
        <ul className="divide-y divide-sage-100 overflow-hidden rounded-lg ring-1 ring-sage-100">
          {menu.days.map((day) => {
            const recipe = menu.recipes.find((r) => r.title === day.recipe_title)
            return (
              <li
                key={`${day.day}-${day.meal_type}-${day.recipe_title}`}
                className="flex flex-col gap-1 bg-white/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-sage-800">{day.day}</p>
                  <p className="text-sm text-muted">{day.recipe_title}</p>
                </div>
                <p className="text-xs font-medium text-sage-600">
                  {formatPrepTime(recipe?.prep_time_minutes)}
                </p>
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-sage-800">Recettes</h3>
        <div className="space-y-3">
          {menu.recipes.map((recipe) => (
            <RecipeCard key={recipe.title} recipe={recipe} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <details className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-sage-100">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium text-sage-800">{recipe.title}</span>
          <span className="text-xs font-medium text-sage-600">
            {formatPrepTime(recipe.prep_time_minutes)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{recipe.servings} pers.</p>
      </summary>
      {recipe.ingredients?.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
          {recipe.ingredients.map((ing, i) => (
            <li key={`${recipe.title}-ing-${i}`}>{ing}</li>
          ))}
        </ul>
      )}
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
        {recipe.steps.map((step, index) => (
          <li key={`${recipe.title}-${index}`}>{step}</li>
        ))}
      </ol>
    </details>
  )
}

export function BudgetBanner({ menu }: { menu: MenuPlan }) {
  if (!menu.budget) {
    return (
      <p className="rounded-lg bg-sage-50 px-3 py-2 text-sm text-muted ring-1 ring-sage-100">
        Estimation financière non encore disponible — validez à nouveau après
        ajustement si besoin.
      </p>
    )
  }

  const { budget } = menu
  return (
    <div
      className={`rounded-lg px-4 py-3 text-sm ring-1 ${
        budget.within_budget
          ? 'bg-emerald-50 text-sage-800 ring-emerald-200'
          : 'bg-amber-50 text-amber-900 ring-amber-200'
      }`}
    >
      <p className="text-base font-semibold">
        Estimation globale : {budget.estimated_total_eur.toFixed(2)} €
        <span className="font-normal text-muted">
          {' '}
          / budget {budget.weekly_budget_eur.toFixed(2)} €
        </span>
      </p>
      <p className="mt-1 text-xs opacity-80">
        {budget.within_budget
          ? `Dans le budget (marge ${(-budget.delta_eur).toFixed(2)} €)`
          : `Dépassement de ${budget.delta_eur.toFixed(2)} €`}
      </p>
    </div>
  )
}

export function ShoppingByAisle({ menu }: { menu: MenuPlan }) {
  const groups = new Map<string, typeof menu.shopping_list>()
  for (const item of menu.shopping_list) {
    const aisle = item.aisle || 'Divers'
    const list = groups.get(aisle) ?? []
    list.push(item)
    groups.set(aisle, list)
  }
  const aisleGroups = [...groups.entries()]

  if (aisleGroups.length === 0) {
    return (
      <p className="text-sm text-muted">
        Aucune liste de courses pour l’instant.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {aisleGroups.map(([aisle, items]) => (
        <div key={aisle}>
          <p className="mb-1 text-xs font-semibold tracking-wide text-sage-600 uppercase">
            {aisle}
          </p>
          <ul className="rounded-lg bg-white/70 text-sm ring-1 ring-sage-100">
            {items.map((item) => (
              <li
                key={item.id || `${aisle}-${item.name}`}
                className={`flex items-center justify-between gap-2 border-b border-sage-50 px-3 py-1.5 last:border-0 ${
                  item.checked ? 'opacity-50' : ''
                }`}
              >
                <span className={item.checked ? 'line-through' : ''}>
                  {item.name}{' '}
                  <span className="text-muted">× {item.quantity}</span>
                </span>
                <span className="text-muted">
                  {item.estimated_price_eur != null
                    ? `${item.estimated_price_eur.toFixed(2)} €`
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
