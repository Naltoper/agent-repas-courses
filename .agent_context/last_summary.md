# Bilan — SmartChef Agent (itération P2 · Console agent + Gemini)

**Rôle :** Développeur senior  
**Date :** 2026-09-28  
**Périmètre :** Orchestrateur Gemini Function Calling + outil `generate_menu` + console React (logs temps réel)  
**Statut :** ✅ P2 implémentée et vérifiée (chemin sans clé Gemini) — **clé API absente en local**

---

## 1. Objectif

Recevoir une consigne textuelle, orchestrer Gemini avec Function Calling, exécuter `generate_menu` à partir du **profil persisté**, et afficher **logs + résultats** dans l’UI — sans casser `/health` ni `/profile`.

---

## 2. Décisions prises

| Décision | Choix | Motif |
|----------|-------|--------|
| SDK | `google-genai` (v2.x) | Stack CDC / Function Calling officiel |
| Boucle outils | Manuelle (`automatic_function_calling` désactivé) | Logs explicites entre chaque tour / outil |
| Premier outil | `generate_menu` (planning + recettes) | Vertical slice menu ; courses/budget/Keep/YouTube en P3–P5 |
| Exécution | `POST /agent/run` → 202 + `BackgroundTasks` + `asyncio.to_thread` | Ne bloque pas le event loop ; SSE possible en parallèle |
| Temps réel | SSE `GET /agent/runs/{id}/stream` + fallback polling | Logs live dès P2 (avance sur P6) |
| Profil | Injecté dans le system prompt à chaque run | Réutilise P1 sans dupliquer le formulaire |
| Modèle défaut | `gemini-2.5-flash` (configurable `GEMINI_MODEL`) | Coût/latence adaptés à une boucle multi-tours |

---

## 3. Fichiers touchés

### Backend (nouveaux)
- `app/agent/orchestrator.py` — boucle Gemini
- `app/agent/tools.py` — déclaration + exécution `generate_menu`
- `app/agent/__init__.py`
- `app/storage/run_store.py` — runs en mémoire + snapshot `data/latest_session.json`

### Backend (modifiés)
- `app/api/routes.py` — `/agent/run`, `/agent/runs/{id}`, `/agent/runs/{id}/stream`, `/agent/sessions/latest`
- `app/models/schemas.py` — `AgentRunRequest`, champs `error` / `summary`
- `app/core/config.py` — `gemini_model`, `agent_max_tool_rounds`
- `app/storage/__init__.py`
- `requirements.txt`, `.env.example`

### Frontend
- `src/components/AgentConsole.tsx` — **nouveau**
- `src/api/client.ts`, `src/types/domain.ts`, `src/App.tsx` — navigation Profil / Console / Statut

### Contexte
- `.agent_context/last_summary.md`

---

## 4. API ajoutée

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/agent/run` | Démarre un run (202) |
| GET | `/agent/runs/{id}` | État + logs + résultat |
| GET | `/agent/runs/{id}/stream` | SSE logs jusqu’à `done` |
| GET | `/agent/sessions/latest` | Dernière session (mémoire ou JSON) |

---

## 5. Vérifications

| Check | Résultat |
|-------|----------|
| `GET /health` | ✅ OK (`gemini: false` sans clé) |
| `GET /profile` | ✅ inchangé |
| `execute_generate_menu` unitaire | ✅ |
| `POST /agent/run` sans `GEMINI_API_KEY` | ✅ `failed` + message clair dans les logs |
| `npm run build` | ✅ |

**Bloquant démo live :** `backend/.env` a `GEMINI_API_KEY` **vide**. Renseigner la clé puis relancer uvicorn ; `/health` doit afficher `gemini: true`.

---

## 6. Risques restants

1. **Clé Gemini manquante** — aucun menu réel tant que non configurée.
2. **Qualité / déterminisme** du menu LLM — peut nécessiter un tour de « nudge » si le modèle n’appelle pas l’outil.
3. **Quota / coût** Gemini sur boucles multi-tours.
4. **Runs en mémoire** — perdus au restart (snapshot latest seulement).
5. Points Lead Tech ouverts : source des prix (P3), Keep master token (P5).

---

## 7. Prochaine étape proposée (P3)

**Courses & budget**

- Outils `build_shopping_list` (par rayon) + `estimate_budget`
- Table de prix heuristiques JSON **ou** estimation LLM annotée (à trancher)
- Indicateur budget dans le dashboard résultats

Prérequis : `GEMINI_API_KEY` renseignée pour valider la boucle complète en conditions réelles.

---

*Fin du bilan — itération P2.*
