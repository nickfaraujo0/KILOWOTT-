<?php
// Rebuilds the PawNest catalog from shared/catalog.json (staged next to the images). Wipes existing products first.
// Prints "KEYS ck cs" only when MAKE_KEYS is set.
$stage = '/var/www/html/wp-content/staging-images';
$catalog = json_decode(file_get_contents("$stage/catalog.json"), true);
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

// 0. wipe orders (seeded again below)
foreach (wc_get_orders(['limit' => -1, 'return' => 'ids', 'status' => array_keys(wc_get_order_statuses())]) as $oid) { $o = wc_get_order($oid); if ($o) $o->delete(true); }

// 1. wipe: products, their media, and old categories
foreach (get_posts(['post_type' => ['product', 'product_variation'], 'numberposts' => -1, 'post_status' => 'any', 'fields' => 'ids']) as $id) {
  foreach (get_children(['post_parent' => $id, 'post_type' => 'attachment', 'fields' => 'ids']) as $att) wp_delete_attachment($att, true);
  wp_delete_post($id, true);
}
foreach (get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false]) as $t) { if ($t->slug !== 'uncategorized') wp_delete_term($t->term_id, 'product_cat'); }

// 2. categories
$cats = [];
foreach (array_unique(array_filter(array_column($catalog['products'], 'category'))) as $n) { $t = wp_insert_term($n, 'product_cat'); $cats[$n] = (int) $t['term_id']; }

// 3. products with photos
foreach ($catalog['products'] as $c) {
  $p = new WC_Product_Simple();
  $p->set_name($c['name']); $p->set_sku($c['sku']); $p->set_regular_price($c['price']);
  if (isset($c['stock'])) { $p->set_manage_stock(true); $p->set_stock_quantity((int) $c['stock']); $p->set_stock_status($c['stock'] > 0 ? 'instock' : 'outofstock'); }
  $p->set_description($c['description']); $p->set_short_description($c['shortDescription']); $p->set_status('publish');
  if ($c['category']) $p->set_category_ids([$cats[$c['category']]]);
  $attrs = []; $i = 0;
  foreach ($c['attributes'] as $name => $val) { $a = new WC_Product_Attribute(); $a->set_name($name); $a->set_options([$val]); $a->set_visible(true); $a->set_position($i++); $attrs[] = $a; }
  $p->set_attributes($attrs);
  $p->save();
  $file = "$stage/{$c['kind']}.jpg";
  if (file_exists($file)) {
    $tmp = wp_tempnam($file); copy($file, $tmp);
    $att = media_handle_sideload(['name' => "{$c['kind']}.jpg", 'tmp_name' => $tmp], $p->get_id());
    if (!is_wp_error($att)) { $p->set_image_id($att); $p->save(); }
  }
}
// 4. order history (last 60 days) for analytics. Stock hooks are removed so seeding does not change stock levels.
foreach (['completed', 'processing', 'on-hold'] as $st) remove_action("woocommerce_order_status_$st", 'wc_maybe_reduce_stock_levels');
foreach (['cancelled', 'refunded', 'pending'] as $st) remove_action("woocommerce_order_status_$st", 'wc_maybe_increase_stock_levels');
add_filter('pre_wp_mail', '__return_false');
mt_srand(7);
$cities = ['Mumbai', 'Mumbai', 'Delhi', 'Delhi', 'Bengaluru', 'Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Goa', 'Kolkata'];
$weight = ['dogfood' => 10, 'catfood' => 10, 'dogtoy' => 8, 'mousetoy' => 8, 'dogtreats' => 8, 'featherwand' => 7, 'collar' => 6, 'leash' => 6, 'dogbowl' => 5, 'rope' => 5, 'litterbox' => 3, 'scratchpost' => 3, 'dogbed' => 3, 'catbed' => 2, 'brush' => 2];
$pool = [];
foreach ($catalog['products'] as $c) {
  $pid = $c['sku'] ? wc_get_product_id_by_sku($c['sku']) : (get_posts(['post_type' => 'product', 'title' => $c['name'], 'numberposts' => 1, 'fields' => 'ids'])[0] ?? 0);
  if ($pid) for ($i = 0; $i < ($weight[$c['kind']] ?? 2); $i++) $pool[] = $pid;
}
$made = 0;
for ($d = 59; $d >= 0; $d--) {
  $ts = strtotime("-$d days"); $weekend = in_array((int) date('w', $ts), [0, 6]);
  $n = (int) round(($weekend ? 3.4 : 2.2) * (0.7 + (60 - $d) / 120) + mt_rand(0, 200) / 100 - 0.5);
  for ($k = 0; $k < max(0, $n); $k++) {
    $when = strtotime(date('Y-m-d', $ts) . ' ' . (8 + mt_rand(0, 12)) . ':' . sprintf('%02d', mt_rand(0, 59)) . ':00');
    if ($when > time()) continue;
    $order = wc_create_order(['status' => 'pending']);
    $lines = mt_rand(1, 3);
    for ($l = 0; $l < $lines; $l++) { $prod = wc_get_product($pool[mt_rand(0, count($pool) - 1)]); if (!$prod) continue; $order->add_product($prod, mt_rand(1, ((float) $prod->get_regular_price() < 500 ? 4 : 2))); }
    $order->set_billing_city($cities[mt_rand(0, count($cities) - 1)]); $order->set_billing_country('IN'); $order->set_currency('INR');
    $order->calculate_totals(false);
    $r = mt_rand(0, 99); $status = $r < 72 ? 'completed' : ($r < 86 ? 'processing' : ($r < 95 ? 'cancelled' : 'refunded'));
    $order->set_date_created($when); $order->set_status($status); $order->save(); $made++;
  }
}
// make sure stock matches the catalog even if a hook slipped through
foreach ($catalog['products'] as $c) { if (!isset($c['stock'])) continue; $pid = $c['sku'] ? wc_get_product_id_by_sku($c['sku']) : (get_posts(['post_type' => 'product', 'title' => $c['name'], 'numberposts' => 1, 'fields' => 'ids'])[0] ?? 0); if ($pid) { $pp = wc_get_product($pid); $pp->set_manage_stock(true); $pp->set_stock_quantity((int) $c['stock']); $pp->set_stock_status($c['stock'] > 0 ? 'instock' : 'outofstock'); $pp->save(); } }
echo "$made orders\n";
update_option('blogname', $catalog['storeName']);
update_option('blogdescription', 'Everything for cats and dogs');
update_option('woocommerce_currency', 'INR');
echo count($catalog['products']) . " products\n";

if (!getenv('MAKE_KEYS')) { echo "RESET done\n"; return; }
global $wpdb;
$ck = 'ck_' . wc_rand_hash(); $cs = 'cs_' . wc_rand_hash();
$wpdb->insert($wpdb->prefix . 'woocommerce_api_keys', [
  'user_id' => 1, 'description' => 'PawPIM', 'permissions' => 'read_write',
  'consumer_key' => wc_api_hash($ck), 'consumer_secret' => $cs, 'truncated_key' => substr($ck, -7),
]);
echo "KEYS $ck $cs\n";
