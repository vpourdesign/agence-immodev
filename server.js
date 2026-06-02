const express = require('express');
const path = require('path');
const fs = require('fs');
const { scrapeListing } = require('./scraper');
const { generatePDF } = require('./pdf-generator');
const { scrapeAllListings, clearCache } = require('./listings-scraper');

const app = express();
const PORT = process.env.PORT || 3005;

// Create output directory
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/output', express.static(OUTPUT_DIR));
app.use('/assets', express.static(__dirname));

// Simple HTML form
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Immodev — Générateur PDF</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Roboto', sans-serif;
      background: #0a0a0a;
      color: #e5e2e1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .wrapper {
      width: 100%;
      max-width: 520px;
      padding: 32px;
    }
    .logo { margin-bottom: 48px; }
    .logo img { height: 48px; opacity: 0.95; }
    h1 {
      font-family: 'Roboto', sans-serif;
      font-size: 32px;
      font-weight: 700;
      color: white;
      letter-spacing: -0.03em;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: rgba(255,255,255,0.4);
      margin-bottom: 48px;
      letter-spacing: 0.02em;
    }
    .field { margin-bottom: 24px; }
    .field-label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #e9c349;
      text-transform: uppercase;
      letter-spacing: 0.3em;
      margin-bottom: 10px;
    }
    .field-input {
      width: 100%;
      padding: 16px 20px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: white;
      font-size: 15px;
      font-family: 'Roboto', sans-serif;
      outline: none;
      transition: border-color 0.3s, background 0.3s;
    }
    .field-input::placeholder { color: rgba(255,255,255,0.25); }
    .field-input:focus {
      border-color: #e9c349;
      background: rgba(233,195,73,0.05);
    }
    .lang-row {
      display: flex;
      gap: 16px;
      margin-top: 6px;
    }
    .lang-option {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 14px;
      color: rgba(255,255,255,0.6);
      transition: color 0.2s;
    }
    .lang-option:hover { color: white; }
    .lang-option input[type="radio"] {
      width: auto;
      accent-color: #e9c349;
    }
    .btn {
      width: 100%;
      padding: 18px;
      background: #e9c349;
      color: #1a1a00;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 700;
      font-family: 'Roboto', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      cursor: pointer;
      margin-top: 32px;
      transition: background 0.3s, transform 0.2s;
    }
    .btn:hover { background: #d4af3a; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .btn:disabled { background: #444; color: #888; cursor: wait; transform: none; }
    #status {
      margin-top: 24px;
      font-size: 13px;
      color: rgba(255,255,255,0.5);
      letter-spacing: 0.02em;
    }
    #result { margin-top: 16px; }
    #result a {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: #e9c349;
      font-weight: 700;
      font-size: 15px;
      text-decoration: none;
      padding: 14px 24px;
      border: 1px solid rgba(233,195,73,0.3);
      border-radius: 6px;
      transition: background 0.3s, border-color 0.3s;
    }
    #result a:hover {
      background: rgba(233,195,73,0.08);
      border-color: #e9c349;
    }
    .divider {
      width: 48px;
      height: 2px;
      background: #e9c349;
      margin-bottom: 32px;
      opacity: 0.6;
    }
    .footer {
      margin-top: 64px;
      font-size: 11px;
      color: rgba(255,255,255,0.2);
      text-transform: uppercase;
      letter-spacing: 0.2em;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">
      <img src="/assets/logo-blanc.png" alt="IMMODEV">
    </div>
    <div class="divider"></div>
    <h1>Générateur PDF</h1>
    <p class="subtitle">Commercial &amp; Industriel — Fiches propriétés professionnelles</p>

    <form id="form">
      <div class="field">
        <label class="field-label" for="url">Lien de la propriété</label>
        <input class="field-input" type="url" id="url" name="url" placeholder="https://www.immodev.ca/proprietes/..." required>
      </div>
      <div class="field">
        <label class="field-label">Langue du PDF</label>
        <div class="lang-row">
          <label class="lang-option">
            <input type="radio" name="lang" value="fr" checked> Français
          </label>
          <label class="lang-option">
            <input type="radio" name="lang" value="en"> English
          </label>
        </div>
      </div>
      <button class="btn" type="submit" id="btn">Générer le PDF</button>
    </form>
    <div id="status"></div>
    <div id="result"></div>
    <div class="footer">© 2026 IMMODEV Agence Immobilière</div>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn');
      const status = document.getElementById('status');
      const result = document.getElementById('result');
      const url = document.getElementById('url').value;
      const lang = document.querySelector('input[name="lang"]:checked').value;

      btn.disabled = true;
      btn.textContent = 'GÉNÉRATION EN COURS...';
      status.textContent = 'Scraping de la propriété et génération du PDF...';
      result.innerHTML = '';

      try {
        const res = await fetch('/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, lang }),
        });
        const data = await res.json();
        if (data.success) {
          status.textContent = '';
          result.innerHTML = '<a href="' + data.pdfUrl + '" target="_blank">📄 Télécharger le PDF</a>';
        } else {
          status.textContent = 'Erreur: ' + data.error;
        }
      } catch (err) {
        status.textContent = 'Erreur: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'GÉNÉRER LE PDF';
      }
    });
  </script>
