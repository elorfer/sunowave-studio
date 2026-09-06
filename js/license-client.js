/**
 * SunoWave Studio - Controlador de Bloqueo / Paywall del Cliente
 * Controla la pantalla de suscripción, precios USD/COP y estado de días restantes
 */

(function initLicenseClient() {
  document.addEventListener('DOMContentLoaded', () => {
    setupLicenseUI();
  });

  function setupLicenseUI() {
    const paywallOverlay = document.getElementById('paywall-modal');
    const paywallCodeInput = document.getElementById('paywall-code-input');
    const btnActivate = document.getElementById('paywall-btn-activate');
    const paywallMsg = document.getElementById('paywall-status-msg');
    const btnWhatsapp = document.getElementById('paywall-btn-whatsapp');
    const headerBadge = document.getElementById('user-license-badge');
    const badgeText = document.getElementById('license-badge-text');
    const badgeDays = document.getElementById('license-badge-days');

    // Elementos de precios dinámicos USD / COP
    const priceUsdEl = document.getElementById('paywall-price-usd');
    const priceCopEl = document.getElementById('paywall-price-cop');
    const copRateNote = document.getElementById('paywall-rate-note');

    // 1. Actualizar precios en pantalla
    function updatePricingDisplay() {
      if (!window.LicenseService) return;
      const pricing = window.LicenseService.getFormattedPricing();
      if (priceUsdEl) priceUsdEl.textContent = pricing.usd;
      if (priceCopEl) priceCopEl.textContent = `≈ ${pricing.cop}`;
      if (copRateNote) {
        const s = window.LicenseService.getSettings();
        copRateNote.textContent = `(Tasa estimada: 1 USD ≈ $${s.copExchangeRate.toLocaleString()} COP)`;
      }

      // Configurar enlace de WhatsApp
      if (btnWhatsapp) {
        const s = window.LicenseService.getSettings();
        const msg = encodeURIComponent(
          `¡Hola! Quiero activar mi suscripción a SunoWave Studio (${pricing.usd} / ${pricing.cop} al mes) para descargar, descifrar y recortar música de Suno. ¿Me pasas los datos de pago para Nequi / Bancolombia?`
        );
        btnWhatsapp.href = `https://wa.me/${s.whatsappNumber.replace(/[^0-9]/g, '')}?text=${msg}`;
      }
    }

    updatePricingDisplay();

    // 2. Verificar sesión actual o parámetro en URL (?code=SW-...)
    const urlParams = new URLSearchParams(window.location.search);
    const autoCode = urlParams.get('code');

    if (autoCode) {
      if (paywallCodeInput) paywallCodeInput.value = autoCode;
      handleActivation(autoCode);
    } else {
      checkCurrentAccess();
    }

    // 3. Listener del botón Activar
    if (btnActivate && paywallCodeInput) {
      btnActivate.addEventListener('click', () => {
        handleActivation(paywallCodeInput.value);
      });

      paywallCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleActivation(paywallCodeInput.value);
        }
      });
    }

    // 4. Manejar proceso de activación
    async function handleActivation(rawCode) {
      const code = (rawCode || '').trim();
      if (!code) {
        showPaywallError('Por favor escribe tu código de acceso.');
        return;
      }

      btnActivate.disabled = true;
      btnActivate.innerHTML = '<span>⏳</span> Verificando...';
      if (paywallMsg) paywallMsg.style.display = 'none';

      try {
        const res = await window.LicenseService.validateCode(code);
        if (res.valid) {
          showPaywallSuccess(res.message);
          setTimeout(() => {
            closePaywall();
            updateHeaderBadge(res.name, res.remainingDays);
            if (window.showToast) {
              window.showToast(`¡Suscripción activa! Te quedan ${res.remainingDays} días de acceso.`, 'success');
            }
          }, 800);
        } else {
          showPaywallError(res.message);
        }
      } catch (err) {
        showPaywallError('Error de conexión al validar código. Intenta de nuevo.');
      } finally {
        btnActivate.disabled = false;
        btnActivate.innerHTML = '<span>🔓</span> Activar Acceso Pro';
      }
    }

    function checkCurrentAccess() {
      const session = window.LicenseService.getCurrentSession();
      if (!session || session.expired || session.remainingDays <= 0) {
        openPaywall(session?.expired ? 'Tu suscripción ha vencido. Por favor renueva tu membresía de $10 USD.' : null);
      } else {
        closePaywall();
        updateHeaderBadge(session.name, session.remainingDays);
      }
    }

    function openPaywall(customWarning = null) {
      if (!paywallOverlay) return;
      paywallOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      if (customWarning) {
        showPaywallError(customWarning);
      }
    }

    function closePaywall() {
      if (!paywallOverlay) return;
      paywallOverlay.style.display = 'none';
      document.body.style.overflow = '';
    }

    function showPaywallError(msg) {
      if (!paywallMsg) return;
      paywallMsg.className = 'paywall-msg paywall-msg-error';
      paywallMsg.innerHTML = `⚠️ ${msg}`;
      paywallMsg.style.display = 'block';
    }

    function showPaywallSuccess(msg) {
      if (!paywallMsg) return;
      paywallMsg.className = 'paywall-msg paywall-msg-success';
      paywallMsg.innerHTML = `✅ ${msg}`;
      paywallMsg.style.display = 'block';
    }

    function updateHeaderBadge(name, days) {
      if (!headerBadge) return;
      headerBadge.style.display = 'inline-flex';
      if (badgeText) badgeText.textContent = name || 'Suscripción Pro';
      if (badgeDays) {
        badgeDays.textContent = `${days} día${days === 1 ? '' : 's'} rest.`;
        if (days <= 3) {
          badgeDays.style.background = 'rgba(255, 71, 87, 0.2)';
          badgeDays.style.color = '#ff4757';
          badgeDays.style.borderColor = '#ff4757';
        } else if (days <= 7) {
          badgeDays.style.background = 'rgba(255, 177, 66, 0.2)';
          badgeDays.style.color = '#ffb142';
          badgeDays.style.borderColor = '#ffb142';
        } else {
          badgeDays.style.background = 'rgba(46, 213, 115, 0.15)';
          badgeDays.style.color = '#2ed573';
          badgeDays.style.borderColor = 'rgba(46, 213, 115, 0.4)';
        }
      }
    }

    // Permitir clic en el badge para ver detalles o cambiar código
    if (headerBadge) {
      headerBadge.addEventListener('click', () => {
        const session = window.LicenseService.getCurrentSession();
        const days = session ? session.remainingDays : 0;
        const name = session ? session.name : 'Usuario';
        const code = session ? session.code : '';
        
        const confirmChange = confirm(
          `👤 Suscripción: ${name}\n⏳ Días restantes: ${days}\n🔑 Código: ${code}\n\n¿Deseas ingresar un código de activación diferente o renovar?`
        );
        if (confirmChange) {
          openPaywall();
        }
      });
    }

    // Exponer función de verificación global
    window._checkLicense = checkCurrentAccess;
  }
})();
