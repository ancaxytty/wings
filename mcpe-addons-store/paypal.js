/* ============================================================
   MCPE ADDONS STORE – Integración PayPal
   Pagos reales con el SDK de PayPal.

   Robustez: el SDK de PayPal suele ser bloqueado por
   bloqueadores de anuncios / extensiones (ERR_BLOCKED_BY_ADBLOCKER).
   Para evitar un bucle infinito de "Cargando…", aquí:
     - esperamos al SDK con un límite de tiempo,
     - detectamos el fallo de carga (window.PAYPAL_LOAD_FAILED),
     - mostramos un aviso claro con botón de "Reintentar".
   ============================================================ */

'use strict';

const PAYPAL_CLIENT_ID = 'AXNocpelnAuDkB3PfxMsD0q3ou7r0VJYQo1mk-1XmOEEDQE11HfiDdprWZpC3U3FTw1FGK1gS-eEeI-f';
const PAYPAL_SDK_URL   = 'https://www.paypal.com/sdk/js?client-id=' + PAYPAL_CLIENT_ID + '&currency=USD';
const PAYPAL_MAX_WAIT_MS = 8000;   // tiempo máximo de espera antes de mostrar el aviso

// Recordamos la última solicitud para poder reintentar
let _ppLastMount = null;

function paypalReady() {
  return typeof paypal !== 'undefined' && paypal && typeof paypal.Buttons === 'function';
}

function paypalLoadingHTML(label) {
  return `
    <div class="paypal-loading">
      <i class="fab fa-paypal"></i>
      <p>${label || 'Cargando PayPal…'}</p>
    </div>`;
}

function paypalFallbackHTML() {
  return `
    <div class="paypal-fallback">
      <i class="fab fa-paypal"></i>
      <p class="paypal-fallback-title">No se pudo cargar PayPal</p>
      <p class="paypal-fallback-sub">Normalmente lo causa un <strong>bloqueador de anuncios</strong> o una extensión del navegador. Desactívalo para este sitio y vuelve a intentarlo.</p>
      <button type="button" class="btn btn-secondary btn-sm" onclick="retryPayPal()">
        <i class="fas fa-rotate-right"></i> Reintentar
      </button>
    </div>`;
}

/* Reinyecta el SDK por si el usuario desactivó el bloqueador */
function reloadPayPalSdk() {
  if (paypalReady()) return;
  const existing = document.getElementById('paypal-sdk-retry');
  if (existing) existing.remove();
  window.PAYPAL_LOAD_FAILED = false;
  const s = document.createElement('script');
  s.id = 'paypal-sdk-retry';
  s.src = PAYPAL_SDK_URL;
  s.onerror = function () { window.PAYPAL_LOAD_FAILED = true; };
  s.onload  = function () { if (_ppLastMount) _mountPayPal(_ppLastMount.containerId, _ppLastMount.build); };
  document.head.appendChild(s);
}

/* Montador genérico con espera limitada y fallback */
function _mountPayPal(containerId, build) {
  const container = document.getElementById(containerId);
  if (!container) return;

  _ppLastMount = { containerId, build };
  container.innerHTML = paypalLoadingHTML();

  const startedAt = Date.now();

  (function attempt() {
    const el = document.getElementById(containerId);
    if (!el) return; // el modal se cerró

    if (paypalReady()) {
      el.innerHTML = '';
      try {
        build().render('#' + containerId);
      } catch (e) {
        console.warn('[MCPE Store] PayPal no pudo renderizar el botón:', e);
        el.innerHTML = paypalFallbackHTML();
      }
      return;
    }

    // ¿Falló la carga o se agotó el tiempo?
    if (window.PAYPAL_LOAD_FAILED || (Date.now() - startedAt) > PAYPAL_MAX_WAIT_MS) {
      el.innerHTML = paypalFallbackHTML();
      return;
    }

    setTimeout(attempt, 350);
  })();
}

/* Botón "Reintentar" del aviso */
function retryPayPal() {
  if (!_ppLastMount) return;
  const el = document.getElementById(_ppLastMount.containerId);
  if (el) el.innerHTML = paypalLoadingHTML('Reintentando…');
  if (!paypalReady()) reloadPayPalSdk();
  _mountPayPal(_ppLastMount.containerId, _ppLastMount.build);
}
window.retryPayPal = retryPayPal;

/* ============================================================
   COMPRA DE UN ADD-ON
   ============================================================ */
function renderPayPalButton(addon) {
  _mountPayPal('paypal-button-container', function () {
    const price = parseFloat(addon.price).toFixed(2);
    return paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay', height: 45 },

      createOrder: function (data, actions) {
        return actions.order.create({
          purchase_units: [{
            description: `MCPE Add-on: ${addon.name}`,
            amount: {
              value: price, currency_code: 'USD',
              breakdown: { item_total: { currency_code: 'USD', value: price } }
            },
            items: [{
              name: addon.name,
              unit_amount: { currency_code: 'USD', value: price },
              quantity: '1', category: 'DIGITAL_GOODS'
            }]
          }],
          application_context: { shipping_preference: 'NO_SHIPPING', brand_name: 'MCPE Addons Store' }
        });
      },

      onApprove: function (data, actions) {
        return actions.order.capture().then(function (details) {
          showToast(`¡Pago completado! Gracias, ${details.payer.name.given_name}!`, 'success');
          savePurchase(addon, details);

          const addons = DB.get(DB_KEYS.ADDONS);
          const idx = addons.findIndex(a => a.id === addon.id);
          if (idx !== -1) {
            addons[idx].purchases = (addons[idx].purchases || 0) + 1;
            DB.set(DB_KEYS.ADDONS, addons);
          }
          renderAddonAction(addon, false);
        });
      },

      onCancel: function () { showToast('Pago cancelado. No se ha cobrado nada.', 'warning'); },
      onError:  function (err) { console.error('PayPal Error:', err); showToast('Error en el pago. Por favor intenta de nuevo.', 'error'); }
    });
  });
}
window.renderPayPalButton = renderPayPalButton;

/* ============================================================
   PAGO DE PLANES (Creator / Pro)
   ============================================================ */
function renderPlanPayPalButton(plan) {
  _mountPayPal('plan-paypal-container', function () {
    const price = parseFloat(plan.price).toFixed(2);
    return paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'subscribe', height: 45 },

      createOrder: function (data, actions) {
        return actions.order.create({
          purchase_units: [{
            description: `Plan ${plan.name} - MCPE Addons Store (1 mes)`,
            amount: {
              value: price, currency_code: 'USD',
              breakdown: { item_total: { currency_code: 'USD', value: price } }
            },
            items: [{
              name: `Plan ${plan.name} (mensual)`,
              unit_amount: { currency_code: 'USD', value: price },
              quantity: '1', category: 'DIGITAL_GOODS'
            }]
          }],
          application_context: { shipping_preference: 'NO_SHIPPING', brand_name: 'MCPE Addons Store' }
        });
      },

      onApprove: function (data, actions) {
        return actions.order.capture().then(function (details) {
          if (typeof activatePlanAfterPayment === 'function') {
            activatePlanAfterPayment(plan, details);
          }
        });
      },

      onCancel: function () { showToast('Pago cancelado. No se cobró nada.', 'warning'); },
      onError:  function (err) { console.error('PayPal Plan Error:', err); showToast('Error en el pago. Intenta de nuevo.', 'error'); }
    });
  });
}
window.renderPlanPayPalButton = renderPlanPayPalButton;
