
<?php
if (!defined('ABSPATH')) {
    exit;
}

class CODVerifierOTP {
    
    public function __construct() {
        add_action('wp_ajax_cod_send_otp', array($this, 'send_otp'));
        add_action('wp_ajax_nopriv_cod_send_otp', array($this, 'send_otp'));
        add_action('wp_ajax_cod_verify_otp', array($this, 'verify_otp'));
        add_action('wp_ajax_nopriv_cod_verify_otp', array($this, 'verify_otp'));
    }
    
    public function send_otp() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'cod_verifier_nonce')) {
            wp_send_json_error(__('Security check failed.', 'cod-verifier'));
            return;
        }
        
        $phone = sanitize_text_field($_POST['phone']);
        
        // Validate phone number
        if (empty($phone) || !preg_match('/^[6-9]\d{9}$/', $phone)) {
            wp_send_json_error(__('Please enter a valid 10-digit mobile number starting with 6-9.', 'cod-verifier'));
            return;
        }
        
        // Generate OTP
        $otp = sprintf('%06d', mt_rand(100000, 999999));
        
        // Start session
        if (!session_id()) {
            session_start();
        }
        
        // Store OTP in session
        $_SESSION['cod_otp'] = $otp;
        $_SESSION['cod_otp_phone'] = $phone;
        $_SESSION['cod_otp_time'] = time();
        $_SESSION['cod_otp_verified'] = false;
        
        $test_mode = get_option('cod_verifier_test_mode', '1');
        
        if ($test_mode === '1') {
            // Test mode - return OTP in response
            wp_send_json_success(array(
                'message' => __('OTP sent successfully (Test Mode)', 'cod-verifier'),
                'otp' => $otp,
                'test_mode' => true
            ));
        } else {
            // Production mode - send SMS
            $result = $this->send_sms($phone, $otp);
            if ($result['success']) {
                wp_send_json_success(array(
                    'message' => __('OTP sent to your mobile number', 'cod-verifier'),
                    'test_mode' => false
                ));
            } else {
                wp_send_json_error($result['message']);
            }
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
        
        // Get stored OTP data
        $stored_otp = isset($_SESSION['cod_otp']) ? $_SESSION['cod_otp'] : '';
        $otp_time = isset($_SESSION['cod_otp_time']) ? $_SESSION['cod_otp_time'] : 0;
        
        // Validate OTP
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
        
        // Check if OTP matches
        if ($otp !== $stored_otp) {
            wp_send_json_error(__('Invalid OTP. Please try again.', 'cod-verifier'));
            return;
        }
        
        // OTP verified successfully
        $_SESSION['cod_otp_verified'] = true;
        wp_send_json_success(__('OTP verified successfully!', 'cod-verifier'));
    }
    
    private function send_sms($phone, $otp) {
        $api_key = get_option('cod_verifier_fast2sms_api_key', '');
        
        if (empty($api_key)) {
            return array(
                'success' => false, 
                'message' => __('SMS service not configured. Please add Fast2SMS API key in settings.', 'cod-verifier')
            );
        }
        
        $message = "Your COD verification OTP is: " . $otp . ". Valid for 5 minutes.";
        
        $response = wp_remote_post('https://www.fast2sms.com/dev/bulkV2', array(
            'body' => array(
                'authorization' => $api_key,
                'sender_id' => 'FSTSMS',
                'message' => $message,
                'language' => 'english',
                'route' => 'q',
                'numbers' => $phone,
            ),
            'timeout' => 30,
            'headers' => array(
                'Content-Type' => 'application/x-www-form-urlencoded'
            )
        ));
        
        if (is_wp_error($response)) {
            return array(
                'success' => false, 
                'message' => __('Failed to send SMS: ', 'cod-verifier') . $response->get_error_message()
            );
        }
        
        $body = wp_remote_retrieve_body($response);
        $result = json_decode($body, true);
        
        if (isset($result['return']) && $result['return'] === true) {
            return array('success' => true, 'message' => __('OTP sent successfully', 'cod-verifier'));
        } else {
            return array(
                'success' => false, 
                'message' => __('Failed to send OTP. Please check your Fast2SMS configuration.', 'cod-verifier')
            );
        }
    }
}

new CODVerifierOTP();
