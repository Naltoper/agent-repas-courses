# Bilan — Préparation déploiement Vercel + Northflank (+ Postgres)

**Rôle :** Développeur senior  
**Date :** 2026-10-03  
**Périmètre :** Remplacer Render ; API always-on Northflank ; BDD Postgres Sandbox  
**Statut :** ✅ Config + persistance Postgres optionnelle dans le repo · déploiement à faire par l’utilisateur

---

## 1. Décision BDD

**Postgres addon Northflank** (pas Supabase) : inclus dans le Sandbox gratuit (1× DB), always-on, pas de pause à 7 jours.

---

## 2. Fichiers

- `backend/Dockerfile`, `backend/.dockerignore`
- `backend/app/storage/db.py` + branchements `run_store` / `profile_store`
- `psycopg[binary]` dans `requirements.txt`
- `DEPLOY.md` réécrit (étapes Render → Northflank → Vercel)
- `render.yaml` marqué deprecated

---

## 3. Actions utilisateur

Voir **`DEPLOY.md`** : supprimer Render → créer addon Postgres + service API → `VITE_API_URL` + `vercel --prod`.
