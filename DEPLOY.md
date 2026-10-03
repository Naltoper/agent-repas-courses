# Déploiement SmartChef — Vercel (UI) + Render (API) + cron-job.org

Stack **100 % gratuite**, sans carte bancaire. Usage perso / mobile.

| Couche | Plateforme | Rôle |
|--------|------------|------|
| Frontend | Vercel | React / Vite (déjà déployé) |
| Backend | Render Free | FastAPI |
| Anti cold-start | [cron-job.org](https://cron-job.org) | `GET /health` toutes les **10 min** |
| Persistance (optionnel) | **Neon Free** recommandé | Postgres via `DATABASE_URL` (voir § Persistance) |

> Northflank abandonné (exigence CB). Ne pas utiliser pour ce projet.

---

## Ce qui est prêt dans le repo

| Fichier | Rôle |
|---------|------|
| `render.yaml` | Blueprint API FastAPI |
| `backend/Dockerfile` | Option Docker sur Render |
| `frontend/vercel.json` | Build Vite + SPA |
| CORS | `FRONTEND_ORIGIN` + regex `https://.*\.vercel\.app` |
| `GET /health` | Public, sans auth — OK pour cron-job.org |
| `backend/app/storage/db.py` | Postgres optionnel si `DATABASE_URL` est défini |

Sans `DATABASE_URL` : fichiers sous `DATA_DIR` (**éphémère** sur Render Free → historique perdu au redeploy / redémarrage).

---

## A. Render — API

1. [https://dashboard.render.com](https://dashboard.render.com) → connecte GitHub.
2. **New** → **Blueprint** (détecte `render.yaml`) **ou** Web Service, **Root Directory** = `backend`.
3. Plan **Free**.
4. Environment :

| Variable | Valeur |
|----------|--------|
| `GEMINI_API_KEY` | clé Google AI |
| `FRONTEND_ORIGIN` | `https://TON-APP.vercel.app` |
| `APP_ENV` | `production` |
| `DATA_DIR` | `/tmp/smartchef-data` (défaut blueprint) |
| `DATABASE_URL` | *(optionnel)* URI Neon — voir § Persistance |

5. Deploy → URL du type `https://smartchef-api-xxxx.onrender.com`
6. Vérifie : `https://…onrender.com/health` → `"status": "ok"`.

---

## B. cron-job.org — garder l’API éveillée

1. Compte gratuit sur [https://cron-job.org](https://cron-job.org) (pas de CB).
2. **Create cronjob** :
   - URL : `https://smartchef-api-xxxx.onrender.com/health`
   - Schedule : toutes les **10 minutes**
   - Method : `GET`
   - Notifications : optionnel
3. Active le job. Les pings empêchent le sleep Render (~15 min d’inactivité).

> Si le cron s’arrête, le cold start (~30–60 s) revient. Vérifie de temps en temps l’historique d’exécution sur cron-job.org.

---

## C. Vercel — frontend

Déjà en place. Si l’URL API change :

```bash
cd ~/Desktop/Projets/agent-repas-courses/frontend
vercel env add VITE_API_URL production
# colle https://smartchef-api-xxxx.onrender.com  (sans / final)

vercel --prod
```

Ou dashboard Vercel → Environment Variables → `VITE_API_URL` → **Redeploy**.

---

## D. Persistance de l’historique (recommandation)

### Verdict

| Option | Gratuit sans CB ? | Durable long terme ? | Verdict |
|--------|-------------------|----------------------|---------|
| Fichiers `/tmp` Render | Oui | Non (effacé redeploy / restart) | Insuffisant |
| Render Postgres Free | Oui | **Non** (expire **30 jours** puis suppression) | À éviter |
| Supabase Free | Oui | Fragile (pause projet ~**7 j** sans activité) | OK seulement + cron DB |
| **Neon Free** | Oui | Oui (données gardées ; compute sleep 5 min → réveil ~ms) | **Recommandé** |
| Upstash / Vercel KV | Oui (limites) | Oui pour cache, moins naturel pour gros JSON sessions | Secondaire |

**Recommandation :** **Neon Free** + variable `DATABASE_URL` sur Render.  
Le backend branche déjà Postgres (`psycopg`) quand `DATABASE_URL` est défini — pas besoin de `supabase-py` pour ce flux.

### Pourquoi pas Supabase en premier ?

- Avantages : UI agréable, Auth/Storage si besoin plus tard, JSONB OK.
- Inconvénients : pause projet après ~7 jours d’inactivité (pire qu’un sleep DB de quelques centaines de ms). Il faudrait un second cron qui touche la DB. Neon scale-to-zero se réveille automatiquement à la prochaine requête API.

### Brancher Neon (quand tu veux l’historique durable)

1. [https://neon.tech](https://neon.tech) → projet Free (sans CB).
2. Copie la connection string (URI Postgres).
3. Render → Environment → `DATABASE_URL` = cette URI.
4. Redeploy API. Au boot : tables `smartchef_sessions` / `smartchef_profile` créées automatiquement.

Schéma (déjà créé par le code) :

```sql
-- smartchef_sessions : id, payload JSONB, summary JSONB, updated_at, is_latest
-- smartchef_profile  : id=1, payload JSONB
```

---

## E. Push

```bash
cd ~/Desktop/Projets/agent-repas-courses
git push origin main
```

---

## Checklist

| Symptôme | Action |
|----------|--------|
| Cold start 1–2 min | Vérifier cron-job.org toutes les 10 min sur `/health` |
| CORS | `FRONTEND_ORIGIN` = URL Vercel + regex `*.vercel.app` déjà dans le code |
| Historique perdu | Ajouter Neon + `DATABASE_URL` |
| Gemini échoue | Clé + quotas Google AI |
