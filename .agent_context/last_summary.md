# Bilan — SmartChef Agent (sélection fine du modèle Gemini)

**Rôle :** Développeur senior  
**Date :** 2026-09-28  
**Périmètre :** `model_selection_mode` / `preferred_model` persistés, API `/models`, fallback auto, UI profil  
**Statut :** ✅ Livré et vérifié  
**Commits :** `9ab70eb` (avant) → commit post-travail (après)

---

## 1. Décisions

| Sujet | Choix |
|-------|--------|
| Persistance | Champs ajoutés à `UserProfile` → `data/profile.json` via ProfileStore |
| Modes | `manual` = modèle imposé ; `auto` = préféré puis chaîne de secours |
| Catalogue | Liste figée série **3.x** exposée par `GET /models` (select dynamique UI) |
| Secours | `GEMINI_FALLBACK_MODELS` (env) + défauts code |
| Orchestrateur | Recharge le profil **à chaque run** ; logs mode / chaîne / bascules |
| Erreurs transient | Catch `APIError` (ClientError **et** ServerError 503) puis retry → fallback |

---

## 2. Fichiers touchés

### Backend
- `app/models/schemas.py` — `ModelSelectionMode`, champs profil
- `app/core/gemini_models.py` — **nouveau** catalogue + `resolve_model_chain`
- `app/core/config.py` — `gemini_fallback_models`
- `app/agent/orchestrator.py` — stratégie manuel/auto
- `app/api/routes.py` — `GET /models`
- `.env.example` — `GEMINI_FALLBACK_MODELS`

### Frontend
- `src/types/domain.ts`, `src/api/client.ts`
- `src/components/ProfileForm.tsx` — selects mode + modèle (chargé via `/models`)

### Contexte
- `.agent_context/last_summary.md`

---

## 3. Vérifications

| Check | Résultat |
|-------|----------|
| `GET /models` | Catalogue 3.x + fallbacks |
| `PUT/GET /profile` | `model_selection_mode` + `preferred_model` persistés |
| Chaîne auto / manuel | Unit OK |
| Run agent | Profil lu ; retry 503 puis **completed** (`generate_menu`, 2 jours) |
| `npm run build` | OK |

---

## 4. Risques restants

- Quotas / 503 Google peuvent épuiser toute la chaîne en mode auto.
- Catalogue modèles maintenu à la main (pas un live list Models API).
- Mode manuel n’a pas de filet de secours (comportement voulu).

---

## 5. Prochaine étape proposée

**P3 — Courses & budget** (`build_shopping_list`, `estimate_budget`, indicateur UI).

---

*Fin du bilan — sélection modèle Gemini.*
