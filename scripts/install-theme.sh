#!/usr/bin/env bash
# Copies the PawNest storefront theme into the Docker WordPress and activates it.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T wordpress mkdir -p /var/www/html/wp-content/themes/pawnest
for f in store-theme/pawnest/*; do docker compose cp "$f" "wordpress:/var/www/html/wp-content/themes/pawnest/$(basename "$f")" >/dev/null; done
docker compose exec -T wordpress chown -R www-data:www-data /var/www/html/wp-content/themes/pawnest
docker compose run --rm -T wpcli wp theme activate pawnest 2>&1 | grep -v Container