</body>
</html>`);

});

// Generate PDF endpoint
app.post('/generate', async (req, res) => {
  const { url, lang } = req.body;

  if (!url) {
    return res.json({ success: false, error: 'URL invalide' });
  }

  // Convert URL to match requested language
  let scrapeUrl = url;
  if (lang === 'en') {
    // Convert FR URL to EN: /proprietes/ -> /en/listings/
    scrapeUrl = scrapeUrl.replace('/proprietes/', '/en/listings/');
    scrapeUrl = scrapeUrl.replace('/fr/', '/en/');
    if (!scrapeUrl.includes('/en/')) {
      scrapeUrl = scrapeUrl.replace('immodev.ca/', 'immodev.ca/en/listings/');
    }
  } else {
    // Convert EN URL to FR: /en/listings/ -> /proprietes/
    scrapeUrl = scrapeUrl.replace('/en/listings/', '/proprietes/');
  }

  try {
    console.log('Scraping:', scrapeUrl, '(lang:', lang, ')');
    const data = await scrapeListing(scrapeUrl);
    data.lang = lang || 'fr';

    const timestamp = Date.now();
    const filename = `immodev-${timestamp}.pdf`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    console.log('Generating PDF...');
    await generatePDF(data, outputPath);

    console.log('PDF generated:', outputPath);
    res.json({ success: true, pdfUrl: `/output/${filename}` });
  } catch (err) {
    console.error('Error:', err);
    res.json({ success: false, error: err.message });
  }
});

// =============================================
// DASHBOARD — Property grid with broker filter
// =============================================

// API: get all listings (cached 24h)
app.get('/api/listings', async (req, res) => {
  try {
    const data = await scrapeAllListings();
    res.json(data);
  } catch (err) {
    console.error('Listings scrape error:', err);
    res.json({ error: err.message, listings: [], brokers: [] });
  }
});

// API: force refresh
app.post('/api/listings/refresh', async (req, res) => {
  clearCache();
  try {
    const data = await scrapeAllListings();
    res.json(data);
  } catch (err) {
    res.json({ error: err.message, listings: [], brokers: [] });
  }
});

// Dashboard page
app.get('/dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Immodev — Tableau de bord</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@400&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Roboto', sans-serif;
      background: #0a0a0a;
      color: #e5e2e1;
      min-height: 100vh;
    }

    /* Header */
    .header {
      position: sticky; top: 0; z-index: 100;
      background: rgba(10,10,10,0.92);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding: 20px 40px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .header-left { display: flex; align-items: center; gap: 24px; }
    .header img { height: 40px; opacity: 0.95; }
    .header-divider { width: 1px; height: 32px; background: rgba(255,255,255,0.1); }
    .header h1 { font-size: 18px; font-weight: 500; color: rgba(255,255,255,0.7); letter-spacing: 0.05em; }
    .header-right { display: flex; align-items: center; gap: 16px; }
    .header-stats {
      font-size: 12px; color: rgba(255,255,255,0.35);
      letter-spacing: 0.1em; text-transform: uppercase;
    }

    /* Filter bar */
    .filter-bar {
      padding: 20px 40px;
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .filter-label {
      font-size: 11px; font-weight: 700; color: #e9c349;
      text-transform: uppercase; letter-spacing: 0.3em;
    }
    .filter-select {
      padding: 10px 16px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
      color: white;
      font-size: 14px;
      font-family: 'Roboto', sans-serif;
      outline: none;
      cursor: pointer;
      min-width: 220px;
      transition: border-color 0.3s;
    }
    .filter-select:focus { border-color: #e9c349; }
    .filter-select option { background: #1a1a1a; color: white; }
    .lang-toggle {
      display: flex; gap: 0; margin-left: auto;
    }
    .lang-btn {
      padding: 10px 18px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.5);
      font-size: 12px;
      font-weight: 700;
      font-family: 'Roboto', sans-serif;
      letter-spacing: 0.15em;
      cursor: pointer;
      transition: all 0.2s;
    }
    .lang-btn:first-child { border-radius: 4px 0 0 4px; }
    .lang-btn:last-child { border-radius: 0 4px 4px 0; border-left: none; }
    .lang-btn.active {
      background: #e9c349;
      color: #1a1a00;
      border-color: #e9c349;
    }

    .btn-refresh {
      padding: 10px 20px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      color: rgba(255,255,255,0.5);
      font-size: 12px;
      font-weight: 500;
      font-family: 'Roboto', sans-serif;
      letter-spacing: 0.1em;
      cursor: pointer;
      display: flex; align-items: center; gap: 8px;
      transition: all 0.2s;
    }
    .btn-refresh:hover { border-color: #e9c349; color: #e9c349; }
    .btn-refresh .material-symbols-outlined { font-size: 16px; }

    /* Grid */
    .grid-container { padding: 32px 40px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }

    /* Card */
    .card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 6px;
      overflow: hidden;
      transition: border-color 0.3s, transform 0.2s;
    }
    .card:hover {
      border-color: rgba(233,195,73,0.3);
      transform: translateY(-2px);
    }
    .card-img {
      width: 100%;
      aspect-ratio: 16/10;
      object-fit: cover;
      display: block;
      filter: brightness(0.9);
      transition: filter 0.3s;
    }
    .card:hover .card-img { filter: brightness(1); }
    .card-body { padding: 20px; }
    .card-price {
      font-size: 14px;
      font-weight: 700;
      color: #e9c349;
      margin-bottom: 8px;
      letter-spacing: 0.02em;
    }
    .card-address {
      font-size: 17px;
      font-weight: 700;
      color: white;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .card-city {
      font-size: 13px;
      color: rgba(255,255,255,0.4);
      margin-top: 4px;
    }
    .card-meta {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .card-brokers {
      display: flex; gap: 6px;
    }
    .card-broker-avatar {
      width: 28px; height: 28px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .card-broker-name {
      font-size: 11px;
      color: rgba(255,255,255,0.35);
      letter-spacing: 0.05em;
    }
    .card-transaction {
      font-size: 10px;
      font-weight: 700;
      color: #0a0a0a;
      background: #e9c349;
      padding: 4px 10px;
      border-radius: 3px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .btn-generate {
      width: 100%;
      padding: 14px;
      background: rgba(233,195,73,0.08);
      border: 1px solid rgba(233,195,73,0.2);
      border-top: none;
      color: #e9c349;
      font-size: 12px;
      font-weight: 700;
      font-family: 'Roboto', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      cursor: pointer;
      transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .btn-generate:hover {
      background: #e9c349;
      color: #1a1a00;
    }
    .btn-generate:disabled {
      background: rgba(255,255,255,0.03);
      color: rgba(255,255,255,0.25);
      border-color: rgba(255,255,255,0.06);
      cursor: wait;
    }
    .btn-generate .material-symbols-outlined { font-size: 16px; }
    .gen-step {
      transition: opacity 0.2s ease;
      font-size: 11px;
      letter-spacing: 0.12em;
    }

    /* Loading */
    .loading {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 60vh; gap: 24px;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #e9c349;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text {
      font-size: 14px; color: rgba(255,255,255,0.4);
      letter-spacing: 0.1em;
    }

    /* Empty state */
    .empty {
      text-align: center; padding: 80px 40px;
      color: rgba(255,255,255,0.3); font-size: 15px;
    }

    /* Toast */
    .toast {
      position: fixed; bottom: 32px; right: 32px;
      background: #1a1a1a; border: 1px solid rgba(233,195,73,0.3);
      border-radius: 6px; padding: 16px 24px;
      display: flex; align-items: center; gap: 12px;
      z-index: 200;
      transform: translateY(120px); opacity: 0;
      transition: all 0.3s ease;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast a {
      color: #e9c349; font-weight: 700; text-decoration: none;
      font-size: 14px;
    }
    .toast a:hover { text-decoration: underline; }
    .toast .close-toast {
      background: none; border: none; color: rgba(255,255,255,0.3);
      cursor: pointer; font-size: 18px; margin-left: 12px;
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      <img src="/assets/logo-blanc.png" alt="IMMODEV">
      <div class="header-divider"></div>
      <h1>Tableau de bord</h1>
    </div>
    <div class="header-right">
      <span class="header-stats" id="stats"></span>
      <a href="/" style="color:rgba(255,255,255,0.3); font-size:12px; text-decoration:none; letter-spacing:0.1em;">LIEN DIRECT →</a>
    </div>
  </div>

  <div class="filter-bar">
    <span class="filter-label">Courtier</span>
    <select class="filter-select" id="brokerFilter">
      <option value="">Tous les courtiers</option>
    </select>

    <div class="lang-toggle">
      <button class="lang-btn active" data-lang="fr">FR</button>
      <button class="lang-btn" data-lang="en">EN</button>
    </div>

    <button class="btn-refresh" id="refreshBtn">
      <span class="material-symbols-outlined">refresh</span>
      RAFRAÎCHIR
    </button>
  </div>

  <div class="grid-container">
    <div id="content">
      <div class="loading">
        <div class="spinner"></div>
        <div class="loading-text">Chargement des propriétés... Merci de patienter quelques secondes.</div>
      </div>
    </div>
  </div>


  <script>
    let allListings = [];
    let allBrokers = [];
    let selectedLang = 'fr';

    // Load listings
    async function loadListings(forceRefresh) {
      const content = document.getElementById('content');
      content.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">' +
        (forceRefresh ? 'Rafraîchissement des données... Merci de patienter quelques secondes.' : 'Chargement des propriétés... Merci de patienter quelques secondes.') +
        '</div></div>';

      try {
        const endpoint = forceRefresh ? '/api/listings/refresh' : '/api/listings';
        const opts = forceRefresh ? { method: 'POST' } : {};
        const res = await fetch(endpoint, opts);
        const data = await res.json();

        if (data.error) {
          content.innerHTML = '<div class="empty">Erreur: ' + data.error + '</div>';
          return;
        }

        allListings = data.listings || [];
        allBrokers = data.brokers || [];

        // Populate broker filter
        const select = document.getElementById('brokerFilter');
        const currentVal = select.value;
        select.innerHTML = '<option value="">Tous les courtiers (' + allListings.length + ')</option>';
        allBrokers.forEach(b => {
          const count = allListings.filter(l => l.brokers.some(lb => lb.id === b.id)).length;
          select.innerHTML += '<option value="' + b.id + '">' + b.name + ' (' + count + ')</option>';
        });
        select.value = currentVal;

        document.getElementById('stats').textContent = allListings.length + ' propriétés • ' + allBrokers.length + ' courtiers';

        renderGrid();
      } catch (err) {
        content.innerHTML = '<div class="empty">Erreur de connexion: ' + err.message + '</div>';
      }
    }

    function renderGrid() {
      const brokerId = document.getElementById('brokerFilter').value;
      let filtered = allListings;
      if (brokerId) {
        filtered = allListings.filter(l => l.brokers.some(b => b.id === brokerId));
      }

      if (filtered.length === 0) {
        document.getElementById('content').innerHTML = '<div class="empty">Aucune propriété trouvée</div>';
        return;
      }

      const html = '<div class="grid">' + filtered.map(l => {
        const brokerAvatars = l.brokers.map(b =>
          '<img class="card-broker-avatar" src="' + b.photo + '" alt="' + b.name + '" title="' + b.name + '"/>'
        ).join('');
        const brokerNames = l.brokers.map(b => b.name).join(', ');

        return '<div class="card">' +
          '<img class="card-img" src="' + (l.imgUrl || 'https://placehold.co/600x400/1a1a1a/333?text=Aucune+photo') + '" alt="' + l.address + '" loading="lazy"/>' +
          '<div class="card-body">' +
            '<div class="card-price">' + (l.price || '') + '</div>' +
            '<div class="card-address">' + l.address + '</div>' +
            '<div class="card-city">' + l.city + '</div>' +
            '<div class="card-meta">' +
              '<div>' +
                '<div class="card-brokers">' + brokerAvatars + '</div>' +
                (brokerNames ? '<div class="card-broker-name">' + brokerNames + '</div>' : '') +
              '</div>' +
              '<span class="card-transaction">' + l.transaction + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="btn-generate" onclick="generatePDF(this, \\'' + l.href.replace(/'/g, "\\\\'") + '\\')">' +
            '<span class="material-symbols-outlined">picture_as_pdf</span>' +
            'Générer PDF' +
          '</button>' +
        '</div>';
      }).join('') + '</div>';

      document.getElementById('content').innerHTML = html;
    }

    const genSteps = [
      'Récupération des images...',
      'Mise en page...',
      'Inspection du texte...',
      'Identification du courtier...',
      'Mise en page PDF...',
      'Génération finale du PDF...',
    ];

    async function generatePDF(btn, url) {
      btn.disabled = true;

      // Start step animation
      let stepIndex = 0;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> <span class="gen-step">' + genSteps[0] + '</span>';
      const stepInterval = setInterval(() => {
        stepIndex++;
        if (stepIndex < genSteps.length) {
          const stepEl = btn.querySelector('.gen-step');
          if (stepEl) {
            stepEl.style.opacity = '0';
            setTimeout(() => {
              stepEl.textContent = genSteps[stepIndex];
              stepEl.style.opacity = '1';
            }, 200);
          }
        }
      }, 3500);

      try {
        const res = await fetch('/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, lang: selectedLang }),
        });
        clearInterval(stepInterval);
        const data = await res.json();
        if (data.success) {
          btn.disabled = false;
          btn.style.background = '#e9c349';
          btn.style.color = '#1a1a00';
          btn.style.borderColor = '#e9c349';
          btn.innerHTML = '<span class="material-symbols-outlined">download</span> TÉLÉCHARGER PDF';
          btn.onclick = function() { window.open(data.pdfUrl, "_blank"); };
        } else {
          alert('Erreur: ' + data.error);
          btn.disabled = false;
          btn.innerHTML = '<span class="material-symbols-outlined">picture_as_pdf</span> Générer PDF';
        }
      } catch (err) {
        clearInterval(stepInterval);
        alert('Erreur: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">picture_as_pdf</span> Générer PDF';
      }
    }

    // Filter change
    document.getElementById('brokerFilter').addEventListener('change', renderGrid);

    // Language toggle
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedLang = btn.dataset.lang;
      });
    });

    // Refresh
    document.getElementById('refreshBtn').addEventListener('click', () => loadListings(true));

    // Initial load
    loadListings(false);
  </script>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Immodev PDF Generator running at http://0.0.0.0:${PORT}`);
  console.log(`Dashboard: http://0.0.0.0:${PORT}/dashboard`);
});
