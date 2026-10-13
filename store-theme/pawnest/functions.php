<?php
add_action('after_setup_theme', function () {
  add_theme_support('title-tag'); add_theme_support('post-thumbnails'); add_theme_support('woocommerce');
  add_theme_support('wc-product-gallery-zoom'); add_theme_support('wc-product-gallery-lightbox'); add_theme_support('wc-product-gallery-slider');
  add_theme_support('html5', ['search-form', 'gallery', 'caption', 'style', 'script']);
});
add_action('wp_enqueue_scripts', function () {
  wp_enqueue_style('pawnest-fonts', 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fredoka:wght@500;600;700&display=swap', [], null);
  wp_enqueue_style('pawnest', get_stylesheet_uri(), [], filemtime(get_stylesheet_directory() . '/style.css'));
});
add_filter('loop_shop_columns', fn() => 4);
add_filter('loop_shop_per_page', fn() => 16);
// "Only a few left" badge on the product grid, driven by the stock level.
add_action('woocommerce_before_shop_loop_item_title', function () {
  global $product;
  if ($product && $product->managing_stock() && $product->get_stock_quantity() > 0 && $product->get_stock_quantity() <= 5) echo '<span class="stock-badge low">Only ' . (int) $product->get_stock_quantity() . ' left</span>';
}, 5);
function pawnest_paw() { return '<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><ellipse cx="20" cy="22" rx="6" ry="8"/><ellipse cx="44" cy="22" rx="6" ry="8"/><ellipse cx="9" cy="37" rx="5" ry="7"/><ellipse cx="55" cy="37" rx="5" ry="7"/><path d="M32 30c-9 0-17 10-17 17 0 6 5 8 10 8 3 0 5-1 7-1s4 1 7 1c5 0 10-2 10-8 0-7-8-17-17-17z"/></svg>'; }
