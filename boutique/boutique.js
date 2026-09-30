// Boutique Solhy Éclairage LED : panier, paiement Stripe, filtres, fiche produit, calculateur, pixel Meta.
// Le catalogue (window.CATALOGUE) est généré par tools/pages.py dans catalogue.js.
const CONFIG = {
  // Script Google (le même que pour les formulaires, voir assets/main.js) : crée la session de paiement Stripe.
  checkoutEndpoint: (typeof SOLHY !== 'undefined' && SOLHY.formEndpoint) || '',
  metaPixelId: '1058769532359912',   // pixel Meta déjà utilisé par Solhy
  tva: 0.20,
  co2ParKwh: 0.052,                  // kg CO2e par kWh, électricité mix moyen France (Base Empreinte ADEME)
  livraisonOfferteDes: 12,           // nombre de luminaires à partir duquel la livraison est offerte
  fraisLivraisonHT: 15.90,           // livraison sous ce seuil, par commande (même valeur que FRAIS_LIVRAISON_HT du script)
};
const C = window.CATALOGUE || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const euro = n => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const nombre = (n, d = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: d });
const lire = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

/* ---------- Consentement et pixel Meta (chargé uniquement après accord) ---------- */
const CONSENT_KEY = 'solhy-consent', SIX_MOIS = 182 * 864e5;
const consentement = () => { const c = lire(CONSENT_KEY); return c && Date.now() - c.t < SIX_MOIS ? c.v : null; };
function chargerPixel() {
  if (window.fbq || !CONFIG.metaPixelId) return;
  const f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
  if (!window._fbq) window._fbq = f;
  f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
  const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/fr_FR/fbevents.js';
  document.head.appendChild(s);
  fbq('init', CONFIG.metaPixelId); fbq('track', 'PageView');
  evenementsPage();
}
const suivre = (ev, data) => { if (window.fbq) fbq('track', ev, data); };
const banniere = $('#consent');
function montrerBanniere(oui) {
  if (!banniere) return;
  banniere.hidden = !oui;
  document.body.classList.toggle('consent-open', oui);
  if (oui) document.body.style.setProperty('--consent-h', banniere.offsetHeight + 'px');
}
$$('[data-consent]').forEach(b => b.addEventListener('click', () => {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: b.dataset.consent, t: Date.now() }));
  montrerBanniere(false);
  if (b.dataset.consent === 'oui') chargerPixel();
}));
$$('[data-cookies]').forEach(b => b.addEventListener('click', () => montrerBanniere(true)));

/* ---------- Panier (enregistré dans le navigateur) ---------- */
const CART_KEY = 'solhy-panier';
let panier = (() => { const c = lire(CART_KEY) || {}; for (const k in c) if (!C[k] || !(c[k] > 0)) delete c[k]; return c; })();
const lignes = () => Object.entries(panier).map(([slug, qte]) => ({ slug, qte, p: C[slug] }));
const nbArticles = () => lignes().reduce((s, l) => s + l.qte, 0);
const nbLuminaires = () => lignes().reduce((s, l) => s + l.qte * l.p.lot, 0);
function totaux() {
  const ht = lignes().reduce((s, l) => s + l.p.cents * l.qte, 0);
  const port = ht && nbLuminaires() < CONFIG.livraisonOfferteDes ? Math.round(CONFIG.fraisLivraisonHT * 100) : 0;
  const tva = lignes().reduce((s, l) => s + Math.round(l.p.cents * l.qte * CONFIG.tva), 0) + Math.round(port * CONFIG.tva); // TVA par ligne, comme Stripe
  return { ht: ht / 100, port: port / 100, tva: tva / 100, ttc: (ht + port + tva) / 100 };
}
function enregistrer() { localStorage.setItem(CART_KEY, JSON.stringify(panier)); afficher(); }
function ajouter(slug, qte = 1) {
  if (!C[slug]) return;
  panier[slug] = Math.min((panier[slug] || 0) + qte, 999);
  enregistrer();
  suivre('AddToCart', { content_ids: [slug], content_type: 'product', value: C[slug].prix * qte, currency: 'EUR' });
  $$('.cart-count').forEach(e => { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); });
  ouvrir();
}
function changer(slug, qte) { if (qte <= 0) delete panier[slug]; else panier[slug] = Math.min(qte, 999); enregistrer(); }

