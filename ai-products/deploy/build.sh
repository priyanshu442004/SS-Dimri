#!/usr/bin/env bash
# Build the AI products (ai-products/apps/*) and publish their static files to
# $PUBLIC/ai-products/<slug>/ (nginx root = $PUBLIC).
#
#   bash ai-products/deploy/build.sh            # install + build everything, publish to $PUBLIC
#   ONLY="tds-return vendor-ledger" bash ...     # just these products
#   PUBLISH=0 bash ...                           # build only (local testing)
#
# Each product is a Vite frontend (served by nginx at /ai-products/<slug>/) plus a backend
# (Node, or FastAPI for GST) run by PM2 from ai-products/deploy/ecosystem.config.cjs.
# Python virtualenvs hold the ReportLab PDF renderers (and the GST API).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS="$ROOT/apps"
PUBLIC="${PUBLIC:-/var/www/ss-dimri-ai-products}"
PUBLISH="${PUBLISH:-1}"
# Payroll & Compliance is switched off, as on aiproducts.analytx4t.com — add it here to bring it back.
ALL="financial-reporting invoice-automation bank-reconciliation virtual-cfo gst-reconciliation tds-return vendor-ledger customer-ledger fixed-asset-register"
ONLY="${ONLY:-$ALL}"

# Windows (Git Bash) virtualenvs keep python in Scripts/, Linux in bin/.
PY="${PYTHON:-python3}"; VBIN=bin
if [[ "${OS:-}" == "Windows_NT" ]]; then PY="${PYTHON:-python}"; VBIN=Scripts; fi

venv() { # venv <dir> <requirements>
  [ -x "$1/$VBIN/python" ] || [ -x "$1/$VBIN/python.exe" ] || "$PY" -m venv "$1"
  "$1/$VBIN/python" -m pip install -q --disable-pip-version-check -r "$2"
}

for app in $ONLY; do
  echo "→ $app"
  if [ "$app" = financial-reporting ]; then
    fe="$APPS/$app"
  else
    fe="$APPS/$app/frontend"
  fi
  (cd "$fe" && npm ci --no-audit --no-fund --loglevel=error && npm run build)
  be="$APPS/$app/backend"
  mkdir -p "$be/data"
  if [ "$app" = gst-reconciliation ]; then
    venv "$be/.venv" "$be/requirements.txt"
  else
    (cd "$be" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
    [ -f "$be/report/requirements.txt" ] && venv "$be/report/.venv" "$be/report/requirements.txt"
  fi
  [ "$app" = financial-reporting ] && mkdir -p "$be/uploads"
done

if [ "$PUBLISH" = 1 ]; then
  echo "→ Publishing static files to $PUBLIC"
  STAGE="$(mktemp -d)"
  chmod 755 "$STAGE" # nginx (www-data) must be able to read the published tree
  for app in $ALL; do
    src="$APPS/$app/frontend/dist"; [ "$app" = financial-reporting ] && src="$APPS/$app/dist"
    [ -d "$src" ] || { echo "missing build: $src" >&2; exit 1; }
    mkdir -p "$STAGE/ai-products/$app" && cp -r "$src/." "$STAGE/ai-products/$app/"
  done
  sudo mkdir -p "$PUBLIC"
  sudo rsync -a --delete --chmod=D755,F644 "$STAGE/" "$PUBLIC/"
  rm -rf "$STAGE"
fi
echo "✓ AI products built"
