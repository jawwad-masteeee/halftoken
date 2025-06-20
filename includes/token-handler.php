
<?php
if (!defined('ABSPATH')) exit;

// AJAX handler for creating Razorpay order
function cod_verifier_create_razorpay_order() {
    try {
        // Verify nonce
        if (!wp_verify_nonce($_POST['security'], 'cod_verifier_token_nonce')) {
            wp_send_json_error(array('message' => __('Security check failed.', 'cod-verifier')), 403);
            return;
        }
        
        $razorpay_key = get_option('cod_verifier_razorpay_key', '');
        $razorpay_secret = get_option('cod_verifier_razorpay_secret', '');
        
        if (empty($razorpay_key) || empty($razorpay_secret)) {
            wp_send_json_error(array('message' => __('Razorpay not configured properly.', 'cod-verifier')));
            return;
        }
        
        // Create Razorpay order
        $order_data = array(
            'amount' => 100, // ₹1 in paise
            'currency' => 'INR',
            'receipt' => 'cod_token_' . time(),
            'notes' => array(
                'purpose' => 'COD Token Payment'
            )
        );
        
        $order = cod_verifier_create_razorpay_order_api($order_data);
        
        if ($order['success']) {
            wp_send_json_success(array(
                'order_id' => $order['data']['id'],
                'amount' => $order['data']['amount'],
                'currency' => $order['data']['currency'],
                'key' => $razorpay_key
            ));
        } else {
            wp_send_json_error(array('message' => $order['message']));
        }
    } catch (Exception $e) {
        wp_send_json_error(array('message' => __('Failed to create payment order.', 'cod-verifier')));
    }
}
add_action('wp_ajax_cod_verifier_create_razorpay_order', 'cod_verifier_create_razorpay_order');
add_action('wp_ajax_nopriv_cod_verifier_create_razorpay_order', 'cod_verifier_create_razorpay_order');

// AJAX handler for verifying Razorpay payment
function cod_verifier_verify_razorpay_payment() {
    try {
        // Verify nonce
        if (!wp_verify_nonce($_POST['security'], 'cod_verifier_token_nonce')) {
            wp_send_json_error(array('message' => __('Security check failed.', 'cod-verifier')), 403);
            return;
        }
        
        $payment_id = isset($_POST['payment_id']) ? sanitize_text_field($_POST['payment_id']) : '';
        $order_id = isset($_POST['order_id']) ? sanitize_text_field($_POST['order_id']) : '';
        $signature = isset($_POST['signature']) ? sanitize_text_field($_POST['signature']) : '';
        
        if (empty($payment_id) || empty($order_id) || empty($signature)) {
            wp_send_json_error(array('message' => __('Payment verification failed. Missing parameters.', 'cod-verifier')));
            return;
        }
        
        // Verify signature
        $razorpay_secret = get_option('cod_verifier_razorpay_secret', '');
        $expected_signature = hash_hmac('sha256', $order_id . '|' . $payment_id, $razorpay_secret);
        
        if ($signature !== $expected_signature) {
            wp_send_json_error(array('message' => __('Payment verification failed. Invalid signature.', 'cod-verifier')));
            return;
        }
        
        // Payment verified successfully
        if (!session_id()) {
            session_start();
        }
        
        $_SESSION['cod_verifier_token_paid'] = true;
        $_SESSION['cod_verifier_payment_id'] = $payment_id;
        
        wp_send_json_success(array(
            'message' => __('Token payment verified successfully!', 'cod-verifier')
        ));
    } catch (Exception $e) {
        wp_send_json_error(array('message' => __('Payment verification failed.', 'cod-verifier')));
    }
}
add_action('wp_ajax_cod_verifier_verify_razorpay_payment', 'cod_verifier_verify_razorpay_payment');
add_action('wp_ajax_nopriv_cod_verifier_verify_razorpay_payment', 'cod_verifier_verify_razorpay_payment');

// Create Razorpay order via API
function cod_verifier_create_razorpay_order_api($order_data) {
    $razorpay_key = get_option('cod_verifier_razorpay_key', '');
    $razorpay_secret = get_option('cod_verifier_razorpay_secret', '');
    
    $url = 'https://api.razorpay.com/v1/orders';
    
    $response = wp_remote_post($url, array(
        'body' => json_encode($order_data),
        'headers' => array(
            'Content-Type' => 'application/json',
            'Authorization' => 'Basic ' . base64_encode($razorpay_key . ':' . $razorpay_secret)
        ),
        'timeout' => 30
    ));
    
    if (is_wp_error($response)) {
        return array('success' => false, 'message' => __('Failed to create payment order.', 'cod-verifier'));
    }
    
    $body = wp_remote_retrieve_body($response);
    $result = json_decode($body, true);
    
    if (isset($result['id'])) {
        return array('success' => true, 'data' => $result);
    } else {
        return array('success' => false, 'message' => __('Failed to create payment order.', 'cod-verifier'));
    }
}

// Validate token payment during checkout
function cod_verifier_validate_token_checkout() {
    // Only validate for COD payment method
    $chosen_payment = WC()->session ? WC()->session->get('chosen_payment_method') : '';
    if ($chosen_payment !== 'cod') {
        return;
    }
    
    $enable_token = get_option('cod_verifier_enable_token', '0');
    if ($enable_token !== '1') return;
    
    if (!session_id()) {
        session_start();
    }
    
    $token_paid = isset($_SESSION['cod_verifier_token_paid']) ? $_SESSION['cod_verifier_token_paid'] : false;
    $token_confirmed = isset($_POST['cod_token_paid']) ? sanitize_text_field($_POST['cod_token_paid']) : '';
    
    if (!$token_paid || empty($token_confirmed)) {
        wc_add_notice(__('Please complete the ₹1 token payment to place a COD order.', 'cod-verifier'), 'error');
        return;
    }
}
add_action('woocommerce_checkout_process', 'cod_verifier_validate_token_checkout');

// Clear token session after successful order
function cod_verifier_clear_token_session($order_id) {
    if (!session_id()) {
        session_start();
    }
    
    unset($_SESSION['cod_verifier_token_paid']);
    unset($_SESSION['cod_verifier_payment_id']);
}
add_action('woocommerce_thankyou', 'cod_verifier_clear_token_session');
