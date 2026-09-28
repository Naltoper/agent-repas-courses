# Bilan — Quantités en grammes + prix Gemini dynamiques

**Rôle :** Développeur senior  
**Date :** 2026-09-29  
**Périmètre :** Liste de courses / budget — quantités g + estimation IA selon quantité — **sans** Keep / YouTube  
**Statut :** ✅ Livré (`npm run build` · `python -m tests.test_api`)

---

## 1. Décisions

| Sujet | Choix |
|-------|--------|
| Quantités | `quantity_g` obligatoire (référence) + `quantity` libellé affichable (`500 g`) |
| Ingrédients recettes | Modèle `Ingredient` (`name`, `quantity_g`, `quantity_label`) — coerce depuis anciennes strings |
| Prix | `estimate_budget` reçoit des lignes Gemini (`unit_price_per_kg_eur` + `estimated_price_eur` pour la qty) |
| Secours | Table `prices.json` = €/kg heuristique × `quantity_g/1000` si l’IA omet une ligne |
| Affichage | Checklist + estimation : grammes, €/kg, total ligne, badge `estim. IA` / `approx.` |

---

## 2. Fichiers touchés

- `backend/app/models/schemas.py` — `Ingredient`, `ShoppingItem.quantity_g|unit_price_eur|price_source`
- `backend/app/agent/tools.py` — schémas outils + exécuteurs Gemini
- `backend/app/agent/orchestrator.py` — consignes grammes + pricing dynamique
- `backend/app/core/pricing.py` — fill Gemini / fallback scalé
- `frontend/src/types/domain.ts`, `utils/shoppingFormat.ts`
- `frontend/src/components/ShoppingListView.tsx`, `MenuDisplays.tsx`
- `backend/tests/test_api.py` — test 500 g vs 200 g

---

## 3. Risques restants

- Qualité des prix Gemini variable (toujours approximatif magasin FR).
- Anciennes sessions sans `quantity_g` : défaut 100 g à la relecture / reparse du libellé.
- Si Gemini n’appelle pas `estimate_budget` correctement, repli heuristique (badge `approx.`).

---

## 4. Prochaine étape proposée

Affiner le catalogue heuristique (€/kg) + éventuellement recalcul budget côté UI sans relancer l’agent, ou brancher une vraie source de prix.

---

*Fin du bilan — quantités g + prix IA.*
