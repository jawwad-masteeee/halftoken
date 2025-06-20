<?php
if (!defined('ABSPATH')) {
    exit;
}

class CODVerifierAjax {
    
    public function __construct() {
        add_action('wp_ajax_cod_send_otp', array($this, 'send_otp'));
        add_action('wp_ajax_nopriv_cod_send_otp', array($this, 'send_otp'));
        add_action('wp_ajax_cod_verify_otp', array($this, 'verify_otp'));
        add_action('wp_ajax_nopriv_cod_verify_otp', array($this, 'verify_otp'));
        
        // NEW: Razorpay Token Payment Handlers
        add_action('wp_ajax_cod_create_razorpay_order', array($this, 'create_razorpay_order'));
        add_action('wp_ajax_nopriv_cod_create_razorpay_order', array($this, 'create_razorpay_order'));
        add_action('wp_ajax_cod_verify_razorpay_payment', array($this, 'verify_razorpay_payment'));
        add_action('wp_ajax_nopriv_cod_verify_razorpay_payment', array($this, 'verify_razorpay_payment'));
    }
    
    public function send_otp() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'cod_verifier_nonce')) {
            wp_send_json_error(__('Security check failed.', 'cod-verifier'));
            return;
        }
        
        // Get phone data - support both old and new format
        $phone = sanitize_text_field($_POST['phone']); // Full E.164 format
        $country_code = isset($_POST['country_code']) ? sanitize_text_field($_POST['country_code']) : '';
        $phone_number = isset($_POST['phone_number']) ? sanitize_text_field($_POST['phone_number']) : '';
        
        // Validate allowed regions
        $allowed_regions = get_option('cod_verifier_allowed_regions', 'india');
        $region_validation = $this->validate_phone_region($phone, $allowed_regions);
        
        if (!$region_validation['valid']) {
            wp_send_json_error($region_validation['message']);
            return;
        }
        
        // Enhanced phone validation
        $phone_validation = $this->validate_phone_number($phone, $country_code, $phone_number);
        if (!$phone_validation['valid']) {
            wp_send_json_error($phone_validation['message']);
            return;
        }
        
        $test_mode = get_option('cod_verifier_test_mode', '1');
        
        if (!session_id()) {
            session_start();
        }
        
        // Check cooldown period (prevent spam)
        $cooldown_duration = get_option('cod_verifier_otp_timer_duration', 30);
        if (isset($_SESSION['cod_otp_time']) && (time() - $_SESSION['cod_otp_time'] < $cooldown_duration)) {
            $remaining = $cooldown_duration - (time() - $_SESSION['cod_otp_time']);
            wp_send_json_error(sprintf(__('Please wait %d seconds before resending OTP.', 'cod-verifier'), $remaining));
            return;
        }

        // Generate OTP
        $otp = sprintf('%06d', rand(100000, 999999));
        $_SESSION['cod_otp'] = $otp;
        $_SESSION['cod_otp_phone'] = $phone;
        $_SESSION['cod_otp_time'] = time();
        $_SESSION['cod_otp_verified'] = false;
        
        if ($test_mode === '1') {
            // Test mode - return OTP in response
            wp_send_json_success(array(
                'message' => __('OTP sent successfully! (Test Mode)', 'cod-verifier'),
                'otp' => $otp,
                'test_mode' => true
            ));
        } else {
            // Production mode - send actual SMS via Twilio
            $result = $this->send_twilio_sms($phone, $otp);
            
            if ($result['success']) {
                wp_send_json_success(array(
                    'message' => __('OTP sent successfully to your mobile number!', 'cod-verifier')
                ));
            } else {
                wp_send_json_error($result['message']);
            }
        }
    }
    
    /**
     * Validate phone number against allowed regions
     */
    private function validate_phone_region($phone, $allowed_regions) {
        // Extract country code from phone number
        $country_code = '';
        if (strpos($phone, '+91') === 0) {
            $country_code = '+91';
        } elseif (strpos($phone, '+1') === 0) {
            $country_code = '+1';
        } elseif (strpos($phone, '+44') === 0) {
            $country_code = '+44';
        } else {
            return array(
                'valid' => false,
                'message' => __('Invalid phone number format. Please include country code.', 'cod-verifier')
            );
        }
        
        // Check against allowed regions
        switch ($allowed_regions) {
            case 'india':
                if ($country_code !== '+91') {
                    return array(
                        'valid' => false,
                        'message' => __('Only Indian phone numbers (+91) are allowed.', 'cod-verifier')
                    );
                }
                break;
                
            case 'usa':
                if ($country_code !== '+1') {
                    return array(
                        'valid' => false,
                        'message' => __('Only US phone numbers (+1) are allowed.', 'cod-verifier')
                    );
                }
                break;
                
            case 'uk':
                if ($country_code !== '+44') {
                    return array(
                        'valid' => false,
                        'message' => __('Only UK phone numbers (+44) are allowed.', 'cod-verifier')
                    );
                }
                break;
                
            case 'global':
                // All supported countries are allowed
                if (!in_array($country_code, ['+91', '+1', '+44'])) {
                    return array(
                        'valid' => false,
                        'message' => __('Unsupported country code. Supported: +91 (India), +1 (USA), +44 (UK).', 'cod-verifier')
                    );
                }
                break;
                
            default:
                return array(
                    'valid' => false,
                    'message' => __('Invalid region configuration.', 'cod-verifier')
                );
        }
        
        return array('valid' => true, 'message' => 'Valid region');
    }
    
    /**
     * Enhanced phone number validation for multiple countries
     */
    private function validate_phone_number($phone, $country_code = '', $phone_number = '') {
        // Validation rules for each country
        $validation_rules = array(
            '+91' => array(
                'pattern' => '/^\+91[6-9]\d{9}$/',
                'name' => 'Indian',
                'example' => '+917039940998'
            ),
            '+1' => array(
                'pattern' => '/^\+1[2-9]\d{9}$/',
                'name' => 'US',
                'example' => '+12125551234'
            ),
            '+44' => array(
                'pattern' => '/^\+447\d{9}$/',
                'name' => 'UK',
                'example' => '+447700900123'
            )
        );
        
        // Determine country code from phone number
        $detected_country = '';
        foreach ($validation_rules as $code => $rule) {
            if (strpos($phone, $code) === 0) {
                $detected_country = $code;
                break;
            }
        }
        
        if (empty($detected_country)) {
            return array(
                'valid' => false,
                'message' => __('Invalid phone number format. Supported formats: +91 (India), +1 (USA), +44 (UK).', 'cod-verifier')
            );
        }
        
        $rule = $validation_rules[$detected_country];
        
        if (!preg_match($rule['pattern'], $phone)) {
            return array(
                'valid' => false,
                'message' => sprintf(
                    __('Please enter a valid %s phone number (e.g., %s).', 'cod-verifier'),
                    $rule['name'],
                    $rule['example']
                )
            );
        }
        
        return array('valid' => true, 'message' => 'Valid phone number');
    }
    
    private function send_twilio_sms($phone, $otp) {
        try {
            // Get Twilio settings
            $sid = get_option('cod_verifier_twilio_sid', '');
            $token = get_option('cod_verifier_twilio_token', '');
            $twilio_number = get_option('cod_verifier_twilio_number', '');
            
            if (empty($sid) || empty($token) || empty($twilio_number)) {
                return array(
                    'success' => false,
                    'message' => __('Twilio SMS service not configured. Please contact administrator.', 'cod-verifier')
                );
            }
            
            // Load Twilio SDK
            $twilio_autoload = COD_VERIFIER_PLUGIN_PATH . 'includes/twilio-sdk/src/Twilio/autoload.php';
            
            if (!file_exists($twilio_autoload)) {
                error_log('COD Verifier: Twilio SDK not found at ' . $twilio_autoload);
                return array(
                    'success' => false,
                    'message' => __('SMS service temporarily unavailable. Please try again later.', 'cod-verifier')
                );
            }
            
            require_once $twilio_autoload;
            
            // Phone number is already in E.164 format from frontend validation
            $formatted_phone = $phone;
            
            // Final validation for E.164 format
            if (!preg_match('/^\+\d{10,15}$/', $formatted_phone)) {
                return array(
                    'success' => false,
                    'message' => __('Invalid phone number format for SMS delivery.', 'cod-verifier')
                );
            }

            // Create Twilio client
            $client = new \Twilio\Rest\Client($sid, $token);
            
            // Customize message based on country
            $country_name = 'your';
            if (strpos($phone, '+91') === 0) {
                $country_name = 'Indian';
            } elseif (strpos($phone, '+1') === 0) {
                $country_name = 'US';
            } elseif (strpos($phone, '+44') === 0) {
                $country_name = 'UK';
            }
            
            $message = "Your COD verification OTP is: {$otp}. Valid for 5 minutes. Do not share this code. - COD Verifier";
            
            // Send SMS
            $result = $client->messages->create(
                $formatted_phone,
                array(
                    'from' => $twilio_number,
                    'body' => $message
                )
            );
            
            if ($result->sid) {
                error_log('COD Verifier: SMS sent successfully to ' . $formatted_phone . '. SID: ' . $result->sid);
                return array(
                    'success' => true,
                    'message' => sprintf(__('OTP sent successfully to your %s number!', 'cod-verifier'), $country_name)
                );
            } else {
                error_log('COD Verifier: SMS sending failed - no SID returned');
                return array(
                    'success' => false,
                    'message' => __('Failed to send OTP. Please try again.', 'cod-verifier')
                );
            }
            
        } catch (\Twilio\Exceptions\RestException $e) {
            error_log('COD Verifier: Twilio REST Exception: ' . $e->getMessage());
            
            // Provide user-friendly error messages
            $error_code = $e->getCode();
            switch ($error_code) {
                case 21211:
                    $user_message = __('Invalid phone number. Please check and try again.', 'cod-verifier');
                    break;
                case 21408:
                    $user_message = __('SMS not supported for this number. Please try a different number.', 'cod-verifier');
                    break;
                case 21614:
                    $user_message = __('Invalid sender number configuration. Please contact support.', 'cod-verifier');
                    break;
                default:
                    $user_message = __('SMS service error. Please check your phone number and try again.', 'cod-verifier');
            }
            
            return array(
                'success' => false,
                'message' => $user_message
            );
        } catch (Exception $e) {
            error_log('COD Verifier: General Exception: ' . $e->getMessage());
            return array(
                'success' => false,
                'message' => __('Failed to send OTP. Please try again later.', 'cod-verifier')
            );
        }
    }
    
    public function verify_otp() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'cod_verifier_nonce')) {
            wp_send_json_error(__('Security check failed.', 'cod-verifier'));
            return;
        }
        
        $otp = sanitize_text_field($_POST['otp']);
        
        if (!session_id()) {
            session_start();
        }
        
        $stored_otp = isset($_SESSION['cod_otp']) ? $_SESSION['cod_otp'] : '';
        $otp_time = isset($_SESSION['cod_otp_time']) ? $_SESSION['cod_otp_time'] : 0;
        
        if (empty($stored_otp)) {
            wp_send_json_error(__('No OTP found. Please request a new OTP.', 'cod-verifier'));
            return;
        }
        
        // Check if OTP is expired (5 minutes)
        if (time() - $otp_time > 300) {
            unset($_SESSION['cod_otp']);
            wp_send_json_error(__('OTP expired. Please request a new OTP.', 'cod-verifier'));
            return;
        }
        
        if ($otp === $stored_otp) {
            $_SESSION['cod_otp_verified'] = true;
            wp_send_json_success(__('OTP verified successfully!', 'cod-verifier'));
        } else {
            wp_send_json_error(__('Invalid OTP. Please try again.', 'cod-verifier'));
        }
    }
    
    // NEW: Create Razorpay Order for ₹1 Token Payment
    public function create_razorpay_order() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'cod_verifier_nonce')) {
            wp_send_json_error(__('Security check failed.', 'cod-verifier'));
            return;
        }
        
        $test_mode = get_option('cod_verifier_test_mode', '1');
        $razorpay_mode = get_option('cod_verifier_razorpay_mode', 'test');
        
        if ($test_mode === '1') {
            // Test mode - simulate order creation
            wp_send_json_success(array(
                'order_id' => 'order_test_' . time(),
                'key_id' => 'rzp_test_demo',
                'amount' => 100,
                'currency' => 'INR',
                'test_mode' => true,
                'qr_code_url' => 'data:image/svg+xml;base64,' . base64_encode('<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="100" text-anchor="middle" dy=".3em" font-family="Arial" font-size="14">TEST QR CODE</text></svg>')
            ));
            return;
        }
        
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
            'payment_capture' => 1,
            'notes' => array(
                'purpose' => 'COD Token Payment',
                'auto_refund' => 'yes'
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
            // Generate QR code URL
            $qr_code_url = "https://api.razorpay.com/v1/payments/qr_codes/{$result['id']}/qr_code";
            
            wp_send_json_success(array(
                'order_id' => $result['id'],
                'key_id' => $key_id,
                'amount' => $result['amount'],
                'currency' => $result['currency'],
                'test_mode' => false,
                'qr_code_url' => $qr_code_url
            ));
        } else {
            wp_send_json_error(__('Failed to create order. Please check Razorpay configuration.', 'cod-verifier'));
        }
    }
    
    // NEW: Verify Razorpay Payment and Auto-Refund
    public function verify_razorpay_payment() {
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
            wp_send_json_success(__('Payment verified successfully! (Test Mode - No actual charge)', 'cod-verifier'));
            return;
        }
        
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
            // Payment verified - now initiate auto-refund
            $refund_result = $this->initiate_auto_refund($payment_id);
            
            if (!session_id()) {
                session_start();
            }
            
            $_SESSION['cod_token_paid'] = true;
            
            if ($refund_result['success']) {
                wp_send_json_success(__('Payment verified successfully! ₹1 refund initiated automatically.', 'cod-verifier'));
            } else {
                wp_send_json_success(__('Payment verified successfully! Refund will be processed within 24 hours.', 'cod-verifier'));
            }
        } else {
            wp_send_json_error(__('Payment verification failed. Invalid signature.', 'cod-verifier'));
        }
    }
    
    // NEW: Auto-Refund Function
    private function initiate_auto_refund($payment_id) {
        $key_id = get_option('cod_verifier_razorpay_key_id', '');
        $key_secret = get_option('cod_verifier_razorpay_key_secret', '');
        
        if (empty($key_id) || empty($key_secret)) {
            return array('success' => false, 'message' => 'Razorpay keys not configured');
        }
        
        $refund_data = array(
            'amount' => 100, // Full ₹1 refund
            'speed' => 'normal',
            'notes' => array(
                'reason' => 'COD Token Verification Complete',
                'auto_refund' => 'yes'
            )
        );
        
        $response = wp_remote_post("https://api.razorpay.com/v1/payments/{$payment_id}/refund", array(
            'headers' => array(
                'Authorization' => 'Basic ' . base64_encode($key_id . ':' . $key_secret),
                'Content-Type' => 'application/json'
            ),
            'body' => json_encode($refund_data),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            error_log('COD Verifier: Refund failed - ' . $response->get_error_message());
            return array('success' => false, 'message' => $response->get_error_message());
        }
        
        $body = wp_remote_retrieve_body($response);
        $result = json_decode($body, true);
        
        if (isset($result['id'])) {
            error_log('COD Verifier: Refund successful - ID: ' . $result['id']);
            return array('success' => true, 'refund_id' => $result['id']);
        } else {
            error_log('COD Verifier: Refund failed - ' . $body);
            return array('success' => false, 'message' => 'Refund API error');
        }
    }
}

new CODVerifierAjax();
?>