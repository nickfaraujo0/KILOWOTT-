#!/usr/bin/env bash
# Rebuilds the local Docker WooCommerce store (PawNest, 15 products with photos) from shared/catalog.json. Deletes existing products. Keeps existing API keys.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
docker compose exec -T wordpress sh -c "mkdir -p /var/www/html/wp-content/staging-images"
for f in server/mock/images/*.jpg shared/catalog.json; do docker compose cp "$f" wordpress:/var/www/html/wp-content/staging-images/ >/dev/null; done
docker compose exec -T wordpress chown -R www-data:www-data /var/www/html/wp-content/staging-images
docker compose run --rm -T wpcli wp eval-file - < scripts/seed.php | grep -v Container
echo "Docker store reset. Click 'Import from WooCommerce' in PawPIM."
"$(dirname "$0")/install-theme.sh"
