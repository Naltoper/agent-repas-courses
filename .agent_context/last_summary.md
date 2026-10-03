# Bilan — Stack Vercel + Render + cron-job.org (+ Neon pour persistance)

**Rôle :** Développeur senior  
**Date :** 2026-10-03  
**Périmètre :** Abandon Northflank (CB) ; stack 100 % gratuite sans CB  
**Statut :** ✅ `/health` + CORS OK · docs à jour · `npm run build` OK

---

## 1. Infrastructure validée

| Couche | Choix |
|--------|--------|
| UI | Vercel (existant) |
| API | Render Free (conservé) |
| Anti cold-start | **cron-job.org** → `GET /health` toutes les **10 min** |
| Persistance durable | **Neon Free** recommandé (optionnel via `DATABASE_URL`) — pas Render Postgres Free (expire 30 j) |

Northflank : abandonné.

---

## 2. Vérifs code

- `GET /health` → `status: "ok"`, public, sans auth (`routes.py`) — OK cron-job.org  
- CORS : `FRONTEND_ORIGIN` + regex `https://.*\.vercel\.app` (`main.py`)  
- `render.yaml` réactivé + `DATABASE_URL` optionnel  
- `DEPLOY.md` réécrit pour cette stack

---

## 3. Analyse persistance (synthèse)

- **Fichiers `/tmp`** : perdus au redeploy — insuffisant pour l’historique.  
- **Supabase Free** : viable en JSONB, mais **pause projet ~7 j** sans activité → moins bon que Neon pour « toujours là ».  
- **Render Postgres Free** : expire **30 jours** puis données supprimées → déconseillé.  
- **Neon Free** : sans CB, données conservées, scale-to-zero ~5 min (réveil court à la requête) — **meilleur fit** ; brancher avec `DATABASE_URL` (code `db.py` / `psycopg` déjà prêt).  
- Preférer `psycopg` + URI plutôt que `supabase-py` pour ce backend.

---

## 4. Actions utilisateur

1. Garder / redéployer Render  
2. Créer cron cron-job.org → `/health` / 10 min  
3. (Plus tard) Neon + `DATABASE_URL` pour historique durable  
4. `VITE_API_URL` Vercel = URL Render si besoin + `vercel --prod`

Détail : **`DEPLOY.md`**.
