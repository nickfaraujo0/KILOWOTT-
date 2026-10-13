<footer class="site-footer"><div class="wrap">
  <div class="cols">
    <div><div class="brand" style="color:#fff"><?php echo pawnest_paw(); ?>PawNest</div><p>Food, toys and comfy things for cats and dogs.</p></div>
    <div><h4>Shop</h4><a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>">All products</a><a href="<?php echo esc_url(wc_get_page_permalink('shop') . '?product_cat=dog-food,dog-toys,dog-beds,dog-gear'); ?>">Dogs</a><a href="<?php echo esc_url(wc_get_page_permalink('shop') . '?product_cat=cat-food,cat-toys,cat-care,cat-furniture'); ?>">Cats</a></div>
    <div><h4>Help</h4><a href="<?php echo esc_url(wc_get_cart_url()); ?>">Cart</a><a href="<?php echo esc_url(wc_get_page_permalink('myaccount')); ?>">My account</a></div>
  </div>
  <div class="fine">Demo store for the PawPIM catalog manager. Not a real shop; no orders are fulfilled.</div>
</div></footer>
<?php wp_footer(); ?></body></html>
