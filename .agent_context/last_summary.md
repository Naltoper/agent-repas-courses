# Bilan — Correctifs logs Step1 + inputs numériques

**Rôle :** Développeur senior  
**Date :** 2026-10-03  
**Périmètre :** UI Step1 (logs live) + Settings (saisie numérique) — API / stack inchangés  
**Statut :** ✅ `npm run build` OK

---

## 1. Changements

| Sujet | Détail |
|-------|--------|
| Logs Step1 | Accordion `Step1ExecutionLogs` : statut session, modèle Gemini (extrait des logs / profil), flux SSE `logs` en mono scrollable |
| Settings numériques | Drafts `string` pour jours / personnes / budget ; parse + clamp au `onBlur` et à la sauvegarde (`numberDraft.ts`) |
| Prefs Step1 | Inchangé (chips jours + ± convives, pas d’input texte numérique) |

---

## 2. Fichiers

- `frontend/src/components/tunnel/Step1ExecutionLogs.tsx` (nouveau)
- `frontend/src/components/tunnel/Step1Planning.tsx`
- `frontend/src/components/SettingsScreen.tsx`
- `frontend/src/utils/numberDraft.ts` (nouveau)

---

## 3. Note infra (Vercel + Supabase)

Faisable en migration progressive : front Vercel inchangé ; FastAPI en serverless Vercel nécessite adaptation (pas uvicorn long-running / SSE fragile) ; persistance JSON fichier → Postgres Supabase (sessions JSONB). Garder Render pour l’API agent tant que les runs longs + EventSource restent critiques.

---

## 4. Prochaine étape

Test manuel logs pendant génération ; redeploy Vercel si besoin.
