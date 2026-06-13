/* ============================================================
   MCPE ADDONS STORE – PayPal Integration
   Real PayPal Payments with SDK
   ============================================================ */

'use strict';

function renderPayPalButton(addon) {
  const container = document.getElementById('paypal-button-container');
  if (!container) return;
  container.innerHTML = '';

  // Check if PayPal SDK is loaded
  if (typeof paypal === 'undefined') {
    container.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text-muted)">
        <i class="fab fa-paypal" style="font-size:2rem;color:#003087;margin-bottom:8px;display:block"></i>
        <p style="font-size:.85rem">Cargando PayPal...</p>
        <p style="font-size:.75rem;margin-top:4px">Si no carga, refresca la página.</p>
      </div>`;
    // Retry after SDK loads
    setTimeout(() => renderPayPalButton(addon), 2000);
    return;
  }

  const price = parseFloat(addon.price).toFixed(2);

  paypal.Buttons({
    style: {
      layout:  'vertical',
      color:   'gold',
      shape:   'pill',
      label:   'pay',
      height:  45,
    },

    createOrder: function(data, actions) {
      return actions.order.create({
        purchase_units: [{
          description: `MCPE Add-on: ${addon.name}`,
          amount: {
            value:         price,
            currency_code: 'USD',
            breakdown: {
              item_total: { currency_code: 'USD', value: price }
            }
          },
          items: [{
            name:        addon.name,
            unit_amount: { currency_code: 'USD', value: price },
            quantity:    '1',
            category:    'DIGITAL_GOODS'
          }]
        }],
        application_context: {
          shipping_preference: 'NO_SHIPPING',
          brand_name:         'MCPE Addons Store',
        }
      });
    },

    onApprove: function(data, actions) {
      return actions.order.capture().then(function(details) {
        // Payment successful
        showToast(`¡Pago completado! Gracias, ${details.payer.name.given_name}!`, 'success');

        // Save purchase
        savePurchase(addon, details);

        // Increment downloads
        const addons = DB.get(DB_KEYS.ADDONS);
        const idx = addons.findIndex(a => a.id === addon.id);
        if (idx !== -1) {
          addons[idx].purchases = (addons[idx].purchases || 0) + 1;
          DB.set(DB_KEYS.ADDONS, addons);
        }

        // Re-render action area to show download
        renderAddonAction(addon, false);
      });
    },

    onCancel: function(data) {
      showToast('Pago cancelado. No se ha cobrado nada.', 'warning');
    },

    onError: function(err) {
      console.error('PayPal Error:', err);
      showToast('Error en el pago. Por favor intenta de nuevo.', 'error');
    }
  }).render('#paypal-button-container');
}

// Expose globally
window.renderPayPalButton = renderPayPalButton;

/* ============================================================
   PAGO DE PLANES (Creator / Pro) con PayPal
   ============================================================ */
function renderPlanPayPalButton(plan) {
  const container = document.getElementById('plan-paypal-container');
  if (!container) return;
  container.innerHTML = '';

  if (typeof paypal === 'undefined') {
    container.innerHTML = `
      <div style="text-align:center;padding:18px;color:var(--text-muted)">
        <i class="fab fa-paypal" style="font-size:1.8rem;color:#003087;display:block;margin-bottom:6px"></i>
        <p style="font-size:.82rem">Cargando PayPal…</p>
      </div>`;
    setTimeout(() => renderPlanPayPalButton(plan), 2000);
    return;
  }

  const price = parseFloat(plan.price).toFixed(2);

  paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'subscribe', height: 45 },
    createOrder: function(data, actions) {
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
    onApprove: function(data, actions) {
      return actions.order.capture().then(function(details) {
        if (typeof activatePlanAfterPayment === 'function') {
          activatePlanAfterPayment(plan, details);
        }
      });
    },
    onCancel: function() { showToast('Pago cancelado. No se cobró nada.', 'warning'); },
    onError:  function(err) { console.error('PayPal Plan Error:', err); showToast('Error en el pago. Intenta de nuevo.', 'error'); }
  }).render('#plan-paypal-container');
}

window.renderPlanPayPalButton = renderPlanPayPalButton;
