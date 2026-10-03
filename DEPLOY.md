# Déploiement SmartChef — Vercel (UI) + Northflank (API + Postgres)
#
# Choix BDD : **Postgres addon Northflank** (inclus dans le Sandbox gratuit :
# 1× database, always-on, pas de pause après 7 jours comme Supabase Free).
# Supabase n’est **pas** utilisé dans ce guide.

Usage cible : 1 personne, quelques fois / semaine, mobile. Sans cold start Render.

---

## Ce qui est prêt dans le repo

| Fichier | Rôle |
|---------|------|
| `backend/Dockerfile` | Image API pour Northflank |
| `backend/app/storage/db.py` | Persistance Postgres (historique + profil) |
| `frontend/vercel.json` | Build Vite + SPA (déjà déployé) |
| `render.yaml` | **Obsolète** — à ne plus utiliser |

Variables API : `GEMINI_API_KEY`, `FRONTEND_ORIGIN`, `DATABASE_URL` (ou `POSTGRES_URI`), `APP_ENV=production`.

En local sans Postgres : fichiers JSON dans `DATA_DIR` (comportement inchangé).

---

## A. Retirer Render

1. Ouvre [https://dashboard.render.com](https://dashboard.render.com).
2. Service `smartchef-api` (ou équivalent) → **Settings** → **Delete Web Service**.
3. Si un Blueprint était lié au repo, tu peux le laisser ou le supprimer — le fichier `render.yaml` du repo n’est plus la cible de déploiement.

Rien à faire côté code pour « déconnecter » Render : dès que Vercel pointe vers Northflank, Render n’est plus appelé.

---

## B. Northflank — Postgres puis API

### B1. Compte & projet

1. [https://app.northflank.com](https://app.northflank.com) → créer un compte (plan **Sandbox**).
2. **Create project** → ex. `smartchef`.
3. Relie GitHub et autorise le repo `agent-repas-courses`.

### B2. Addon PostgreSQL (gratuit Sandbox)

1. **Create new** → **Addon** → **PostgreSQL**.
2. Nom : `smartchef-db`.
3. Garde la plus petite taille / plan Sandbox.
4. TLS recommandé ; **pas besoin** d’accès public si l’API est dans le même projet.
5. Crée l’addon → attends qu’il soit **Running**.
6. Onglet **Connection details** / secrets : note `POSTGRES_URI` (ou équivalent).

### B3. Service API (combined / deployment)

1. **Create new** → **Combined service** (build + deploy) ou **Deployment** depuis Git.
2. Repo : `agent-repas-courses`.
3. **Build context / root directory** : `backend` (important).
4. Build : **Dockerfile** → chemin `Dockerfile` (dans `backend/`).
5. Port : `8000` (ou celui injecté via `PORT` — le `CMD` lit `$PORT`).
6. Health check path : `/health`.
7. **Runtime / secrets** (lier aussi les secrets de l’addon Postgres) :

| Variable | Valeur |
|----------|--------|
| `APP_ENV` | `production` |
| `GEMINI_API_KEY` | ta clé Google AI |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `FRONTEND_ORIGIN` | URL Vercel exacte, ex. `https://xxx.vercel.app` |
| `DATABASE_URL` | valeur de `POSTGRES_URI` de l’addon (souvent via « link secret group ») |

8. Deploy → copie l’URL HTTPS du service, ex. `https://smartchef-api-xxxx.northflank.app`.
9. Test : ouvre `https://…/health` → JSON `status: ok`.

> Le schéma SQL (`smartchef_sessions`, `smartchef_profile`) est créé **au démarrage** de l’API.

---

## C. Vercel — pointer le front vers Northflank

Le front est déjà sur Vercel. Il faut seulement changer l’URL API puis rebuild.

### Via dashboard (recommandé)

1. [https://vercel.com](https://vercel.com) → projet frontend.
2. **Settings** → **Environment Variables** → `VITE_API_URL`  
   = `https://TON-SERVICE.northflank.app`  
   (**sans** `/` final, **sans** `/api` — sauf si tu as volontairement monté l’API sous `/api` ; l’app accepte les deux).
3. **Deployments** → **Redeploy** (cocher rebuild sans cache si dispo).

### Via CLI

```bash
cd ~/Desktop/Projets/agent-repas-courses/frontend
vercel env add VITE_API_URL production
# colle l’URL Northflank quand demandé

vercel --prod
```

Si les variables sont déjà à jour :

```bash
cd ~/Desktop/Projets/agent-repas-courses/frontend
vercel --prod
```

---

## D. Checklist de validation

1. `https://API-NORTHFLANK/health` → ok + `integrations.gemini` si clé OK.  
2. Front Vercel → générer un menu → Valider → Historique.  
3. Redéploie ou redémarre l’API Northflank → l’historique doit **encore** être là (Postgres).  
4. Plus de délai de 1–2 min au premier appel (pas de sleep Render).

---

## E. Push du code (si tu n’as pas encore poussé)

```bash
cd ~/Desktop/Projets/agent-repas-courses
git push origin main
```

Northflank redéploiera si le service est branché sur `main`.

---

## Dépannage

| Symptôme | Action |
|----------|--------|
| CORS | `FRONTEND_ORIGIN` = URL Vercel exacte + regex `*.vercel.app` déjà dans le code |
| `Unexpected token '<'` | `VITE_API_URL` faux ou deploy Vercel sans rebuild |
| Erreur Postgres au boot | Secret `DATABASE_URL` / `POSTGRES_URI` manquant ou addon pas prêt |
| Gemini échoue | Clé + quotas Google AI Studio |
| Build Docker échoue | Root directory = `backend`, pas la racine du monorepo |

---

## Pourquoi pas Supabase ici ?

- Supabase **Free** pause après ~7 jours d’inactivité → même classe de problème que « pas toujours accessible ».
- Northflank Sandbox inclut **1× database** always-on, dans le même projet que l’API → un seul panneau, historique durable sans pause hebdo.

Si un jour tu quittes le Sandbox Northflank, tu pourras migrer les tables JSONB vers Supabase Pro ou un autre Postgres.
