import { useState } from 'react'
import { useAgentWorkspace } from '../../state/AgentWorkspaceContext'
import type { Recipe } from '../../types/domain'
import { formatIngredientLine } from '../../utils/shoppingFormat'
import { formatPrepTime } from '../MenuDisplays'

export function Step1RecipesTab() {
  const { session, running, validateMenu, sendFollowUp, menuValidated } =
    useAgentWorkspace()
  const [openTitle, setOpenTitle] = useState<string | null>(null)

  const menu = session?.result
  const days = menu?.days ?? []
  const recipes = menu?.recipes ?? []
  const canValidate =
    !!menu && session?.status === 'completed' && !running && !menuValidated

  if (!menu) {
    return (
      <p className="rounded-xl bg-white/80 px-3 py-4 text-sm text-muted ring-1 ring-sage-100">
        Aucun menu pour l’instant. Ouvrez les préférences et lancez une
        génération.
      </p>
    )
  }

  return (
    <div className="space-y-4 pb-24">
      <ul className="space-y-3">
        {days.map((day) => {
          const recipe = recipes.find((r) => r.title === day.recipe_title)
          return (
            <li
              key={`${day.day}-${day.recipe_title}`}
              className="rounded-2xl bg-white px-3 py-3 ring-1 ring-sage-100"
            >
              <p className="text-xs font-semibold tracking-wide text-sage-600 uppercase">
                {day.day}
              </p>
              <p className="mt-0.5 text-base font-semibold text-sage-800">
                {day.recipe_title}
              </p>
              {day.notes ? (
                <p className="mt-1 text-sm text-muted">{day.notes}</p>
              ) : null}
              <p className="mt-1 text-xs font-medium text-sage-600">
                {formatPrepTime(recipe?.prep_time_minutes)}
                {recipe ? ` · ${recipe.servings} pers.` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-xl bg-sage-50 px-3 text-sm font-medium text-sage-800 ring-1 ring-sage-100"
                  onClick={() =>
                    setOpenTitle((t) =>
                      t === day.recipe_title ? null : day.recipe_title,
                    )
                  }
                >
                  {openTitle === day.recipe_title
                    ? 'Masquer les détails'
                    : 'Voir les détails'}
                </button>
                <button
                  type="button"
                  disabled={running}
                  className="min-h-11 rounded-xl bg-white px-3 text-sm font-medium text-sage-800 ring-1 ring-sage-200 disabled:opacity-50"
                  onClick={() =>
                    void sendFollowUp(
                      `Remplace uniquement la recette « ${day.recipe_title} » du jour ${day.day} par une autre proposition adaptée au profil, sans changer le reste du menu.`,
                    )
                  }
                >
                  Remplacer
                </button>
              </div>
              {openTitle === day.recipe_title && recipe ? (
                <RecipeDetails recipe={recipe} />
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 border-t border-sage-100 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <p className="text-sm text-muted">
            <span className="font-semibold text-sage-800">{recipes.length}</span>{' '}
            recette{recipes.length > 1 ? 's' : ''} prête
            {recipes.length > 1 ? 's' : ''}
          </p>
          <button
            type="button"
            disabled={!canValidate}
            onClick={() => void validateMenu()}
            className="min-h-12 rounded-xl bg-sage-800 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Valider &amp; courses
          </button>
        </div>
      </div>
    </div>
  )
}

function RecipeDetails({ recipe }: { recipe: Recipe }) {
  return (
    <div className="mt-3 space-y-2 border-t border-sage-50 pt-3 text-sm">
      <p className="font-medium text-sage-800">Ingrédients</p>
      <ul className="list-disc space-y-0.5 pl-5 text-muted">
        {recipe.ingredients.map((ing, i) => (
          <li key={`${recipe.title}-ing-${i}`}>{formatIngredientLine(ing)}</li>
        ))}
      </ul>
      <p className="font-medium text-sage-800">Préparation</p>
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        {recipe.steps.map((step, i) => (
          <li key={`${recipe.title}-step-${i}`}>{step}</li>
        ))}
      </ol>
    </div>
  )
}
