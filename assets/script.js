jQuery(document).ready(function($) {
    'use strict';
    
    console.log('COD Verifier: Multi-country script with Razorpay initialized');
    
    // Check if codVerifier is defined
    if (typeof codVerifier === 'undefined') {
        console.error('COD Verifier: codVerifier object not found.');
        return;
    }
    
    // Get settings from global variable
    const settings = window.codVerifierSettings || {
        allowedRegions: 'india',
        otpTimerDuration: 30,
        testMode: '1'
    };
    
    // Global verification state
    window.codVerifierStatus = {
      otpVerified: false,
      tokenVerified: false
    };
    
    let isBlockCheckout = $('.wc-block-checkout').length > 0;
    let verificationBoxCreated = false;
    let warningMessageCreated = false;
    let otpTimer = null;
    let tokenTimer = null; // NEW: Token payment timer
    
    console.log('COD Verifier: Checkout type:', isBlockCheckout ? 'Blocks' : 'Classic');
    console.log('COD Verifier: Settings:', settings);
    
    // ===== MULTI-COUNTRY PHONE VALIDATION =====
    
    const phoneValidationRules = {
        '+91': {
            name: 'India',
            pattern: /^[6-9]\d{9}$/,
            placeholder: 'Enter 10-digit number (e.g., 7039940998)',
            length: 10
        },
        '+1': {
            name: 'USA',
            pattern: /^[2-9]\d{9}$/,
            placeholder: 'Enter 10-digit number (e.g., 2125551234)',
            length: 10
        },
        '+44': {
            name: 'UK',
            pattern: /^7\d{9}$/,
            placeholder: 'Enter 10-digit number (e.g., 7700900123)',
            length: 10
        }
    };
    
    function validatePhoneNumber(countryCode, phoneNumber) {
        const rule = phoneValidationRules[countryCode];
        if (!rule) {
            return { valid: false, message: 'Unsupported country code' };
        }
        
        if (!phoneNumber || phoneNumber.length !== rule.length) {
            return { valid: false, message: `Please enter a ${rule.length}-digit ${rule.name} phone number` };
        }
        
        if (!rule.pattern.test(phoneNumber)) {
            return { valid: false, message: `Please enter a valid ${rule.name} phone number` };
        }
        
        return { valid: true, message: 'Valid phone number' };
    }
    
    function updatePhoneHelperText() {
        const countryCode = $('#cod_country_code').val();
        const rule = phoneValidationRules[countryCode];
        if (rule) {
            $('#cod_phone_help_text').text(rule.placeholder);
            $('#cod_phone').attr('placeholder', rule.placeholder.split('(e.g., ')[0].trim());
        }
    }
    
    // ===== OTP TIMER FUNCTIONALITY =====
    
    function startOTPTimer(duration) {
        const $btn = $('#cod_send_otp');
        let timeLeft = duration;
        
        // Disable button and change appearance
        $btn.prop('disabled', true)
            .addClass('cod-btn-timer-active')
            .removeClass('cod-btn-primary');
        
        // Update button text immediately
        updateTimerDisplay(timeLeft, $btn);
        
        // Start countdown
        otpTimer = setInterval(() => {
            timeLeft--;
            updateTimerDisplay(timeLeft, $btn);
            
            if (timeLeft <= 0) {
                clearInterval(otpTimer);
                otpTimer = null;
                
                // Re-enable button and restore appearance
                $btn.prop('disabled', false)
                    .removeClass('cod-btn-timer-active')
                    .addClass('cod-btn-primary')
                    .text('Send OTP');
                
                console.log('COD Verifier: OTP timer completed');
            }
        }, 1000);
        
        console.log('COD Verifier: OTP timer started for', duration, 'seconds');
    }
    
    function updateTimerDisplay(timeLeft, $btn) {
        if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const displayTime = seconds < 10 ? `0${seconds}` : seconds;
            
            if (minutes > 0) {
                $btn.text(`Resend in ${minutes}:${displayTime}`);
            } else {
                $btn.text(`Resend in ${seconds}s`);
            }
        }
    }
    
    function clearOTPTimer() {
        if (otpTimer) {
            clearInterval(otpTimer);
            otpTimer = null;
            
            const $btn = $('#cod_send_otp');
            $btn.prop('disabled', false)
                .removeClass('cod-btn-timer-active')
                .addClass('cod-btn-primary')
                .text('Send OTP');
        }
    }
    
    // ===== NEW: TOKEN PAYMENT TIMER FUNCTIONALITY =====
    
    function startTokenTimer(duration) {
        const $btn = $('#cod_pay_token');
        let timeLeft = duration;
        
        // Start countdown
        tokenTimer = setInterval(() => {
            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                const displayTime = seconds < 10 ? `0${seconds}` : seconds;
                
                if (minutes > 0) {
                    $btn.text(`Payment expires in ${minutes}:${displayTime}`);
                } else {
                    $btn.text(`Payment expires in ${seconds}s`);
                }
                
                timeLeft--;
            } else {
                clearInterval(tokenTimer);
                tokenTimer = null;
                
                // Reset button and hide QR/payment UI
                $btn.prop('disabled', false).text('Pay ₹1 Token').removeClass('verified');
                $('#cod-token-qr-container').hide();
                $('#cod_token_message').removeClass('success error').hide();
                
                showMessage('token', '⛔ Payment session expired. Please try again.', 'error');
                console.log('COD Verifier: Token payment timer expired');
            }
        }, 1000);
        
        console.log('COD Verifier: Token payment timer started for', duration, 'seconds');
    }
    
    function clearTokenTimer() {
        if (tokenTimer) {
            clearInterval(tokenTimer);
            tokenTimer = null;
        }
    }
    
    // ===== DEVICE DETECTION & UI SWITCHING =====
    
    function isMobileDevice() {
        return window.innerWidth <= 768;
    }
    
    function createQRContainer() {
        if ($('#cod-token-qr-container').length === 0) {
            const qrHTML = `
                <div id="cod-token-qr-container" style="display: none; text-align: center; margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div id="cod-token-qr-content">
                        <div style="margin-bottom: 10px; font-weight: 500; color: #374151;">
                            🛈 Scan this QR code with any UPI app
                        </div>
                        <div id="cod-token-qr-image" style="margin: 10px 0;"></div>
                        <div style="font-size: 12px; color: #6b7280;">
                            Payment will expire in 2 minutes
                        </div>
                    </div>
                </div>
            `;
            $('#cod_pay_token').after(qrHTML);
        }
    }
    
    // ===== FLOATING POPUP NOTIFICATION SYSTEM =====
    
    function createFloatingPopupHTML() {
        return `
            <div id="cod-floating-popup" class="cod-floating-popup" style="display: none;">
                <div class="cod-popup-container">
                    <div class="cod-popup-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="cod-popup-content">
                        <div class="cod-popup-title">Verification Required</div>
                        <div class="cod-popup-message"></div>
                    </div>
                    <button class="cod-popup-close" type="button" aria-label="Close notification">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    function injectFloatingPopupStyles() {
        if ($('#cod-floating-popup-styles').length > 0) return;
        
        const styles = `
            <style id="cod-floating-popup-styles">
                .cod-floating-popup {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 999999;
                    max-width: 400px;
                    min-width: 320px;
                    pointer-events: none;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                }
                
                .cod-popup-container {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
                    padding: 16px;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    pointer-events: auto;
                    transform: translateX(100%);
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .cod-floating-popup.show .cod-popup-container {
                    transform: translateX(0);
                    opacity: 1;
                }
                
                .cod-popup-icon {
                    flex-shrink: 0;
                    width: 40px;
                    height: 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                }
                
                .cod-popup-content {
                    flex: 1;
                    min-width: 0;
                }
                
                .cod-popup-title {
                    font-weight: 600;
                    font-size: 14px;
                    color: #1f2937;
                    margin-bottom: 4px;
                    line-height: 1.4;
                }
                
                .cod-popup-message {
                    font-size: 13px;
                    color: #6b7280;
                    line-height: 1.5;
                    word-wrap: break-word;
                }
                
                .cod-popup-close {
                    flex-shrink: 0;
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: none;
                    color: #9ca3af;
                    cursor: pointer;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    padding: 0;
                }
                
                .cod-popup-close:hover {
                    color: #6b7280;
                    background: #f3f4f6;
                }
                
                @media (max-width: 480px) {
                    .cod-floating-popup {
                        top: 10px;
                        right: 10px;
                        left: 10px;
                        max-width: none;
                        min-width: auto;
                    }
                }
            </style>
        `;
        
        $('head').append(styles);
    }
    
    function showFloatingMessage(message, title = 'Verification Required') {
        injectFloatingPopupStyles();
        $('#cod-floating-popup').remove();
        $('body').append(createFloatingPopupHTML());
        
        const $popup = $('#cod-floating-popup');
        const $messageEl = $popup.find('.cod-popup-message');
        const $titleEl = $popup.find('.cod-popup-title');
        const $closeBtn = $popup.find('.cod-popup-close');
        
        $titleEl.text(title);
        $messageEl.text(message);
        
        $popup.show();
        setTimeout(() => $popup.addClass('show'), 10);
        
        const autoHideTimer = setTimeout(() => hideFloatingMessage(), 5000);
        
        $closeBtn.off('click').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            clearTimeout(autoHideTimer);
            hideFloatingMessage();
        });
        
        $popup.data('autoHideTimer', autoHideTimer);
        console.log('COD Verifier: Floating message shown:', message);
    }
    
    function hideFloatingMessage() {
        const $popup = $('#cod-floating-popup');
        if ($popup.length === 0) return;
        
        const timer = $popup.data('autoHideTimer');
        if (timer) clearTimeout(timer);
        
        $popup.removeClass('show');
        setTimeout(() => $popup.remove(), 300);
        console.log('COD Verifier: Floating message hidden');
    }
    
    // ===== UTILITY FUNCTIONS =====
    
    function getSelectedPaymentMethod() {
        let selectedMethod = null;
        
        const selectors = [
            'input#radio-control-wc-payment-method-options-cod:checked',
            'input[name="payment_method"]:checked',
            '.wc-block-components-radio-control__input:checked',
            'input[name*="radio-control-wc-payment-method"]:checked',
            'input[name*="payment-method"]:checked',
            'input.wc-payment-method-input:checked'
        ];
        
        for (let selector of selectors) {
            const $input = $(selector);
            if ($input.length > 0) {
                selectedMethod = $input.val();
                if (selectedMethod) break;
            }
        }
        
        console.log('COD Verifier: Selected payment method:', selectedMethod);
        return selectedMethod;
    }
    
    function createVerificationBox() {
        if (verificationBoxCreated) {
            return $('#cod-verifier-wrapper-active');
        }
        
        const $template = $('#cod-verification-template #cod-verifier-wrapper');
        if ($template.length === 0) {
            console.error('COD Verifier: Template not found in DOM');
            return $();
        }
        
        const $clonedBox = $template.clone();
        $clonedBox.attr('id', 'cod-verifier-wrapper-active');
        
        let $insertionPoint = null;
        
        if (isBlockCheckout) {
            const blockSelectors = [
                '.wc-block-checkout__actions_row',
                '.wc-block-components-checkout-place-order-button',
                '.wp-block-woocommerce-checkout-order-summary-block'
            ];
            
            for (let selector of blockSelectors) {
                $insertionPoint = $(selector).first();
                if ($insertionPoint.length > 0) {
                    console.log('COD Verifier: Found insertion point:', selector);
                    break;
                }
            }
        } else {
            const classicSelectors = [
                '#order_review',
                '.woocommerce-checkout-review-order',
                '#place_order'
            ];
            
            for (let selector of classicSelectors) {
                $insertionPoint = $(selector).first();
                if ($insertionPoint.length > 0) {
                    console.log('COD Verifier: Found insertion point:', selector);
                    break;
                }
            }
        }
        
        if ($insertionPoint && $insertionPoint.length > 0) {
            $insertionPoint.before($clonedBox);
            verificationBoxCreated = true;
            
            // Initialize country code change handler
            initializeCountryCodeHandler();
            
            // Create QR container for token payments
            createQRContainer();
            
            console.log('COD Verifier: Verification box created');
            return $clonedBox;
        } else {
            console.error('COD Verifier: No suitable insertion point found');
            return $();
        }
    }
    
    function initializeCountryCodeHandler() {
        // Update helper text when country code changes
        $(document).on('change', '#cod_country_code', function() {
            updatePhoneHelperText();
            // Clear phone input when country changes
            $('#cod_phone').val('');
            // Clear any existing messages
            $('#cod_otp_message').removeClass('success error').hide();
        });
        
        // Initialize helper text
        updatePhoneHelperText();
    }
    
    function createWarningMessage() {
        if (warningMessageCreated) {
            return $('#cod-verification-warning-active');
        }
        
        const warningHTML = `
            <div id="cod-verification-warning-active" class="cod-verification-warning" style="display: none;">
                <div class="cod-warning-content">
                    <span class="cod-warning-icon">⚠️</span>
                    <span class="cod-warning-text">Please complete verification before placing the order.</span>
                </div>
            </div>
        `;
        
        let $insertionPoint = null;
        
        if (isBlockCheckout) {
            const blockSelectors = [
                '.wc-block-checkout__actions_row',
                '.wc-block-components-checkout-place-order-button',
                '.wp-block-woocommerce-checkout-order-summary-block'
            ];
            
            for (let selector of blockSelectors) {
                $insertionPoint = $(selector).first();
                if ($insertionPoint.length > 0) {
                    console.log('COD Verifier: Found warning insertion point:', selector);
                    break;
                }
            }
        } else {
            const classicSelectors = [
                '#order_review',
                '.woocommerce-checkout-review-order',
                '#place_order'
            ];
            
            for (let selector of classicSelectors) {
                $insertionPoint = $(selector).first();
                if ($insertionPoint.length > 0) {
                    console.log('COD Verifier: Found warning insertion point:', selector);
                    break;
                }
            }
        }
        
        if ($insertionPoint && $insertionPoint.length > 0) {
            $insertionPoint.after(warningHTML);
            warningMessageCreated = true;
            console.log('COD Verifier: Warning message created');
            return $('#cod-verification-warning-active');
        } else {
            console.error('COD Verifier: No suitable insertion point found for warning message');
            return $();
        }
    }
    
    function updateVerificationWarning() {
        const selectedMethod = getSelectedPaymentMethod();
        const isCODSelected = selectedMethod === 'cod' || selectedMethod === 'cash_on_delivery';
        
        let $warningMessage = $('#cod-verification-warning-active');
        if ($warningMessage.length === 0) {
            $warningMessage = createWarningMessage();
        }
        
        if ($warningMessage.length === 0) return;
        
        if (isCODSelected) {
            let verificationComplete = true;
            
            if (codVerifier.enableOTP === '1' && !window.codVerifierStatus.otpVerified) {
                verificationComplete = false;
            }
            
            if (codVerifier.enableToken === '1' && (!window.codVerifierStatus.tokenVerified || !$('#cod_token_confirmed').is(':checked'))) {
                verificationComplete = false;
            }
            
            if (verificationComplete) {
                $warningMessage.fadeOut(300);
                console.log('COD Verifier: Warning message hidden - verification complete');
            } else {
                $warningMessage.fadeIn(300);
                console.log('COD Verifier: Warning message shown - verification incomplete');
            }
        } else {
            $warningMessage.fadeOut(300);
            console.log('COD Verifier: Warning message hidden - non-COD selected');
        }
    }
    
    function updateHiddenFields() {
        $('input[name="cod_otp_verified"]').remove();
        $('input[name="cod_token_verified"]').remove();
        
        const $checkoutForm = $('form.checkout, form.wc-block-checkout__form').first();
        if ($checkoutForm.length > 0) {
            $checkoutForm.append('<input type="hidden" name="cod_otp_verified" value="' + (window.codVerifierStatus.otpVerified ? '1' : '0') + '">');
            $checkoutForm.append('<input type="hidden" name="cod_token_verified" value="' + (window.codVerifierStatus.tokenVerified ? '1' : '0') + '">');
        }

        console.log('COD Verifier: Hidden fields updated - OTP:', window.codVerifierStatus.otpVerified, 'Token:', window.codVerifierStatus.tokenVerified);
    }
    
    function updateVerificationStatus() {
        if (codVerifier.enableOTP === '1') {
            const otpBadge = $('#cod-otp-badge');
            if (otpBadge.length) {
                if (window.codVerifierStatus.otpVerified) {
                    otpBadge.text('✓ Verified').removeClass('pending').addClass('verified');
                } else {
                    otpBadge.text('Pending').removeClass('verified').addClass('pending');
                }
            }
        }

        if (codVerifier.enableToken === '1') {
            const tokenBadge = $('#cod-token-badge');
            if (tokenBadge.length) {
                if (window.codVerifierStatus.tokenVerified) {
                    tokenBadge.text('✓ Completed').removeClass('pending').addClass('verified');
                } else {
                    tokenBadge.text('Pending').removeClass('verified').addClass('pending');
                }
            }
        }

        updateHiddenFields();
        updatePlaceOrderButtonState();
        updateVerificationWarning();
    }
    
    function showMessage(type, message, status) {
        const $messageElement = $('#cod_' + type + '_message');
        $messageElement.removeClass('success error').addClass(status).html(message).show();
    }

    function updatePlaceOrderButtonState() {
        console.log('COD Verifier: updatePlaceOrderButtonState triggered.');
        const $placeOrderButton = $('#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]');
        const isCODSelectedNow = $('input#radio-control-wc-payment-method-options-cod:checked, input[name="payment_method"][value="cod"]:checked, input[name="payment_method"]:checked[value="cash_on_delivery"], .wc-block-components-radio-control__input:checked[value="cod"], .wc-block-components-radio-control__input:checked[value="cash_on_delivery"], input[name*="radio-control-wc-payment-method"]:checked[value="cod"], input[name*="radio-control-wc-payment-method"]:checked[value="cash_on_delivery"], input[name*="payment-method"]:checked[value="cod"], input[name*="payment-method"]:checked[value="cash_on_delivery"], input.wc-payment-method-input:checked[value="cod"], input.wc-payment-method-input:checked[value="cash_on_delivery"]').length > 0;

        console.log('COD Verifier: isCODSelectedNow:', isCODSelectedNow);
        
        if (isCODSelectedNow) {
            console.log('COD Verifier: COD selected, checking verification status for button state.');
            let canPlaceOrder = true;

            if (codVerifier.enableOTP === '1' && !window.codVerifierStatus.otpVerified) {
                canPlaceOrder = false;
            }

            const isTokenConfirmed = $('#cod_token_confirmed').is(':checked');
            if (codVerifier.enableToken === '1' && (!window.codVerifierStatus.tokenVerified || !isTokenConfirmed)) {
                 canPlaceOrder = false;
            }

            console.log('COD Verifier: canPlaceOrder:', canPlaceOrder);

            if (canPlaceOrder) {
                $placeOrderButton.prop('disabled', false).removeClass('disabled');
                console.log('COD Verifier: Verification complete, enabling place order button.');
            } else {
                $placeOrderButton.prop('disabled', true).addClass('disabled');
                console.log('COD Verifier: Verification incomplete, disabling place order button.');
            }
        } else {
            $placeOrderButton.prop('disabled', false).removeClass('disabled');
            console.log('COD Verifier: Non-COD selected, enabling place order button.');
        }
        
        updateVerificationWarning();
    }
    
    // ===== PAYMENT METHOD HANDLING =====
    
    function handlePaymentMethodChange() {
        const selectedMethod = getSelectedPaymentMethod();
        
        if (selectedMethod === 'cod' || selectedMethod === 'cash_on_delivery') {
            console.log('COD Verifier: COD selected, showing verification box.');
            showVerificationBox();
        } else {
            console.log('COD Verifier: Non-COD selected, hiding verification box.');
            hideVerificationBox();
        }
        updatePlaceOrderButtonState();
    }
    
    function showVerificationBox() {
        let $wrapper = $('#cod-verifier-wrapper-active');
        
        if ($wrapper.length === 0) {
            $wrapper = createVerificationBox();
        }
        
        if ($wrapper.length > 0) {
            $wrapper.show();
            console.log('COD Verifier: Verification box shown');
            populatePhoneFromBilling();
            updateVerificationStatus();
        }
    }
    
    function hideVerificationBox() {
        const $wrapper = $('#cod-verifier-wrapper-active');
        if ($wrapper.length > 0) {
            $wrapper.hide();
            console.log('COD Verifier: Verification box hidden');
            resetVerificationStates();
        }
    }
    
    function populatePhoneFromBilling() {
        const phoneSelectors = ['#billing_phone', 'input[name*="billing-phone"]', 'input[name*="phone"]'];
        let billingPhone = '';
        
        for (let selector of phoneSelectors) {
            const $phone = $(selector);
            if ($phone.length > 0 && $phone.val()) {
                billingPhone = $phone.val();
                break;
            }
        }
        
        // Extract just the number part if it contains country code
        if (billingPhone) {
            // Remove common prefixes and non-digits
            let cleanPhone = billingPhone.replace(/^\+?91|^\+?1|^\+?44|^0/, '').replace(/\D/g, '');
            
            if (cleanPhone && !$('#cod_phone').val()) {
                $('#cod_phone').val(cleanPhone);
            }
        }
    }
    
    function resetVerificationStates() {
        window.codVerifierStatus.otpVerified = false;
        window.codVerifierStatus.tokenVerified = false;
        $('#cod_otp').val('');
        $('#cod_phone').val('');
        $('#cod_token_confirmed').prop('checked', false);
        $('#cod_otp_message').removeClass('success error').hide();
        $('#cod_token_message').removeClass('success error').hide();
        $('#cod_verify_otp').prop('disabled', true).text('Verify').removeClass('verified');
        $('#cod_pay_token').text('Pay ₹1 Token').removeClass('verified');
        $('#cod-token-qr-container').hide();
        
        // Clear timers
        clearOTPTimer();
        clearTokenTimer();
        
        updateHiddenFields();
        updateVerificationStatus();
    }
    
    // ===== EVENT LISTENERS FOR PAYMENT METHOD CHANGES =====

    $(document).on('change', 'input[name="payment_method"], .wc-block-components-radio-control__input, input[name*="radio-control-wc-payment-method"], input[name*="payment-method"], input.wc-payment-method-input', handlePaymentMethodChange);

    $(document.body).on('updated_checkout', function() {
        console.log('COD Verifier: updated_checkout triggered');
        setTimeout(updatePlaceOrderButtonState, 300);
        setTimeout(handlePaymentMethodChange, 350);
    });

    $(document).on('change', '#payment, #order_review, .wc-block-checkout', function() {
         console.log('COD Verifier: Payment method section change detected');
         setTimeout(updatePlaceOrderButtonState, 200);
         setTimeout(handlePaymentMethodChange, 250);
    });

    // Initial checks
    setTimeout(updatePlaceOrderButtonState, 100);
    setTimeout(handlePaymentMethodChange, 150);
    setTimeout(updatePlaceOrderButtonState, 600);
    setTimeout(handlePaymentMethodChange, 650);
    setTimeout(updatePlaceOrderButtonState, 1500);
    setTimeout(handlePaymentMethodChange, 1550);

    // ===== ENHANCED OTP VERIFICATION HANDLERS =====
    
    $(document).on('click', '#cod_send_otp', function(e) {
        e.preventDefault();
        
        const $btn = $(this);

        // Prevent sending if button is disabled (cooldown active)
        if ($btn.is(':disabled')) {
            console.log('COD Verifier: Send OTP button is disabled, preventing resend.');
            return;
        }

        const countryCode = $('#cod_country_code').val();
        const phoneNumber = $('#cod_phone').val().trim();
        
        // Validate phone number
        const validation = validatePhoneNumber(countryCode, phoneNumber);
        if (!validation.valid) {
            showMessage('otp', validation.message, 'error');
            return;
        }
        
        // Create full E.164 format phone number
        const fullPhone = countryCode + phoneNumber;
        
        $btn.prop('disabled', true).text('Sending...');
        
        $.ajax({
            url: codVerifier.ajaxUrl,
            type: 'POST',
            data: {
                action: 'cod_send_otp',
                phone: fullPhone,
                country_code: countryCode,
                phone_number: phoneNumber,
                nonce: codVerifier.nonce
            },
            success: function(response) {
                if (response.success) {
                    showMessage('otp', response.data.message, 'success');
                    if (response.data.test_mode && response.data.otp) {
                        alert('TEST MODE - Your OTP is: ' + response.data.otp);
                    }
                    
                    // Start timer with configured duration
                    startOTPTimer(settings.otpTimerDuration);
                    
                    // Enable OTP input
                    $('#cod_otp').prop('disabled', false).focus();
                } else {
                    showMessage('otp', response.data, 'error');
                    $btn.prop('disabled', false).text('Send OTP');
                }
            },
            error: function() {
                showMessage('otp', 'Failed to send OTP. Please try again.', 'error');
                $btn.prop('disabled', false).text('Send OTP');
            }
        });
    });
    
    $(document).on('input', '#cod_otp', function() {
        const otp = $(this).val().trim();
        $('#cod_verify_otp').prop('disabled', otp.length !== 6);
    });
    
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
            url: codVerifier.ajaxUrl,
            type: 'POST',
            data: {
                action: 'cod_verify_otp',
                otp: otp,
                nonce: codVerifier.nonce
            },
            success: function(response) {
                if (response.success) {
                    showMessage('otp', response.data, 'success');
                    window.codVerifierStatus.otpVerified = true;
                    $btn.text('✓ Verified').addClass('verified');
                    
                    // Clear timer since verification is complete
                    clearOTPTimer();
                    
                    updateVerificationStatus();
                } else {
                    showMessage('otp', response.data, 'error');
                    $btn.prop('disabled', false).text('Verify');
                }
            },
            error: function() {
                showMessage('otp', 'Failed to verify OTP. Please try again.', 'error');
                $btn.prop('disabled', false).text('Verify');
            }
        });
    });
    
    // ===== NEW: RAZORPAY TOKEN PAYMENT HANDLERS =====
    
    $(document).on('click', '#cod_pay_token', function(e) {
        e.preventDefault();
        
        const $btn = $(this);
        
        // Don't prevent if user wants to retry after expiry
        if ($btn.hasClass('verified')) {
            return; // Already verified, do nothing
        }
        
        $btn.prop('disabled', true).text('Creating payment...');
        
        $.ajax({
            url: codVerifier.ajaxUrl,
            type: 'POST',
            data: {
                action: 'cod_create_razorpay_order',
                nonce: codVerifier.nonce
            },
            success: function(response) {
                if (response.success) {
                    handleRazorpayOrder(response.data, $btn);
                } else {
                    showMessage('token', response.data, 'error');
                    $btn.prop('disabled', false).text('Pay ₹1 Token');
                }
            },
            error: function() {
                showMessage('token', 'Failed to create payment order. Please try again.', 'error');
                $btn.prop('disabled', false).text('Pay ₹1 Token');
            }
        });
    });
    
    function handleRazorpayOrder(orderData, $btn) {
        const isMobile = isMobileDevice();
        
        console.log('COD Verifier: Device detection - Mobile:', isMobile, 'Width:', window.innerWidth);
        
        if (orderData.test_mode) {
            // Test mode - simulate payment
            showMessage('token', '🔒 Test Mode: Payment simulation started', 'success');
            
            if (isMobile) {
                showMessage('token', '📱 Mobile: Simulating Razorpay popup...', 'success');
            } else {
                $('#cod-token-qr-container').show();
                $('#cod-token-qr-image').html('<div style="width: 200px; height: 200px; background: #f0f0f0; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; margin: 0 auto; border-radius: 8px;"><span style="color: #666; font-size: 14px;">TEST QR CODE</span></div>');
                showMessage('token', '🖥️ Desktop: Test QR code displayed', 'success');
            }
            
            // Start 2-minute timer
            startTokenTimer(120);
            
            // Simulate successful payment after 3 seconds
            setTimeout(() => {
                simulateSuccessfulPayment();
            }, 3000);
            
        } else {
            // Production mode
            if (typeof Razorpay === 'undefined') {
                // Load Razorpay script dynamically
                const script = document.createElement('script');
                script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                script.onload = () => {
                    initializeRazorpayPayment(orderData, $btn, isMobile);
                };
                script.onerror = () => {
                    showMessage('token', 'Failed to load payment gateway. Please refresh and try again.', 'error');
                    $btn.prop('disabled', false).text('Pay ₹1 Token');
                };
                document.head.appendChild(script);
            } else {
                initializeRazorpayPayment(orderData, $btn, isMobile);
            }
        }
    }
    
    function initializeRazorpayPayment(orderData, $btn, isMobile) {
        const options = {
            key: orderData.key_id,
            amount: orderData.amount,
            currency: orderData.currency,
            name: 'COD Token Verification',
            description: '₹1 verification payment (will be refunded)',
            order_id: orderData.order_id,
            handler: function(response) {
                verifyRazorpayPayment(response);
            },
            prefill: {
                contact: $('#cod_phone').val() ? $('#cod_country_code').val() + $('#cod_phone').val() : ''
            },
            theme: {
                color: '#667eea'
            },
            modal: {
                ondismiss: function() {
                    // User closed popup - allow retry
                    $btn.prop('disabled', false).text('Pay ₹1 Token');
                    showMessage('token', 'Payment cancelled. You can try again.', 'error');
                }
            }
        };
        
        const rzp = new Razorpay(options);
        
        if (isMobile) {
            // Mobile: Show popup directly
            rzp.open();
            showMessage('token', '🔒 Secure Payment · ₹1 will be refunded automatically', 'success');
        } else {
            // Desktop: Show QR code
            $('#cod-token-qr-container').show();
            
            if (orderData.qr_code_url) {
                $('#cod-token-qr-image').html(`<img src="${orderData.qr_code_url}" alt="Payment QR Code" style="max-width: 200px; border-radius: 8px; border: 1px solid #e2e8f0;">`);
            } else {
                $('#cod-token-qr-image').html('<div style="width: 200px; height: 200px; background: #f0f0f0; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; margin: 0 auto; border-radius: 8px;"><span style="color: #666; font-size: 14px;">QR Code Loading...</span></div>');
            }
            
            showMessage('token', '🛈 Scan QR code with any UPI app. ₹1 will be refunded.', 'success');
        }
        
        // Start 2-minute timer
        startTokenTimer(120);
    }
    
    function simulateSuccessfulPayment() {
        // Test mode simulation
        $.ajax({
            url: codVerifier.ajaxUrl,
            type: 'POST',
            data: {
                action: 'cod_verify_razorpay_payment',
                test_mode: true,
                nonce: codVerifier.nonce
            },
            success: function(response) {
                if (response.success) {
                    handleSuccessfulPayment(response.data);
                }
            }
        });
    }
    
    function verifyRazorpayPayment(razorpayResponse) {
        $.ajax({
            url: codVerifier.ajaxUrl,
            type: 'POST',
            data: {
                action: 'cod_verify_razorpay_payment',
                payment_id: razorpayResponse.razorpay_payment_id,
                order_id: razorpayResponse.razorpay_order_id,
                signature: razorpayResponse.razorpay_signature,
                nonce: codVerifier.nonce
            },
            success: function(response) {
                if (response.success) {
                    handleSuccessfulPayment(response.data);
                } else {
                    showMessage('token', response.data, 'error');
                    $('#cod_pay_token').prop('disabled', false).text('Pay ₹1 Token');
                }
            },
            error: function() {
                showMessage('token', 'Payment verification failed. Please try again.', 'error');
                $('#cod_pay_token').prop('disabled', false).text('Pay ₹1 Token');
            }
        });
    }
    
    function handleSuccessfulPayment(message) {
        // Clear timer
        clearTokenTimer();
        
        // Update UI
        window.codVerifierStatus.tokenVerified = true;
        $('#cod_token_confirmed').prop('checked', true);
        $('#cod_pay_token').text('✓ Payment Complete').addClass('verified').prop('disabled', false);
        $('#cod-token-qr-container').hide();
        
        showMessage('token', message, 'success');
        updateVerificationStatus();
        
        console.log('COD Verifier: Token payment completed successfully');
    }

    $(document).on('change', '#cod_token_confirmed', function() {
          console.log('COD Verifier: Token confirmed checkbox changed.');
          updatePlaceOrderButtonState();
     });
    
    // ===== CRITICAL VALIDATION FUNCTION (Updated with Floating Popup) =====
    
    function preventOrderPlacement(e) {
        console.log('COD Verifier: preventOrderPlacement triggered (final button check). ');
        const $placeOrderButton = $('#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]');

        if ($placeOrderButton.is(':disabled')) {
            console.log('COD Verifier: Order placement prevented by disabled button.');
            if (e && typeof e.preventDefault === 'function') {
                 e.preventDefault();
                 if (typeof e.stopImmediatePropagation === 'function') {
                      e.stopImmediatePropagation();
                 }
                 if (typeof e.stopPropagation === 'function') {
                      e.stopPropagation();
                 }
            }

            const selectedMethod = getSelectedPaymentMethod();
            if (selectedMethod === 'cod' || selectedMethod === 'cash_on_delivery') {
                 let errors = [];
                 if (codVerifier.enableOTP === '1' && !window.codVerifierStatus.otpVerified) {
                     errors.push('• Phone number verification via OTP');
                 }
                 if (codVerifier.enableToken === '1' && (!window.codVerifierStatus.tokenVerified || !$('#cod_token_confirmed').is(':checked'))) {
                     errors.push('• ₹1 token payment completion and confirmation');
                 }
                 
                 if (errors.length > 0) {
                    const message = 'Please complete the following steps:\n' + errors.join('\n');
                    showFloatingMessage(message, 'Complete Verification');
                    
                    const $verificationBox = $('#cod-verifier-wrapper-active');
                    if ($verificationBox.length > 0 && $verificationBox.is(':visible')) {
                        $('html, body').animate({
                            scrollTop: $verificationBox.offset().top - 100
                        }, 500);
                    }
                 }
            }

            return false;
        }

        console.log('COD Verifier: PreventOrderPlacement check passed, allowing order.');
        return true;
    }
    
    // ===== COMPREHENSIVE VALIDATION EVENT LISTENERS =====

    $(document).on('click', '#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]', function(e) {
        console.log('COD Verifier: Order placement attempted via click');
        if (!preventOrderPlacement(e)) {
             e.preventDefault();
             e.stopImmediatePropagation();
             e.stopPropagation();
             return false;
        }
    });

    $(document).on('submit', 'form.checkout, form.wc-block-checkout__form, form[name="checkout"]', function(e) {
        console.log('COD Verifier: Form submission attempted');
        if (!preventOrderPlacement(e)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            return false;
        }
    });

    $(document).on('checkout_place_order', function(e) {
        console.log('COD Verifier: WooCommerce checkout_place_order event');
        if (!preventOrderPlacement(e)) {
             e.preventDefault();
             e.stopImmediatePropagation();
             return false;
        }
        return true;
    });

    $(document).on('checkout_place_order_cod', function(e) {
        console.log('COD Verifier: WooCommerce checkout_place_order_cod event');
        if (!preventOrderPlacement(e)) {
             e.preventDefault();
             e.stopImmediatePropagation();
             return false;
        }
        return true;
    });

    $('form.checkout').on('checkout_place_order', function(e) {
        console.log('COD Verifier: Classic checkout form validation');
        if (!preventOrderPlacement(e)) {
             e.preventDefault();
             e.stopImmediatePropagation();
             return false;
        }
        return true;
    });

    // Additional safety net - continuous validation
    setInterval(function() {
        const selectedMethod = getSelectedPaymentMethod();
        if (selectedMethod === 'cod' || selectedMethod === 'cash_on_delivery') {
            updateHiddenFields();
        } else {
             const $placeOrderButton = $('#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]');
             if ($placeOrderButton.is(':disabled')) {
                  $placeOrderButton.prop('disabled', false).removeClass('disabled');
                  console.log('COD Verifier: Interval check: Non-COD selected, ensuring button is enabled.');
             }
        }
    }, 1500);

    // Cleanup on page unload
    $(window).on('beforeunload', function() {
        clearOTPTimer();
        clearTokenTimer();
    });

});