const tiroir = $('#cart'), voile = $('.cart-overlay');
function afficher() {
  const n = nbArticles();
  $$('.cart-count').forEach(e => { e.textContent = n; e.hidden = !n; });
  if (!tiroir) return;
  tiroir.classList.toggle('is-empty', !n);
  $('.cart-items', tiroir).innerHTML = lignes().map(({ slug, qte, p }) => `
    <li class="ci">
      <img src="${p.img}" alt="" width="84" height="63">
      <div><a href="${p.url}">${p.nom}</a><span class="ci-unit">${euro(p.prix)} HT / ${p.lot > 1 ? `carton (${euro(p.prixUnite)} / ${p.unite})` : 'unité'}</span>
        <div class="qty"><button type="button" data-set="${slug}" data-d="-1" aria-label="Retirer une unité">−</button><span>${qte}</span><button type="button" data-set="${slug}" data-d="1" aria-label="Ajouter une unité">+</button></div>
      </div>
      <div class="ci-end"><strong>${euro(p.prix * qte)}</strong><button type="button" class="ci-del" data-del="${slug}">Retirer</button></div>
    </li>`).join('');
  const t = totaux(), lum = nbLuminaires(), seuil = CONFIG.livraisonOfferteDes, manque = Math.max(0, seuil - lum);
  $('[data-ship]', tiroir).innerHTML = manque
    ? `Plus que <strong>${manque} luminaire${manque > 1 ? 's' : ''}</strong> pour la livraison offerte<span class="ship-bar"><i style="width:${Math.round(100 * lum / seuil)}%"></i></span>`
    : '<strong>Livraison offerte</strong> sur cette commande<span class="ship-bar"><i style="width:100%"></i></span>';
  $('[data-livraison]', tiroir).textContent = manque ? `${euro(t.port)} HT` : 'Offerte';
  $('[data-ht]', tiroir).textContent = euro(t.ht);
  $('[data-tva]', tiroir).textContent = euro(t.tva);
  $('[data-ttc]', tiroir).textContent = euro(t.ttc);
  $('.cart-msg', tiroir).hidden = true;
}

