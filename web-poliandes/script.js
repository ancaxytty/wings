// ===== Año dinámico en el footer =====
document.getElementById('year').textContent = new Date().getFullYear();

// ===== Menú móvil =====
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

// Crear scrim (fondo oscuro) detrás del menú
const scrim = document.createElement('div');
scrim.className = 'nav-scrim';
document.body.appendChild(scrim);

function openMenu() {
  nav.classList.add('open');
  navToggle.classList.add('open');
  scrim.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeMenu() {
  nav.classList.remove('open');
  navToggle.classList.remove('open');
  scrim.classList.remove('show');
  document.body.style.overflow = '';
}

navToggle.addEventListener('click', () => {
  nav.classList.contains('open') ? closeMenu() : openMenu();
});
scrim.addEventListener('click', closeMenu);

// Cerrar menú al hacer clic en un enlace
nav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', closeMenu);
});

// Cerrar con tecla Escape y al volver a escritorio
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('resize', () => { if (window.innerWidth > 760) closeMenu(); });

// ===== Animación reveal al hacer scroll =====
const revealEls = document.querySelectorAll('[data-reveal]');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
revealEls.forEach(el => io.observe(el));

// ===== Envío de formularios por WhatsApp =====
const WHATSAPP_NUMBER = '573203023272';

function sendToWhatsApp(data) {
  let msg = '¡Hola Politécnico de los Andes! Quiero más información.%0A%0A';
  if (data.nombre)   msg += `*Nombre:* ${encodeURIComponent(data.nombre)}%0A`;
  if (data.telefono) msg += `*Teléfono:* ${encodeURIComponent(data.telefono)}%0A`;
  if (data.programa) msg += `*Programa:* ${encodeURIComponent(data.programa)}%0A`;
  if (data.mensaje)  msg += `*Mensaje:* ${encodeURIComponent(data.mensaje)}%0A`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
}

function handleForm(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    sendToWhatsApp(Object.fromEntries(fd.entries()));
    form.reset();
  });
}

handleForm('heroForm');
handleForm('contactForm');

// ===== Sombra dinámica del header al hacer scroll =====
const header = document.querySelector('.header');
window.addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 10
    ? '0 10px 30px -18px rgba(20,70,110,.5)'
    : 'none';
});

// ===== Scrollspy: resaltar la sección activa en el menú =====
const sections = ['inicio', 'programas', 'ventajas', 'proceso', 'contacto']
  .map(id => document.getElementById(id))
  .filter(Boolean);
const navLinks = Array.from(nav.querySelectorAll('a:not(.btn)'));

const spy = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
      });
    }
  });
}, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

sections.forEach(sec => spy.observe(sec));
