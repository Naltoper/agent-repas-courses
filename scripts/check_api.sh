#!/usr/bin/env bash
# Smoke-check: API directe + proxy Vite (évite les régressions HTML/JSON).
set -euo pipefail

API="${API_URL:-http://127.0.0.1:8000}"
UI="${UI_URL:-http://127.0.0.1:5173}"

echo "== Direct API $API =="
curl -sf "$API/health" | head -c 120
echo
curl -sf "$API/profile" | head -c 120
echo
curl -sf "$API/agent/sessions" | head -c 120
echo

echo "== Via Vite proxy $UI/api =="
for path in /api/health /api/profile /api/agent/sessions; do
  code=$(curl -s -o /tmp/sc_body.txt -w "%{http_code}" "$UI$path")
  ctype=$(file -b --mime-type /tmp/sc_body.txt 2>/dev/null || echo unknown)
  head=$(head -c 40 /tmp/sc_body.txt | tr '\n' ' ')
  echo "$path → HTTP $code · $ctype · $head"
  if [[ "$head" == \<!doctype* ]] || [[ "$head" == \<!DOCTYPE* ]]; then
    echo "FAIL: HTML received instead of JSON for $path"
    exit 1
  fi
  if [[ "$code" != "200" ]]; then
    echo "FAIL: expected 200 for $path"
    exit 1
  fi
done

echo "OK — API + proxy Vite renvoient du JSON."
