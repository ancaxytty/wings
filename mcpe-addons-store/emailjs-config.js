/* ============================================================
   MCPE ADDONS STORE - EmailJS (correos con diseño propio)
   ------------------------------------------------------------
   EmailJS permite ENVIAR correos con tu plantilla/CSS desde la
   web, sin backend. Lo usamos para:
     - Correo de BIENVENIDA al registrarse
     - Formulario de CONTACTO / suscripción

   NOTA: el correo de RECUPERACIÓN de contraseña lo sigue
   enviando Firebase (por seguridad, el enlace de reseteo solo
   lo puede generar Firebase).

   ------------------------------------------------------------
   CÓMO CONFIGURARLO (gratis, ~5 min):
   1. Crea una cuenta en https://www.emailjs.com
   2. "Email Services" -> Add Service (Gmail u otro) -> copia el SERVICE ID.
   3. "Email Templates" -> crea 2 plantillas:
      a) Bienvenida -> copia su TEMPLATE ID.
      b) Contacto   -> copia su TEMPLATE ID.
      (En el contenido HTML de la plantilla puedes pegar el diseño
       de email-templates/recuperacion.html y usar variables como
       {{to_name}}, {{to_email}}, {{message}}.)
   4. "Account" -> "General/API Keys" -> copia tu PUBLIC KEY.
   5. Pega los 4 valores abajo (reemplaza los "PEGA_TU_...").

   Variables que enviamos a las plantillas:
     {{to_name}}, {{to_email}}, {{message}}, {{from_name}}
   ============================================================ */

'use strict';

const EMAILJS_CONFIG = {
  publicKey:       "GZEP5r7HMiyVRkwiw",
  serviceId:       "PEGA_TU_SERVICE_ID",
  templateWelcome: "PEGA_TU_TEMPLATE_BIENVENIDA",
  templateContact: "PEGA_TU_TEMPLATE_CONTACTO"
};

// ¿Está configurado y disponible el SDK?
const EMAILJS_READY =
  typeof emailjs !== 'undefined' &&
  EMAILJS_CONFIG.publicKey &&
  !/PEGA_TU_/i.test(EMAILJS_CONFIG.publicKey) &&
  !/PEGA_TU_/i.test(EMAILJS_CONFIG.serviceId);

if (EMAILJS_READY) {
  try {
    emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
    console.log('%c[MCPE Store] EmailJS listo.', 'color:#10b981;font-weight:bold');
  } catch (e) {
    console.error('[MCPE Store] Error iniciando EmailJS:', e);
  }
} else {
  console.warn('%c[MCPE Store] EmailJS NO configurado: los correos de bienvenida/contacto están desactivados. Completa emailjs-config.js.', 'color:#f59e0b');
}

window.EMAILJS_CONFIG = EMAILJS_CONFIG;
window.EMAILJS_READY = EMAILJS_READY;
