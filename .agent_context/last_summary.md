# Bilan — SmartChef Agent (jours recettes · conversation · courses/budget)

**Rôle :** Développeur senior  
**Date :** 2026-09-28  
**Périmètre :** `recipe_days` profil, follow-up conversationnel, P3 courses & budget  
**Statut :** ✅ Livré et vérifié (run + follow-up Gemini)

---

## 1. Décisions

| Sujet | Choix |
|-------|--------|
| Jours de recettes | `recipe_days ∈ {3,5,7}` défaut **5**, persisté dans le profil |
| Conversation | `POST /agent/runs/{id}/message` + `messages[]` sur la session |
| Persistance | Snapshot JSON `latest_session.json` (menu + logs + messages) |
| Courses/budget | Outils `build_shopping_list` + `estimate_budget` + **fallback auto** depuis ingrédients (évite blocage si le modèle ne rappelle pas les tools) |
| Prix | Table heuristique `app/resources/prices.json` |

---

## 2. Fichiers touchés

### Backend
- `app/models/schemas.py` — `recipe_days`, `ChatMessage`, `AgentFollowUpRequest`, `ingredients`
- `app/agent/tools.py` — menu / courses / budget + `ensure_shopping_and_budget`
- `app/agent/orchestrator.py` — prompt jours, loop tools, `execute_follow_up`
- `app/api/routes.py` — follow-up + SSE `chat`
- `app/core/pricing.py`, `app/resources/prices.json` — **nouveaux**

### Frontend
- `ProfileForm` — select 3/5/7 jours
- `AgentConsole` — conversation, follow-up, courses par rayon, jauge budget
- `types/domain.ts`, `api/client.ts`

---

## 3. Vérifications

| Test | Résultat |
|------|----------|
| Profil `recipe_days=3` | Persisté |
| Run agent | **completed** — 3 jours, 13 articles, budget 41.8 € / 60 € |
| Follow-up | Message utilisateur + réponse agent, session `completed` |
| `npm run build` | OK |

---

## 4. Risques restants

- Fallback courses = heuristique (rayons/prix approximatifs).
- Latence Gemini / 503 toujours possibles en follow-up.
- Sessions hors `latest` perdues au restart (mémoire).

---

## 5. Prochaine étape proposée

**P4/P5** — vidéos YouTube sur fiches recettes + sync Google Keep cochable.

---

*Fin du bilan.*
