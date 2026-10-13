<!doctype html><html <?php language_attributes(); ?>><head><meta charset="<?php bloginfo('charset'); ?>"><meta name="viewport" content="width=device-width, initial-scale=1"><?php wp_head(); ?></head><body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<div class="topbar">Free delivery on orders over ₹999 &nbsp;·&nbsp; Fresh stock every week</div>
<header class="site-header"><div class="wrap">
  <a class="brand" href="<?php echo esc_url(home_url('/')); ?>"><?php echo pawnest_paw(); ?>PawNest</a>
  <nav class="main-nav">
    <a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>">Shop all</a>
    <a href="<?php echo esc_url(wc_get_page_permalink('shop') . '?product_cat=dog-food,dog-toys,dog-beds,dog-gear'); ?>">Dogs</a>
    <a href="<?php echo esc_url(wc_get_page_permalink('shop') . '?product_cat=cat-food,cat-toys,cat-care,cat-furniture'); ?>">Cats</a>
  </nav>
  <a class="cart-link" href="<?php echo esc_url(wc_get_cart_url()); ?>">Cart <b><?php echo WC()->cart ? (int) WC()->cart->get_cart_contents_count() : 0; ?></b></a>
</div></header>
