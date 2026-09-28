/** Domain types mirroring backend Pydantic schemas. */

export type DietaryRegime =
  | 'omnivore'
  | 'vegetarian'
  | 'vegan'
  | 'gluten_free'
  | 'halal'
  | 'other'

export type ModelSelectionMode = 'manual' | 'auto'

export interface IntegrationStatus {
  gemini: boolean
  youtube: boolean
  google_keep: boolean
}

export interface HealthResponse {
  status: string
  service: string
  version: string
  environment: string
  integrations: IntegrationStatus
}

export interface UserProfile {
  household_size: number
  weekly_budget_eur: number
  dietary_regimes: DietaryRegime[]
  notes: string
  model_selection_mode: ModelSelectionMode
  preferred_model: string
}

export interface GeminiModelInfo {
  id: string
  label: string
  description: string
  recommended: boolean
}

export interface GeminiModelsResponse {
  models: GeminiModelInfo[]
  default_model: string
  fallback_models: string[]
}

export interface DayMeal {
  day: string
  meal_type: string
  recipe_title: string
  notes: string
}

export interface Recipe {
  title: string
  servings: number
  steps: string[]
  youtube_video_id: string | null
  youtube_url: string | null
}

export interface ShoppingItem {
  name: string
  quantity: string
  aisle: string
  estimated_price_eur: number | null
}

export interface BudgetReport {
  estimated_total_eur: number
  weekly_budget_eur: number
  delta_eur: number
  within_budget: boolean
}

export interface MenuPlan {
  prompt: string
  days: DayMeal[]
  recipes: Recipe[]
  shopping_list: ShoppingItem[]
  budget: BudgetReport | null
}

export interface AgentLogEvent {
  level: string
  tool: string | null
  message: string
  timestamp: string | null
}

export interface AgentSession {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  prompt: string
  profile: UserProfile | null
  result: MenuPlan | null
  keep: unknown
  logs: AgentLogEvent[]
  error: string | null
  summary: string | null
}
