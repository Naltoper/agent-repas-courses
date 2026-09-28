# Bilan — SmartChef Agent (hotfix config Gemini + modèle 3.x)

**Rôle :** Développeur senior  
**Date :** 2026-09-28  
**Périmètre :** Correction chargement `GEMINI_API_KEY` / `GEMINI_MODEL` + validation appel réel  
**Statut :** ✅ Corrigé et validé (menu généré via Function Calling)

---

## 1. Diagnostic

| Symptôme | Cause racine |
|----------|--------------|
| Clé présente dans `.env` mais `has_gemini=false` / « clé absente » | `env_file=".env"` **relatif au CWD** + `@lru_cache` sur `get_settings()` : si uvicorn démarre ailleurs, ou avant remplissage de la clé, la config reste vide/stale |
| Erreurs modèle 2.x | Défaut / `.env` encore sur `gemini-2.5-flash` (série 2 dépréciée / hors cible) |
| `gemini-3.5-flash` → 429 | Quota free tier épuisé (20 req/jour sur ce modèle) — **auth OK**, quota KO |

---

## 2. Décisions

1. **Chemin absolu** `backend/.env` via `Path(__file__).parents[2]` + `load_dotenv`.
2. **`reload_settings()`** au boot (lifespan + `create_app`) pour invalider le cache.
3. **Modèle défaut `gemini-3.5-flash-lite`** (série 3.x, Function Calling OK, quota free-tier encore dispo). Surcharge possible via `GEMINI_MODEL=gemini-3.5-flash` si quota/billing le permettent.
4. **Retry léger** 429/503 (3 tentatives) dans l’orchestrateur.
5. Persistance `data/` ancrée sur `BACKEND_ROOT` (même bug CWD).

---

## 3. Fichiers touchés

- `backend/app/core/config.py` — chemin absolu, `load_dotenv`, modèle 3.x, `reload_settings`
- `backend/app/main.py` — `create_app` + lifespan reload
- `backend/app/agent/orchestrator.py` — retry transient + `api_key.strip()`
- `backend/app/storage/profile_store.py` / `run_store.py` — `resolved_data_dir`
- `backend/.env.example` + `backend/.env` (`GEMINI_MODEL` uniquement)
- `.agent_context/last_summary.md`

---

## 4. Preuves de validation

| Test | Résultat |
|------|----------|
| Load config depuis CWD `/tmp` | `has_gemini=True`, `key_len=53`, modèle 3.x |
| `GET /health` | `integrations.gemini: true` |
| Smoke `generate_content` | Auth OK ; `gemini-3.5-flash` 429 quota ; `gemini-3.5-flash-lite` **OK** |
| `POST /agent/run` réel | **completed** — `generate_menu` → 3 jours / 3 recettes |
| SSE `/agent/runs/{id}/stream` | Events `log` puis `done` en direct (console React compatible EventSource) |

Exemple menu obtenu : omelette thon, pâtes thon, poulet/riz (aligné profil protéines / rapide / économique).

---

## 5. Risques restants

- Quotas free tier / 503 « high demand » côté Google (retry atténue, ne garantit pas).
- Relancer **uvicorn** après toute modification de `.env` (ou appeler `reload_settings` — déjà au startup).
- `gemini-3.5-flash` (non-lite) reste utilisable en changeant `GEMINI_MODEL` si le plan le permet.

---

## 6. Prochaine étape proposée

**P3 — Courses & budget** (`build_shopping_list` + `estimate_budget` + indicateur UI), maintenant que la boucle Gemini est opérationnelle.

---

*Fin du bilan — hotfix Gemini config / modèle 3.x.*
