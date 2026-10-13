#!/bin/sh
set -e

echo "[kyvo-api] applying database migrations"
npx prisma migrate deploy

echo "[kyvo-api] seeding catalogue (no-op if products exist)"
npx tsx prisma/seed.ts

exec node dist/server.js
