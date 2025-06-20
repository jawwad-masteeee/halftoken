
<?php
if (!defined('ABSPATH')) {
    exit;
}

class CODVerifierRazorpay {
    
    public function __construct() {
        add_action('wp_ajax_cod_create_order', array($this, 'create_order'));
        add_action('wp_ajax_nopriv_cod_create_order', array($this, 'create_order'));
        add_action('wp_ajax_cod_verify_payment', array($this, 'verify_payment'));
        add_action('wp_ajax_nopriv_cod_verify_payment', array($this, 'verify_payment'));
        add_action('wp_footer', array($this, 'add_razorpay_script'));
    }
    
    public function create_order() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'cod_verifier_nonce')) {
            wp_send_json_error(__('Security check failed.', 'cod-verifier'));
            return;
        }
        
        $test_mode = get_option('cod_verifier_test_mode', '1');
        
        if ($test_mode === '1') {
            // Test mode - simulate order creation
            wp_send_json_success(array(
                'order_id' => 'order_test_' . time(),
                'key_id' => 'rzp_test_demo',
                'amount' => 100,
                'currency' => 'INR',
                'test_mode' => true
            ));
        } else {
            // Production mode
            $key_id = get_option('cod_verifier_razorpay_key_id', '');
            $key_secret = get_option('cod_verifier_razorpay_key_secret', '');
            
            if (empty($key_id) || empty($key_secret)) {
                wp_send_json_error(__('Razorpay not configured. Please add API keys in settings.', 'cod-verifier'));
                return;
            }
            
            $order_data = array(
                'amount' => 100, // ₹1 in paise
                'currency' => 'INR',
                'receipt' => 'cod_token_' . time(),
                'notes' => array(
                    'purpose' => 'COD Token Payment'
                )
            );
            
            $response = wp_remote_post('https://api.razorpay.com/v1/orders', array(
                'headers' => array(
                    'Authorization' => 'Basic ' . base64_encode($key_id . ':' . $key_secret),
                    'Content-Type' => 'application/json'
                ),
                'body' => json_encode($order_data),
                'timeout' => 30
            ));
            
            if (is_wp_error($response)) {
                wp_send_json_error(__('Failed to create order: ', 'cod-verifier') . $response->get_error_message());
                return;
            }
            
            $body = wp_remote_retrieve_body($response);
            $result = json_decode($body, true);
            
            if (isset($result['id'])) {
                wp_send_json_success(array(
                    'order_id' => $result['id'],
                    'key_id' => $key_id,
                    'amount' => $result['amount'],
                    'currency' => $result['currency'],
                    'test_mode' => false
                ));
            } else {
                wp_send_json_error(__('Failed to create order. Please check Razorpay configuration.', 'cod-verifier'));
            }
        }
    }
    
    public function verify_payment() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'cod_verifier_nonce')) {
            wp_send_json_error(__('Security check failed.', 'cod-verifier'));
            return;
        }
        
        $test_mode = get_option('cod_verifier_test_mode', '1');
        
        if ($test_mode === '1' || isset($_POST['test_mode'])) {
            // Test mode - simulate payment verification
            if (!session_id()) {
                session_start();
            }
            
            $_SESSION['cod_token_paid'] = true;
            wp_send_json_success(__('Payment verified successfully (Test Mode)', 'cod-verifier'));
        } else {
            // Production mode
            $payment_id = sanitize_text_field($_POST['payment_id']);
            $order_id = sanitize_text_field($_POST['order_id']);
            $signature = sanitize_text_field($_POST['signature']);
            
            if (empty($payment_id) || empty($order_id) || empty($signature)) {
                wp_send_json_error(__('Payment verification failed. Missing parameters.', 'cod-verifier'));
                return;
            }
            
            $key_secret = get_option('cod_verifier_razorpay_key_secret', '');
            
            if (empty($key_secret)) {
                wp_send_json_error(__('Razorpay secret key not configured.', 'cod-verifier'));
                return;
            }
            
            // Verify signature
            $expected_signature = hash_hmac('sha256', $order_id . '|' . $payment_id, $key_secret);
            
            if ($signature === $expected_signature) {
                if (!session_id()) {
                    session_start();
                }
                
                $_SESSION['cod_token_paid'] = true;
                wp_send_json_success(__('Payment verified successfully!', 'cod-verifier'));
            } else {
                wp_send_json_error(__('Payment verification failed. Invalid signature.', 'cod-verifier'));
            }
        }
    }
    
    public function add_razorpay_script() {
        if (is_checkout()) {
            $test_mode = get_option('cod_verifier_test_mode', '1');
            if ($test_mode !== '1') {
                echo '<script src="https://checkout.razorpay.com/v1/checkout.js"></script>';
            }
        }
    }
}

new CODVerifierRazorpay();
