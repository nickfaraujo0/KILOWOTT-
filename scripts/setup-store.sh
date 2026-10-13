#!/usr/bin/env bash
# Sets up the local WooCommerce test store and writes WOOCOMMERCE_* values to server/.env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
WP="docker compose run --rm -T wpcli wp"
echo "Waiting for WordPress files..."
until docker compose exec -T wordpress test -f /var/www/html/wp-config.php 2>/dev/null; do sleep 3; done
until $WP db check >/dev/null 2>&1; do sleep 3; done
if ! $WP core is-installed 2>/dev/null; then
  $WP core install --url=http://localhost:8080 --title="PawPIM Test Store" --admin_user=admin \
    --admin_password="$WP_ADMIN_PASSWORD" --admin_email=admin@example.com --skip-email
fi
$WP plugin is-installed woocommerce 2>/dev/null || $WP plugin install woocommerce --activate
$WP plugin activate woocommerce
$WP rewrite structure '/%postname%/' --hard
stage_images() {
  docker compose exec -T wordpress sh -c "mkdir -p /var/www/html/wp-content/staging-images"
  for f in server/mock/images/*.jpg shared/catalog.json; do docker compose cp "$f" wordpress:/var/www/html/wp-content/staging-images/ >/dev/null; done
  docker compose exec -T wordpress chown -R www-data:www-data /var/www/html/wp-content/staging-images
}
# LOCAL DEV ONLY: lets WooCommerce accept API keys over plain HTTP (see scripts/local-dev-ssl.php).
docker compose exec -T wordpress mkdir -p /var/www/html/wp-content/mu-plugins
docker compose cp scripts/local-dev-ssl.php wordpress:/var/www/html/wp-content/mu-plugins/local-dev-ssl.php
docker compose exec -T wordpress chown -R www-data:www-data /var/www/html/wp-content/mu-plugins
$WP option update woocommerce_currency INR >/dev/null
$WP option update woocommerce_currency_pos left >/dev/null
stage_images
OUT=$(docker compose run --rm -T -e MAKE_KEYS=1 wpcli wp eval-file - < scripts/seed.php | grep '^KEYS ')
CK=$(echo "$OUT" | awk '{print $2}'); CS=$(echo "$OUT" | awk '{print $3}')
ENVF=server/.env
touch $ENVF
grep -v '^WOOCOMMERCE_' $ENVF > $ENVF.tmp || true
grep -q '^PORT=' $ENVF.tmp || echo 'PORT=3001' >> $ENVF.tmp
grep -q '^ANTHROPIC_API_KEY=' $ENVF.tmp || echo 'ANTHROPIC_API_KEY=' >> $ENVF.tmp
grep -q '^ANTHROPIC_MODEL=' $ENVF.tmp || echo 'ANTHROPIC_MODEL=' >> $ENVF.tmp
printf 'WOOCOMMERCE_STORE_URL=http://localhost:8080\nWOOCOMMERCE_CONSUMER_KEY=%s\nWOOCOMMERCE_CONSUMER_SECRET=%s\n' "$CK" "$CS" >> $ENVF.tmp
mv $ENVF.tmp $ENVF
echo "Done. Store: http://localhost:8080  (keys written to server/.env)"
"$(dirname "$0")/install-theme.sh"
