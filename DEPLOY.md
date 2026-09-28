# Déploiement SmartChef — Vercel (UI) + Render (API)

Usage cible : 2 personnes, quelques fois / semaine, navigateur mobile.  
**Gratuit** sur les plans Free (sous réserve des quotas Gemini / cold start Render).

---

## Ce qui est déjà prêt dans le repo

| Fichier | Rôle |
|---------|------|
| `render.yaml` | Blueprint API FastAPI sur Render |
| `frontend/vercel.json` | Build Vite + SPA rewrite |
| CORS | Accepte `FRONTEND_ORIGIN` + `*.vercel.app` |
| `DATA_DIR=/tmp/smartchef-data` | Écriture OK sur Render free |

---

## À faire **toi-même** (dans l’ordre)

### A. Mettre le code sur GitHub

1. Crée un repo GitHub (privé ou public).
2. Depuis la machine du projet :

```bash
cd ~/Desktop/Projets/agent-repas-courses
git remote add origin https://github.com/TON_USER/TON_REPO.git
git push -u origin main
```

(Si `origin` existe déjà : `git push -u origin main`.)

---

### B. Render — API (fais ça **avant** Vercel)

1. Va sur [https://render.com](https://render.com) → connecte GitHub.
2. **New** → **Blueprint** → sélectionne le repo (détecte `render.yaml`)  
   **ou** New → Web Service → repo, **Root Directory** = `backend`.
3. Plan **Free**.
4. Dans **Environment** du service, renseigne :

| Variable | Valeur |
|----------|--------|
| `GEMINI_API_KEY` | ta clé Google AI |
| `FRONTEND_ORIGIN` | pour l’instant `http://localhost:5173` — **tu mettras l’URL Vercel juste après** |
| `APP_ENV` | `production` (déjà dans le blueprint) |

5. Deploy → copie l’URL du type :  
   `https://smartchef-api-xxxx.onrender.com`
6. Vérifie : ouvre `https://…onrender.com/health` → JSON `status: ok`.

> Au premier appel après inactivité, Render free peut mettre **30–60 s** (cold start). Normal.

---

### C. Vercel — Frontend

1. Va sur [https://vercel.com](https://vercel.com) → Import du **même** repo GitHub.
2. Réglages projet :
   - **Root Directory** : `frontend`
   - Framework : Vite (auto)
   - Build : `npm run build` · Output : `dist`
3. **Environment Variables** (Production) :

| Variable | Valeur |
|----------|--------|
| `VITE_API_URL` | `https://smartchef-api-xxxx.onrender.com` (**sans** `/` final, **sans** `/api`) |

4. Deploy → copie l’URL : `https://xxx.vercel.app`
5. Sur mobile : ouvre cette URL dans Safari/Chrome.

---

### D. Recoller les deux (CORS)

1. Retour **Render** → Environment → mets à jour :

| Variable | Valeur |
|----------|--------|
| `FRONTEND_ORIGIN` | `https://xxx.vercel.app` |

2. **Redeploy** Render (ou “Manual Deploy”).
3. **Redeploy** Vercel seulement si tu as changé `VITE_API_URL` après le premier build.

Test final : sur le téléphone, génère un menu → Valider → Estimation.

---

## Checklist si ça coince

| Symptôme | Action |
|----------|--------|
| CORS / réseau bloqué | `FRONTEND_ORIGIN` = URL Vercel exacte (https) + redeploy Render |
| `Unexpected token '<'` / API HTML | `VITE_API_URL` manquant ou faux → rebuild Vercel |
| `/health` Render down | Regarde les logs Render ; `GEMINI_API_KEY` n’est pas requis pour `/health` |
| Agent échoue | Clé Gemini + quotas Google AI |
| Historique perdu après sleep | Normal sur free (disque `/tmp` effacé au redémarrage) |

---

## Coûts estimés

- **Vercel Free** : OK pour 2 users occasionnels  
- **Render Free** : OK (cold starts)  
- **Gemini** : selon ton quota Google AI Studio (souvent suffisant en light)

---

## Ce que tu n’as **pas** à coder

Proxy Vite, routes API, config CORS `*.vercel.app`, blueprint Render, `vercel.json` — déjà dans le repo après le commit de déploiement.
