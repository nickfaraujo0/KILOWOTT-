<?php
// LOCAL DEV ONLY. WooCommerce accepts API keys only over SSL. This marks the request as SSL just while
// WooCommerce authenticates (determine_current_user, priority 15), then removes it so generated URLs stay http.
add_filter('determine_current_user', function ($u) { $_SERVER['HTTPS'] = 'on'; return $u; }, 1);
add_filter('determine_current_user', function ($u) { unset($_SERVER['HTTPS']); return $u; }, 99);
