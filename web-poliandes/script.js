// ===== Año dinámico en el footer =====
document.getElementById('year').textContent = new Date().getFullYear();

// ===== Menú móvil =====
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

// Crear scrim (fondo oscuro) detrás del menú
const scrim = document.createElement('div');
scrim.className = 'nav-scrim';
document.body.appendChild(scrim);

const progDrop = document.getElementById('progDrop');
const progBtn = document.getElementById('progBtn');

function openMenu() {
  nav.classList.add('open');
  navToggle.classList.add('open');
  navToggle.setAttribute('aria-expanded', 'true');
  scrim.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeMenu() {
  nav.classList.remove('open');
  navToggle.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  scrim.classList.remove('show');
  document.body.style.overflow = '';
  if (window.innerWidth <= 900) closeDropdown();
}

navToggle.addEventListener('click', () => {
  nav.classList.contains('open') ? closeMenu() : openMenu();
});
scrim.addEventListener('click', closeMenu);

// ===== Dropdown / acordeón de Programas =====
function openDropdown()  { progDrop.classList.add('open');  progBtn.setAttribute('aria-expanded', 'true'); }
function closeDropdown() { progDrop.classList.remove('open'); progBtn.setAttribute('aria-expanded', 'false'); }

progBtn.addEventListener('click', (e) => {
  e.preventDefault();
  progDrop.classList.contains('open') ? closeDropdown() : openDropdown();
});

// Cerrar dropdown al hacer clic fuera (solo escritorio)
document.addEventListener('click', (e) => {
  if (window.innerWidth > 900 && !progDrop.contains(e.target)) closeDropdown();
});

// Cerrar el menú al hacer clic en cualquier enlace de navegación
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

// Cerrar con tecla Escape y al volver a escritorio
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeDropdown(); } });
window.addEventListener('resize', () => { if (window.innerWidth > 900) { closeMenu(); } });

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
const navLinks = Array.from(nav.querySelectorAll('.nav__link[href]'));

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
