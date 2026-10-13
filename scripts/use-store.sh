#!/usr/bin/env bash
# Usage: scripts/use-store.sh mock|docker   (restart the server afterwards)
set -euo pipefail
cd "$(dirname "$0")/.."
ENVF=server/.env; SAVED=server/.env.docker-woo
setvals() { grep -v '^WOOCOMMERCE_' $ENVF > $ENVF.tmp || true; printf 'WOOCOMMERCE_STORE_URL=%s\nWOOCOMMERCE_CONSUMER_KEY=%s\nWOOCOMMERCE_CONSUMER_SECRET=%s\n' "$1" "$2" "$3" >> $ENVF.tmp; mv $ENVF.tmp $ENVF; }
case "${1:-}" in
  mock)
    if grep -q '^WOOCOMMERCE_STORE_URL=http://localhost:8080' $ENVF 2>/dev/null; then grep '^WOOCOMMERCE_' $ENVF > $SAVED; fi
    setvals http://localhost:8081 ck_mock cs_mock; echo "Using MOCK store (start it: cd server && npm run mock-woo)";;
  docker)
    [ -f $SAVED ] || { echo "No saved Docker keys. Run scripts/setup-store.sh"; exit 1; }
    set -a; source $SAVED; set +a; setvals "$WOOCOMMERCE_STORE_URL" "$WOOCOMMERCE_CONSUMER_KEY" "$WOOCOMMERCE_CONSUMER_SECRET"; echo "Using Docker store";;
  *) echo "usage: $0 mock|docker"; exit 1;;
esac
