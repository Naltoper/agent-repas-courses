# Bilan — Refonte UX tunnel 3 étapes (front-only)

**Rôle :** Développeur senior  
**Date :** 2026-09-29  
**Périmètre :** Parcours Recettes → Courses → En Magasin + Historique + Paramètres  
**Statut :** ✅ Build `npm run build` OK · API / Gemini / stack inchangés

---

## 1. Décisions

| Sujet | Choix |
|-------|--------|
| Nav | Bas mobile : Planifier / Historique / Paramètres |
| Tunnel | Stepper 1→2→3 ; avance 2 si menu validé ; 3 via Mode Magasin |
| Magasin / ville | `localStorage` (`uiPrefs`) + coeff. affichage budget UI |
| Stock | `inStockIds` session (localStorage lié à `session.id`) |
| Remplacer recette | `sendFollowUp` (API existante) |
| Déprécié | Ancienne console dense, Estimation/Shopping standalone |

---

## 2. Fichiers clés

- `App.tsx` + `AppShell` + `TunnelScreen`
- `components/tunnel/Step1*` / `Step2Basket` / `Step3StoreMode` / `StepStepper`
- `HistoryScreen` / `SettingsScreen`
- `AgentWorkspaceContext` (`appView`, `tunnelStep`, `inStockIds`, `uiPrefs`)
- Utils : `storePricing.ts`, `shareList.ts`, `uiPrefs.ts`

---

## 3. Hors scope (CDC)

- Clé IA client / fallback offline  
- Prix enseigne réels (coeff. UI seulement)  
- Difficulté plats (affichage `prep_time` + régimes seulement)

---

## 4. Prochaine étape

Parcours manuel mobile : prefs → générer → chat → valider → stock → mode magasin → historique reprendre ; redeploy Vercel si besoin.
