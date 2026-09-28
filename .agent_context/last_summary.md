# Bilan — SmartChef Agent (fix JSON/`<!doctype` + lancement)

**Rôle :** Développeur senior  
**Date :** 2026-09-29  
**Périmètre :** API injoignable / profil / historique (`Unexpected token '<'`) — **sans** Keep / YouTube  
**Statut :** ✅ Corrigé et testé (`npm run build` · `scripts/check_api.sh` · `python -m tests.test_api`)

---

## 1. Diagnostic

| Symptôme | Cause |
|----------|--------|
| `Unexpected token '<', "<!doctype"...` | Le client parsait du **HTML** (SPA Vite) au lieu du JSON API |
| Cause racine | `VITE_API_URL=` (chaîne **vide**) dans `.env.development` ⇒ `API_BASE=""` ⇒ fetch `/health`, `/profile`… **sans** préfixe `/api` ⇒ Vite renvoie `index.html` |
| Secondaire | Vite écoutait parfois seulement `[::1]:5173` → accès `127.0.0.1` fragile |

---

## 2. Décisions / correctifs

- Traiter `VITE_API_URL` vide comme « non défini » → défaut `/api`
- Vite : `host: 127.0.0.1`, `strictPort: true`, proxy → `:8000`
- Messages d’erreur explicites si réponse HTML
- Script `scripts/check_api.sh` pour valider API directe + proxy

---

## 3. Fichiers touchés

- `frontend/src/api/client.ts`
- `frontend/vite.config.ts`
- `frontend/.env.development` / `.env.example`
- `scripts/check_api.sh`
- `.agent_context/last_summary.md`

---

## 4. Lancement correct (ports)

1. **API** → `127.0.0.1:8000`  
2. **UI** → `127.0.0.1:5173`  

```bash
# Terminal 1
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2
cd frontend && npm run dev
# → http://127.0.0.1:5173/
```

Vérif : `./scripts/check_api.sh`

---

## 5. Risques restants

- Oublier de redémarrer Vite après changement d’`.env*`
- Un second uvicorn sur un autre port si `VITE_API_PROXY_TARGET` n’est pas aligné

---

## 6. Prochaine étape proposée

Script `make dev` unique (tue les ports 8000/5173 puis démarre les deux) pour éviter les conflits.
