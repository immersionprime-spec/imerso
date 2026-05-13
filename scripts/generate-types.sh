#!/usr/bin/env bash
# Gerar tipos TypeScript a partir do projeto Supabase remoto.
# Uso: npx supabase login && ./scripts/generate-types.sh <PROJECT_REF>
set -euo pipefail
if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/generate-types.sh <PROJECT_REF>"
  exit 1
fi
npx supabase gen types typescript --project-id "$1" > src/types/database.types.ts
