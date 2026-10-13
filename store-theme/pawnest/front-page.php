<?php
get_header();
$pic = function ($sku) { $id = wc_get_product_id_by_sku($sku); $p = $id ? wc_get_product($id) : null; return $p ? wp_get_attachment_image_url($p->get_image_id(), 'large') : ''; };
$shop = wc_get_page_permalink('shop');
$cats = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => true, 'exclude' => [get_option('default_product_cat')]]);
?>
<section class="hero"><div class="wrap">
  <div>
    <span class="eyebrow">New this week</span>
    <h1>Everything your <em>cat</em> &amp; <em>dog</em> will love</h1>
    <p>Comfy beds, tasty food, toys that survive playtime and the little things in between. Picked for happy pets and the people who adore them.</p>
    <div class="btns"><a class="btn" href="<?php echo esc_url($shop . '?product_cat=dog-food,dog-toys,dog-beds,dog-gear'); ?>">Shop for dogs</a><a class="btn alt" href="<?php echo esc_url($shop . '?product_cat=cat-food,cat-toys,cat-care,cat-furniture'); ?>">Shop for cats</a></div>
  </div>
  <div class="hero-art">
    <div class="pic a"><img src="<?php echo esc_url($pic('DOG-104')); ?>" alt=""></div>
    <div class="pic b"><img src="<?php echo esc_url($pic('CAT-205')); ?>" alt=""></div>
    <div class="pic c"><img src="<?php echo esc_url($pic('DOG-210')); ?>" alt=""></div>
  </div>
</div></section>
<div class="wrap">
  <div class="perks">
    <div class="perk"><i>₹</i><div><b>Free delivery</b><span>On orders over ₹999</span></div></div>
    <div class="perk"><i>✓</i><div><b>Pet-safe picks</b><span>Chosen by pet people</span></div></div>
    <div class="perk"><i>↺</i><div><b>Easy returns</b><span>Changed your mind? No stress</span></div></div>
  </div>
  <section class="block"><h2>Shop by category</h2><p class="sub">Find the right thing for your furry friend.</p>
    <div class="tiles">
      <?php foreach ($cats as $c) { $ps = wc_get_products(['category' => [$c->slug], 'limit' => 1]); $img = $ps ? wp_get_attachment_image_url($ps[0]->get_image_id(), 'medium_large') : ''; ?>
        <a class="tile" href="<?php echo esc_url(get_term_link($c)); ?>"><div class="im"><?php if ($img) echo '<img src="' . esc_url($img) . '" alt="">'; ?></div><div class="tx"><h3><?php echo esc_html($c->name); ?></h3><span><?php echo (int) $c->count; ?> product<?php echo $c->count == 1 ? "" : "s"; ?></span></div></a>
      <?php } ?>
    </div>
  </section>
  <section class="block"><h2>Fresh arrivals</h2><p class="sub">The newest things on our shelves.</p><?php echo do_shortcode('[products limit="8" columns="4" orderby="date" order="DESC"]'); ?></section>
  <div class="banner"><div><h2>Treats for good boys and girls</h2><p>Dental chews, toys and snacks they will go wild for.</p></div><a class="btn" href="<?php echo esc_url($shop); ?>">Browse everything</a></div>
</div>
<?php get_footer();
