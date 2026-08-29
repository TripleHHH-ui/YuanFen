#!/usr/bin/env bash
# Verification script for swapStop test fixes
# Run this from the repository root

set -e

echo "=== Running vitest suite ==="
npx vitest run

echo ""
echo "=== Type checking packages/shared ==="
npx tsc --noEmit -p packages/shared/tsconfig.json

echo ""
echo "=== Type checking apps/api ==="
npx tsc --noEmit -p apps/api/tsconfig.json

echo ""
echo "=== Type checking apps/web ==="
npx tsc --noEmit -p apps/web/tsconfig.json

echo ""
echo "✓ All checks passed"
