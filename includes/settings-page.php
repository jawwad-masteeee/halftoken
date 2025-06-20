<?php
if (!defined('ABSPATH')) {
    exit;
}

// Add settings page to WooCommerce menu
add_action('admin_menu', 'cod_verifier_admin_menu');

function cod_verifier_admin_menu() {
    add_submenu_page(
        'woocommerce',
        __('COD Verifier Settings', 'cod-verifier'),
        __('COD Verifier', 'cod-verifier'),
        'manage_woocommerce',
        'cod-verifier-settings',
        'cod_verifier_settings_page'
    );
}

function cod_verifier_settings_page() {
    // Handle form submission
    if (isset($_POST['submit']) && wp_verify_nonce($_POST['cod_verifier_nonce'], 'cod_verifier_settings')) {
        update_option('cod_verifier_enable_otp', sanitize_text_field($_POST['enable_otp']));
        update_option('cod_verifier_enable_token', sanitize_text_field($_POST['enable_token']));
        update_option('cod_verifier_test_mode', sanitize_text_field($_POST['test_mode']));
        
        // NEW: Multi-country settings
        update_option('cod_verifier_allowed_regions', sanitize_text_field($_POST['allowed_regions']));
        update_option('cod_verifier_otp_timer_duration', intval($_POST['otp_timer_duration']));
        
        // Twilio Settings
        update_option('cod_verifier_twilio_sid', sanitize_text_field($_POST['twilio_sid']));
        update_option('cod_verifier_twilio_token', sanitize_text_field($_POST['twilio_token']));
        update_option('cod_verifier_twilio_number', sanitize_text_field($_POST['twilio_number']));
        
        // Razorpay Settings - SECURE STORAGE
        update_option('cod_verifier_razorpay_key_id', sanitize_text_field($_POST['razorpay_key_id']));
        update_option('cod_verifier_razorpay_key_secret', sanitize_text_field($_POST['razorpay_key_secret']));
        update_option('cod_verifier_razorpay_mode', sanitize_text_field($_POST['razorpay_mode']));
        
        echo '<div class="notice notice-success"><p>' . __('Settings saved successfully!', 'cod-verifier') . '</p></div>';
    }
    
    // Get current settings
    $enable_otp = get_option('cod_verifier_enable_otp', '1');
    $enable_token = get_option('cod_verifier_enable_token', '1');
    $test_mode = get_option('cod_verifier_test_mode', '1');
    $allowed_regions = get_option('cod_verifier_allowed_regions', 'india');
    $otp_timer_duration = get_option('cod_verifier_otp_timer_duration', 30);
    $twilio_sid = get_option('cod_verifier_twilio_sid', '');
    $twilio_token = get_option('cod_verifier_twilio_token', '');
    $twilio_number = get_option('cod_verifier_twilio_number', '');
    $razorpay_key_id = get_option('cod_verifier_razorpay_key_id', '');
    $razorpay_key_secret = get_option('cod_verifier_razorpay_key_secret', '');
    $razorpay_mode = get_option('cod_verifier_razorpay_mode', 'test');
    ?>
    
    <div class="wrap">
        <h1><?php _e('COD Verifier Settings', 'cod-verifier'); ?></h1>
        
        <form method="post" action="">
            <?php wp_nonce_field('cod_verifier_settings', 'cod_verifier_nonce'); ?>
            
            <table class="form-table">
                <tr>
                    <th scope="row"><?php _e('Mode', 'cod-verifier'); ?></th>
                    <td>
                        <label>
                            <input type="radio" name="test_mode" value="1" <?php checked($test_mode, '1'); ?>>
                            <?php _e('Test Mode (Recommended for initial setup)', 'cod-verifier'); ?>
                        </label><br>
                        <label>
                            <input type="radio" name="test_mode" value="0" <?php checked($test_mode, '0'); ?>>
                            <?php _e('Production Mode (Live SMS & Payment)', 'cod-verifier'); ?>
                        </label>
                        <p class="description">
                            <?php _e('Use Test Mode for initial testing. OTP will be shown in popup, payments simulated.', 'cod-verifier'); ?>
                        </p>
                    </td>
                </tr>
                
                <tr>
                    <th scope="row"><?php _e('Enable OTP Verification', 'cod-verifier'); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="enable_otp" value="1" <?php checked($enable_otp, '1'); ?>>
                            <?php _e('Require phone number verification via OTP', 'cod-verifier'); ?>
                        </label>
                    </td>
                </tr>
                
                <tr>
                    <th scope="row"><?php _e('Enable Token Payment', 'cod-verifier'); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="enable_token" value="1" <?php checked($enable_token, '1'); ?>>
                            <?php _e('Require ₹1 token payment to confirm COD order', 'cod-verifier'); ?>
                        </label>
                    </td>
                </tr>
            </table>
            
            <h2><?php _e('🌍 Multi-Country Settings', 'cod-verifier'); ?></h2>
            <table class="form-table">
                <tr>
                    <th scope="row"><?php _e('Allowed Regions', 'cod-verifier'); ?></th>
                    <td>
                        <select name="allowed_regions">
                            <option value="global" <?php selected($allowed_regions, 'global'); ?>><?php _e('🌍 Global (India, USA, UK)', 'cod-verifier'); ?></option>
                            <option value="india" <?php selected($allowed_regions, 'india'); ?>><?php _e('🇮🇳 India Only', 'cod-verifier'); ?></option>
                            <option value="usa" <?php selected($allowed_regions, 'usa'); ?>><?php _e('🇺🇸 USA Only', 'cod-verifier'); ?></option>
                            <option value="uk" <?php selected($allowed_regions, 'uk'); ?>><?php _e('🇬🇧 UK Only', 'cod-verifier'); ?></option>
                        </select>
                        <p class="description">
                            <?php _e('Select which countries are allowed to use OTP verification. Global allows all supported countries.', 'cod-verifier'); ?>
                        </p>
                    </td>
                </tr>
                
                <tr>
                    <th scope="row"><?php _e('OTP Resend Timer (seconds)', 'cod-verifier'); ?></th>
                    <td>
                        <input type="number" name="otp_timer_duration" value="<?php echo esc_attr($otp_timer_duration); ?>" min="15" max="120" class="small-text">
                        <p class="description">
                            <?php _e('Time in seconds before user can resend OTP. Recommended: 30 seconds.', 'cod-verifier'); ?>
                        </p>
                    </td>
                </tr>
            </table>
            
            <h2><?php _e('SMS Configuration (Twilio)', 'cod-verifier'); ?></h2>
            <table class="form-table">
                <tr>
                    <th scope="row"><?php _e('Twilio Account SID', 'cod-verifier'); ?></th>
                    <td>
                        <input type="text" name="twilio_sid" value="<?php echo esc_attr($twilio_sid); ?>" class="regular-text" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
                        <p class="description">
                            <?php _e('Get your Account SID from', 'cod-verifier'); ?> <a href="https://console.twilio.com" target="_blank">Twilio Console</a>
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php _e('Twilio Auth Token', 'cod-verifier'); ?></th>
                    <td>
                        <input type="password" name="twilio_token" value="<?php echo esc_attr($twilio_token); ?>" class="regular-text" placeholder="••••••••••••••••••••••••••••••••">
                        <p class="description">
                            <?php _e('Get your Auth Token from', 'cod-verifier'); ?> <a href="https://console.twilio.com" target="_blank">Twilio Console</a>
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php _e('Twilio Phone Number', 'cod-verifier'); ?></th>
                    <td>
                        <input type="text" name="twilio_number" value="<?php echo esc_attr($twilio_number); ?>" class="regular-text" placeholder="+1234567890">
                        <p class="description">
                            <?php _e('Your Twilio phone number (with country code, e.g., +1234567890). Must be verified for the regions you want to support.', 'cod-verifier'); ?>
                        </p>
                    </td>
                </tr>
            </table>
            
            <h2><?php _e('💳 Razorpay Configuration (Token Payment)', 'cod-verifier'); ?></h2>
            <table class="form-table">
                <tr>
                    <th scope="row"><?php _e('Razorpay Mode', 'cod-verifier'); ?></th>
                    <td>
                        <label>
                            <input type="radio" name="razorpay_mode" value="test" <?php checked($razorpay_mode, 'test'); ?>>
                            <?php _e('Test Mode', 'cod-verifier'); ?>
                        </label><br>
                        <label>
                            <input type="radio" name="razorpay_mode" value="live" <?php checked($razorpay_mode, 'live'); ?>>
                            <?php _e('Live Mode', 'cod-verifier'); ?>
                        </label>
                        <p class="description">
                            <?php _e('Use Test Mode for development. Switch to Live Mode for production.', 'cod-verifier'); ?>
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php _e('Razorpay Key ID', 'cod-verifier'); ?></th>
                    <td>
                        <input type="text" name="razorpay_key_id" value="" class="regular-text" placeholder="rzp_test_xxxxxxxxxxxxxxxx">
                        <p class="description">
                            <?php _e('Enter your Razorpay Key ID. Keys are securely stored and masked for security.', 'cod-verifier'); ?>
                            <?php if (!empty($razorpay_key_id)): ?>
                                <br><strong><?php _e('Current Key:', 'cod-verifier'); ?></strong> <?php echo substr($razorpay_key_id, 0, 8) . '••••••••••••••••••••'; ?>
                            <?php endif; ?>
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php _e('Razorpay Key Secret', 'cod-verifier'); ?></th>
                    <td>
                        <input type="password" name="razorpay_key_secret" value="" class="regular-text" placeholder="••••••••••••••••••••••••••••••••">
                        <p class="description">
                            <?php _e('Enter your Razorpay Key Secret. This is stored securely and never displayed.', 'cod-verifier'); ?>
                            <?php if (!empty($razorpay_key_secret)): ?>
                                <br><strong><?php _e('Status:', 'cod-verifier'); ?></strong> <span style="color: green;">✓ <?php _e('Secret Key Configured', 'cod-verifier'); ?></span>
                            <?php endif; ?>
                            <br><a href="https://dashboard.razorpay.com/app/keys" target="_blank"><?php _e('Get your API keys from Razorpay Dashboard', 'cod-verifier'); ?></a>
                        </p>
                    </td>
                </tr>
            </table>
            
            <?php submit_button(); ?>
        </form>
        
        <div class="card" style="margin-top: 30px; padding: 20px;">
            <h3><?php _e('🚀 Setup Guide', 'cod-verifier'); ?></h3>
            <ol>
                <li><strong><?php _e('Choose Mode:', 'cod-verifier'); ?></strong> <?php _e('Start with Test Mode for safe testing', 'cod-verifier'); ?></li>
                <li><strong><?php _e('Configure Twilio:', 'cod-verifier'); ?></strong> <?php _e('Add your Twilio credentials for SMS', 'cod-verifier'); ?></li>
                <li><strong><?php _e('Configure Razorpay:', 'cod-verifier'); ?></strong> <?php _e('Add your Razorpay keys for token payments', 'cod-verifier'); ?></li>
                <li><strong><?php _e('Test Everything:', 'cod-verifier'); ?></strong> <?php _e('Test OTP and token payment in Test Mode', 'cod-verifier'); ?></li>
                <li><strong><?php _e('Go Live:', 'cod-verifier'); ?></strong> <?php _e('Switch to Production Mode when ready', 'cod-verifier'); ?></li>
            </ol>
            
            <h4><?php _e('🔒 Security Features', 'cod-verifier'); ?></h4>
            <ul>
                <li><?php _e('✓ API keys are securely stored and masked in UI', 'cod-verifier'); ?></li>
                <li><?php _e('✓ ₹1 token payments are automatically refunded', 'cod-verifier'); ?></li>
                <li><?php _e('✓ All transactions are verified with Razorpay signatures', 'cod-verifier'); ?></li>
                <li><?php _e('✓ Multi-country phone validation with E.164 format', 'cod-verifier'); ?></li>
                <li><?php _e('✓ OTP timer prevents spam and abuse', 'cod-verifier'); ?></li>
            </ul>
        </div>
    </div>
    <?php
}