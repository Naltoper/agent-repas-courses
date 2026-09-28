# Bilan — Préparation déploiement Vercel + Render

**Rôle :** Développeur senior  
**Date :** 2026-09-29  
**Périmètre :** Config prod UI (Vercel) + API (Render) — **sans** Keep / YouTube  
**Statut :** ✅ Config dans le repo · déploiement cloud à faire par l’utilisateur (comptes / secrets)

---

## 1. Décisions

| Sujet | Choix |
|-------|--------|
| Front | Vercel, root `frontend`, `VITE_API_URL` = URL Render |
| API | Render free Web Service, blueprint `render.yaml`, root `backend` |
| CORS | `FRONTEND_ORIGIN` + regex `https://.*\.vercel\.app` |
| Données | `DATA_DIR=/tmp/smartchef-data` (éphémère sur free) |

---

## 2. Fichiers touchés

- `render.yaml`, `frontend/vercel.json`, `DEPLOY.md`
- `backend/app/main.py` — CORS Vercel
- `backend/.env.example`, `frontend/.env.example`

---

## 3. À faire côté utilisateur

1. Push GitHub  
2. Render + `GEMINI_API_KEY`  
3. Vercel + `VITE_API_URL`  
4. Mettre `FRONTEND_ORIGIN` = URL Vercel  

Détail : voir **`DEPLOY.md`**.

---

## 4. Risques

- Cold start Render free  
- Perte historique au redémarrage (`/tmp`)  
- Quota Gemini  

---

## 5. Prochaine étape

Suivre `DEPLOY.md` jusqu’au test mobile ; optionnellement disque persistant Render ou DB plus tard.