let focusAvant = null;
function ouvrir() {
  if (!tiroir) return;
  focusAvant = document.activeElement;
  tiroir.classList.add('open'); tiroir.setAttribute('aria-hidden', 'false'); tiroir.inert = false;
  voile.hidden = false; document.body.classList.add('no-scroll');
  $$('.cart-btn').forEach(b => b.setAttribute('aria-expanded', 'true'));
  $('.cart-close', tiroir).focus();
}
function fermer() {
  if (!tiroir || !tiroir.classList.contains('open')) return;
  tiroir.classList.remove('open'); tiroir.setAttribute('aria-hidden', 'true'); tiroir.inert = true;
  voile.hidden = true; document.body.classList.remove('no-scroll');
  $$('.cart-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
  if (focusAvant) focusAvant.focus();
}
if (tiroir) {
  tiroir.inert = true;
  document.addEventListener('keydown', e => {
    if (!tiroir.classList.contains('open')) return;
    if (e.key === 'Escape') fermer();
    if (e.key === 'Tab') { // garde le focus dans le panier ouvert
      const f = $$('a[href],button:not([disabled])', tiroir).filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
}

/* ---------- Paiement : session Stripe Checkout créée par le serveur ---------- */
async function payer(bouton, articles = lignes().map(({ slug, qte }) => ({ slug, qty: qte }))) {
  if (!articles.length) return;
  const libelle = bouton.innerHTML;
  bouton.disabled = true; bouton.setAttribute('aria-busy', 'true'); bouton.textContent = 'Redirection vers le paiement…';
  const valeur = articles.reduce((s, a) => s + C[a.slug].prix * a.qty, 0);
  suivre('InitiateCheckout', { value: valeur, currency: 'EUR', num_items: articles.reduce((s, a) => s + a.qty, 0), content_ids: articles.map(a => a.slug) });
  try {
    if (!CONFIG.checkoutEndpoint) throw new Error('Paiement non configuré');
    // Corps en texte brut : requête « simple », sans pré-vérification CORS, acceptée par Google Apps Script.
    const r = await fetch(CONFIG.checkoutEndpoint, { method: 'POST', body: JSON.stringify({ action: 'checkout', items: articles }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || 'Paiement indisponible');
    localStorage.setItem('solhy-commande', JSON.stringify({ value: valeur, ids: articles.map(a => a.slug) }));
    location.href = d.url;
  } catch {
    bouton.disabled = false; bouton.removeAttribute('aria-busy'); bouton.innerHTML = libelle;
    articles.forEach(a => { panier[a.slug] = a.qty; }); enregistrer(); // quantité fixée, jamais cumulée
    ouvrir();
    $('.cart-msg', tiroir).hidden = false;
  }
}

/* ---------- Actions (délégation) ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.matches('[data-add]')) ajouter(t.dataset.add);
  else if (t.matches('[data-set]')) {
    const { set, d } = t.dataset;
    changer(set, (panier[set] || 0) + Number(d));
    const meme = $(`[data-set="${set}"][data-d="${d}"]`, tiroir); (meme || $('.cart-close', tiroir)).focus(); // garde le focus après mise à jour
  }
  else if (t.matches('[data-del]')) changer(t.dataset.del, 0);
  else if (t.matches('.cart-btn')) ouvrir();
  else if (t.matches('.cart-close, [data-close]')) fermer();
  else if (t.matches('[data-checkout]')) { if (paiementActif) payer(t); else devisPanier(e); }
  else if (t.matches('[data-devis]')) devisPanier(e);
  else if (t.matches('[data-devis-produit]')) sessionStorage.setItem('solhy-devis', JSON.stringify({ produit: t.dataset.devisProduit }));
});
voile && voile.addEventListener('click', fermer);

function devisPanier(e) { // panier transmis au formulaire de devis
  sessionStorage.setItem('solhy-devis', JSON.stringify({
    qte: lignes().reduce((s, l) => s + l.qte * l.p.lot, 0),
    texte: 'Panier : ' + lignes().map(l => `${l.qte} × ${l.p.nom}`).join(', ') + ` (total ${euro(totaux().ht)} HT)`,
  }));
  fermer();
  if ($('#devis')) { e.preventDefault(); preRemplirDevis(); $('#devis').scrollIntoView(); }
  else if (!e.target.closest('a')) location.href = 'index.html#devis';
}

function preRemplirDevis() {
  const d = JSON.parse(sessionStorage.getItem('solhy-devis') || 'null'), form = $('#contact-form');
  if (!d || !form) return;
  sessionStorage.removeItem('solhy-devis');
  if (d.produit) form.produit.value = d.produit;
  if (d.texte) { form.produit.value = 'Plusieurs produits'; form.quantite.value = d.qte; form.message.value = d.texte; }
}
preRemplirDevis();

/* ---------- Filtres de la collection ---------- */
function filtrer(cat) {
  $$('#produits .pcard').forEach(c => { c.hidden = cat !== 'tous' && c.dataset.cat !== cat; });
  $$('.filters [data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === cat)));
}
$$('[data-filter]').forEach(b => b.addEventListener('click', () => filtrer(b.dataset.filter)));

/* ---------- Fiche produit ---------- */
const fiche = $('[data-pdp]');
if (fiche) {
  const slug = fiche.dataset.pdp, champ = $('#qty');
  const qte = () => Math.min(999, Math.max(1, parseInt(champ.value, 10) || 1));
  $$('[data-step]').forEach(b => b.addEventListener('click', () => { champ.value = Math.min(999, Math.max(1, qte() + Number(b.dataset.step))); }));
  champ.addEventListener('change', () => { champ.value = qte(); });
  $$('[data-add-pdp]').forEach(b => b.addEventListener('click', () => ajouter(slug, qte())));
  $('[data-buy-now]').addEventListener('click', e => payer(e.currentTarget, [{ slug, qty: qte() }]));
  $$('.thumbs button').forEach(b => b.addEventListener('click', () => {
    const img = $('.gallery-main img'); img.src = b.dataset.src; img.alt = b.dataset.alt;
    $$('.thumbs button').forEach(x => x.setAttribute('aria-current', String(x === b)));
  }));
  const barre = $('.sticky-atc'), achat = $('.pdp-buy');
  const majBarre = () => { // barre d'achat fixe dès que le bouton principal est passé au-dessus de l'écran
    const visible = achat.getBoundingClientRect().bottom < 0;
    barre.classList.toggle('show', visible); barre.setAttribute('aria-hidden', String(!visible));
    $('button', barre).tabIndex = visible ? 0 : -1;
  };
  if (barre && achat) { addEventListener('scroll', majBarre, { passive: true }); majBarre(); }
}
const eta = $('[data-eta]');
if (eta) {
  const ouvres = n => { const d = new Date(); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } return d; };
  const f = d => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  eta.textContent = `Livraison estimée entre le ${f(ouvres(2))} et le ${f(ouvres(5))}`;
}

/* ---------- Calculateur d'économies ---------- */
const calc = $('#calc');
if (calc) {
  const BORNES = { nombre: [1, 999], puissance: [0, 100000], heures: [0, 24], jours: [0, 365], prix: [0, 10] };
  const v = n => { const [a, b] = BORNES[n]; return Math.min(b, Math.max(a, parseFloat(String(calc.elements[n].value).replace(',', '.')) || 0)); };
  const out = k => $(`[data-out="${k}"]`, calc);
  const plur = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const choix = () => { const p = C[calc.elements.produit.value], n = Math.round(v('nombre')); return { p, n, cartons: Math.ceil(n / p.lot) }; };
  const maj = () => {
    const { p, n, cartons } = choix();
    const kwh = n * (v('puissance') - p.pnew) * v('heures') * v('jours') / 1000;
    const eur = kwh * v('prix'), invest = cartons * p.prix;
    if (kwh <= 0) ['kwh', 'eur', 'roi', 'co2'].forEach(k => { out(k).textContent = '—'; });
    else {
      out('kwh').textContent = nombre(kwh);
      out('eur').textContent = `${nombre(Math.round(eur))} €`;
      const mois = eur > 0 ? invest / (eur / 12) : null;
      out('roi').textContent = mois === null ? '—' : mois < 1 ? '< 1 mois' : mois < 24 ? `${nombre(Math.ceil(mois))} mois` : `${nombre(mois / 12, 1)} ans`;
      const co2 = kwh * CONFIG.co2ParKwh;
      out('co2').textContent = co2 >= 1000 ? `${nombre(co2 / 1000, 1)} t` : `${nombre(co2)} kg`;
    }
    out('cta').textContent = p.lot > 1
      ? `Ajouter ${plur(cartons, 'carton')} (${cartons * p.lot} ${p.unite}s) au panier`
      : `Ajouter ${plur(n, p.unite)} au panier`;
  };
  calc.elements.produit.addEventListener('change', () => { calc.elements.puissance.value = C[calc.elements.produit.value].pold; maj(); });
  calc.addEventListener('input', maj);
  calc.addEventListener('change', e => { if (BORNES[e.target.name]) { e.target.value = String(v(e.target.name)).replace('.', ','); maj(); } });
  calc.addEventListener('submit', e => e.preventDefault());
  $('[data-calc-add]', calc).addEventListener('click', () => { const { p, n, cartons } = choix(); ajouter(calc.elements.produit.value, p.lot > 1 ? cartons : n); });
  maj();
}

/* ---------- Comparateur avant / après ---------- */
$$('.ba-range').forEach(r => r.addEventListener('input', () => r.closest('.ba').style.setProperty('--pos', r.value + '%')));

/* ---------- Événements de page (après consentement) ---------- */
const commande = $('[data-merci]') ? lire('solhy-commande') : null;
if ($('[data-merci]')) {
  panier = {}; enregistrer(); localStorage.removeItem('solhy-commande');
  // Prévient le script Google : il vérifie le paiement auprès de Stripe puis prépare la commande fournisseur.
  const session = new URLSearchParams(location.search).get('session_id');
  if (session && CONFIG.checkoutEndpoint) fetch(CONFIG.checkoutEndpoint, { method: 'POST', body: JSON.stringify({ action: 'confirmation', session }) }).catch(() => {});
}
function evenementsPage() {
  if (fiche) suivre('ViewContent', { content_ids: [fiche.dataset.pdp], content_type: 'product', value: C[fiche.dataset.pdp].prix, currency: 'EUR' });
  if (commande) suivre('Purchase', { value: commande.value, currency: 'EUR', content_ids: commande.ids, content_type: 'product' });
}

const paiementActif = Boolean(CONFIG.checkoutEndpoint);
if (!paiementActif) { // tant que le paiement n'est pas branché : pas de promesse de paiement en ligne
  document.body.classList.add('sans-paiement');
  $$('[data-checkout]').forEach(b => { b.textContent = 'Demander un devis pour ce panier'; });
}
afficher();
const params = new URLSearchParams(location.search);
if (params.get('ajouter') && C[params.get('ajouter')]) { ajouter(params.get('ajouter')); history.replaceState(null, '', location.pathname + location.hash); }
else if (params.has('panier')) ouvrir();
if (consentement() === 'oui') chargerPixel(); else if (consentement() === null) montrerBanniere(true);
