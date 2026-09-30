// Configuration : URL de l'application Web Google Apps Script qui enregistre les formulaires
// dans le Google Sheet « Solhy — Demandes site web » (voir docs/GOOGLE-SHEETS.md).
// Tant qu'elle est vide, les formulaires ouvrent la messagerie de l'internaute.
const SOLHY = { formEndpoint: '' };

// Header au scroll
const header = document.querySelector('header');
const onScroll = () => header.classList.toggle('scrolled', scrollY > 10);
addEventListener('scroll', onScroll, {passive:true}); onScroll();

// Menu mobile
const burger = document.querySelector('.burger'), menu = document.getElementById('menu');
if (burger && menu) {
  burger.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    menu.classList.remove('open'); burger.setAttribute('aria-expanded', false);
  }));
}

// Apparition au scroll
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), {threshold:.12});
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el);
});

// Formulaires : envoi vers Google Sheets (ou messagerie en attendant la configuration)
const form = document.getElementById('contact-form'), note = document.getElementById('form-note');
if (form) form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!form.checkValidity()) { note.textContent = 'Merci de compléter les champs obligatoires (*).'; form.reportValidity(); return; }
  const d = new FormData(form);
  if (d.get('website')) return; // champ piège anti-robots
  const sujet = form.dataset.subject || 'Demande d\'étude';
  const champs = [...d.entries()].filter(([k]) => !['rgpd', 'website'].includes(k));
  if (!SOLHY.formEndpoint) {
    const body = champs.map(([k, v]) => `${k} : ${v}`).join('\n');
    location.href = `mailto:contact@solhyenergie.com?subject=${encodeURIComponent(sujet + ' — ' + (d.get('societe') || d.get('nom')))}&body=${encodeURIComponent(body)}`;
    note.textContent = 'Merci ! Votre messagerie va s\'ouvrir pour finaliser l\'envoi.';
    return;
  }
  const bouton = form.querySelector('button[type=submit]');
  bouton.disabled = true; note.textContent = 'Envoi en cours…';
  const data = new URLSearchParams(champs);
  data.append('formulaire', sujet); data.append('page', location.pathname);
  try {
    await fetch(SOLHY.formEndpoint, { method: 'POST', mode: 'no-cors', body: data });
    form.reset();
    note.textContent = 'Merci, votre demande est bien envoyée. Nous revenons vers vous sous 48 h ouvrées.';
  } catch {
    note.textContent = 'L\'envoi a échoué. Écrivez-nous à contact@solhyenergie.com ou appelez le 01 89 70 37 73.';
  }
  bouton.disabled = false;
});

// Présélection du produit dans un formulaire (liens « Devis volume »)
document.querySelectorAll('[data-produit]').forEach(a => a.addEventListener('click', () => {
  const s = document.getElementById('produit'); if (s) s.value = a.dataset.produit;
}));
const annee = document.getElementById('year'); if (annee) annee.textContent = new Date().getFullYear();
