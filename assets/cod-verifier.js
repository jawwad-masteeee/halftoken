
jQuery(document).ready(function($) {
    'use strict';
    
    console.log('COD Verifier: Script loaded successfully');
    
    let otpVerified = false;
    let tokenPaid = false;
    
    // Listen for payment method changes
    $(document.body).on('change', 'input[name="payment_method"]', handlePaymentMethodChange);
    $(document.body).on('updated_checkout', handlePaymentMethodChange);
    
    // Initial check after page load
    setTimeout(handlePaymentMethodChange, 1000);
    
    function handlePaymentMethodChange() {
        const selectedMethod = $('input[name="payment_method"]:checked').val();
        console.log('Payment method selected:', selectedMethod);
        
        if (selectedMethod === 'cod') {
            $('#cod-verifier-wrapper').show();
            populatePhoneFromBilling();
        } else {
            $('#cod-verifier-wrapper').hide();
            resetVerificationStates();
        }
    }
    
    function populatePhoneFromBilling() {
        const billingPhone = $('#billing_phone').val();
        if (billingPhone && !$('#cod_phone').val()) {
            $('#cod_phone').val(billingPhone);
        }
    }
    
    function resetVerificationStates() {
        otpVerified = false;
        tokenPaid = false;
        $('#cod_otp').val('');
        $('#cod_phone').val('');
        $('#cod_token_paid').prop('checked', false);
        $('#cod_otp_message').text('');
        $('#cod_token_message').text('');
        $('#cod_verify_otp').prop('disabled', true).text('Verify OTP');
        $('#cod_pay_token').text('Pay ₹1 Token').css('background-color', '');
    }
    
    // Send OTP
    $(document).on('click', '#cod_send_otp', function(e) {
        e.preventDefault();
        
        const phone = $('#cod_phone').val().trim();
        const $btn = $(this);
        
        if (!phone) {
            showMessage('otp', 'Please enter your mobile number', 'error');
            return;
        }
        
        if (!/^[6-9]\d{9}$/.test(phone)) {
            showMessage('otp', 'Please enter a valid 10-digit mobile number starting with 6-9', 'error');
            return;
        }
        
        $btn.prop('disabled', true).text('Sending...');
        
        $.ajax({
            url: cod_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'cod_send_otp',
                phone: phone,
                nonce: cod_ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    showMessage('otp', response.data.message, 'success');
                    // Show OTP in test mode
                    if (response.data.otp) {
                        alert('TEST MODE - Your OTP is: ' + response.data.otp);
                    }
                } else {
                    showMessage('otp', response.data, 'error');
                }
            },
            error: function() {
                showMessage('otp', 'Failed to send OTP. Please try again.', 'error');
            },
            complete: function(jqXHR, textStatus) {
                console.log('AJAX Complete. textStatus:', textStatus);
                console.log('AJAX Complete. responseJSON:', jqXHR.responseJSON);
                // Check if the AJAX request was successful (status 'success')
                // and if the response indicates success (response.success is true)
                if (textStatus === 'success' && jqXHR.responseJSON && jqXHR.responseJSON.success) {
                    console.log('Starting OTP timer...');
                    // Start the timer only on success
                    startOtpTimer(60, $btn); // 60 seconds timer
                } else {
                    console.log('AJAX not successful, not starting timer.');
                    // Re-enable button and reset text only on failure
                    $btn.prop('disabled', false).text('Send OTP');
                }
            }
        });
    });

    // Timer function for OTP resend
    function startOtpTimer(duration, $btn) {
        let timer = duration;
        const originalButtonText = $btn.text();
        $btn.addClass('cod-btn-timer-active');
        $btn.prop('disabled', true);
        
        const countdown = setInterval(() => {
            $btn.text(`Resend OTP in ${timer}s`);
            timer--;
            
            if (timer < 0) {
                clearInterval(countdown);
                $btn.removeClass('cod-btn-timer-active');
                $btn.prop('disabled', false);
                $btn.text(originalButtonText);
            }
        }, 1000);
    }
    
    // Enable verify button when OTP is entered
    $(document).on('input', '#cod_otp', function() {
        const otp = $(this).val().trim();
        $('#cod_verify_otp').prop('disabled', otp.length !== 6);
    });
    
    // Verify OTP
    $(document).on('click', '#cod_verify_otp', function(e) {
        e.preventDefault();
        
        const otp = $('#cod_otp').val().trim();
        const $btn = $(this);
        
        if (!otp || otp.length !== 6) {
            showMessage('otp', 'Please enter a valid 6-digit OTP', 'error');
            return;
        }
        
        $btn.prop('disabled', true).text('Verifying...');
        
        $.ajax({
            url: cod_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'cod_verify_otp',
                otp: otp,
                nonce: cod_ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    showMessage('otp', response.data, 'success');
                    otpVerified = true;
                    $btn.text('✓ Verified').css('background-color', '#28a745');
                } else {
                    showMessage('otp', response.data, 'error');
                    $btn.prop('disabled', false).text('Verify OTP');
                }
            },
            error: function() {
                showMessage('otp', 'Failed to verify OTP. Please try again.', 'error');
                $btn.prop('disabled', false).text('Verify OTP');
            }
        });
    });
    
    // Token Payment
    $(document).on('click', '#cod_pay_token', function(e) {
        e.preventDefault();
        
        const $btn = $(this);
        $btn.prop('disabled', true).text('Processing...');
        
        $.ajax({
            url: cod_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'cod_token_payment',
                nonce: cod_ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    showMessage('token', response.data, 'success');
                    tokenPaid = true;
                    $('#cod_token_paid').prop('checked', true);
                    $btn.text('✓ Payment Complete').css('background-color', '#28a745');
                } else {
                    showMessage('token', response.data, 'error');
                    $btn.prop('disabled', false).text('Pay ₹1 Token');
                }
            },
            error: function() {
                showMessage('token', 'Payment failed. Please try again.', 'error');
                $btn.prop('disabled', false).text('Pay ₹1 Token');
            }
        });
    });
    
    function showMessage(type, message, status) {
        const $messageElement = $('#cod_' + type + '_message');
        const color = status === 'success' ? '#28a745' : '#dc3545';
        $messageElement.text(message).css('color', color);
    }
    
    // Validate before placing order
    $(document).on('click', '#place_order', function(e) {
        const selectedMethod = $('input[name="payment_method"]:checked').val();
        
        if (selectedMethod === 'cod') {
            let errors = [];
            
            if (cod_ajax.enable_otp === '1' && !otpVerified) {
                errors.push('• Please verify your phone number with OTP');
            }
            
            if (cod_ajax.enable_token === '1' && !$('#cod_token_paid').is(':checked')) {
                errors.push('• Please complete the ₹1 token payment');
            }
            
            if (errors.length > 0) {
                e.preventDefault();
                const errorMessage = 'COD Verification Required:\n\n' + errors.join('\n');
                alert(errorMessage);
                
                // Scroll to verification section
                $('html, body').animate({
                    scrollTop: $('#cod-verifier-wrapper').offset().top - 100
                }, 500);
                
                return false;
            }
        }
    });
});
