const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// LETTER size in points: 612 x 792
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;

// Colors — dark + gold brand palette
const GOLD = '#b19963';
const GOLD_LIGHT = '#b19963';
const BRAND_DARK = '#111111';    // near-black background
const WHITE = '#FFFFFF';
const BLACK = '#0A0A0A';
const LIGHT_GRAY = '#999999';
const MEDIUM_GRAY = '#666666';
const GRAY_PANEL = '#DDDCDA';

const LOGO_BLACK_SVG = path.join(__dirname, 'logo-noir.svg');
const LOGO_WHITE_SVG = path.join(__dirname, 'logo-blanc.svg');
const LOGO_WHITE_PNG = path.join(__dirname, 'logo-blanc.png');

// Bilingual labels
const LABELS = {
  fr: {
    superficie: 'Superficie',
    prix: 'Prix',
    type: 'Type',
    addenda: 'Addenda',
    inclusions: 'Inclusions',
    exclusions: 'Exclusions',
    caracteristiques: 'Caractéristiques',
    donnees_financieres: 'Données Financières',
    evaluation_municipale: 'Évaluation municipale',
    terrain: 'Terrain',
    construction: 'Construction',
    annee: 'Année',
    description: 'Description',
    galerie: 'Galerie photos',
    photos: 'photos',
    photo: 'photo',
    footer_name: 'IMMODEV AGENCE IMMOBILIÈRE',
    footer_sub: 'Commercial & Industriel',
    agence: 'AGENCE IMMOBILIÈRE',
    superficie_habitable: 'Superficie habitable',
    annee_construction: 'Année de construction',
    zonage: 'Zonage',
    eau: 'Eau',
    egout: 'Égout',
    etages: 'Étages',
    chambres: 'Chambres',
    salles_bain: 'Salles de bain',
    chauffage: 'Chauffage',
    energie: 'Énergie',
    fondation: 'Fondation',
    revetement: 'Revêtement',
    toiture: 'Toiture',
    fenestration: 'Fenestration',
    stationnement: 'Stationnement',
    piscine: 'Piscine',
    foyer: 'Foyer',
    sous_sol: 'Sous-sol',
    topographie: 'Topographie',
  },
  en: {
    superficie: 'Area',
    prix: 'Price',
    type: 'Type',
    addenda: 'Addenda',
    inclusions: 'Inclusions',
    exclusions: 'Exclusions',
    caracteristiques: 'Features',
    donnees_financieres: 'Financial Data',
    evaluation_municipale: 'Municipal Assessment',
    terrain: 'Land',
    construction: 'Construction',
    annee: 'Year',
    description: 'Description',
    galerie: 'Photo Gallery',
    photos: 'photos',
    photo: 'photo',
    footer_name: 'IMMODEV REAL ESTATE AGENCY',
    footer_sub: 'Commercial & Industrial',
    agence: 'REAL ESTATE AGENCY',
    superficie_habitable: 'Living Area',
    annee_construction: 'Year Built',
    zonage: 'Zoning',
    eau: 'Water',
    egout: 'Sewer',
    etages: 'Stories',
    chambres: 'Bedrooms',
    salles_bain: 'Bathrooms',
    chauffage: 'Heating',
    energie: 'Energy',
    fondation: 'Foundation',
    revetement: 'Siding',
    toiture: 'Roof',
    fenestration: 'Windows',
    stationnement: 'Parking',
    piscine: 'Pool',
    foyer: 'Fireplace',
    sous_sol: 'Basement',
    topographie: 'Topography',
  },
};

function getLabels(lang) {
  return LABELS[lang] || LABELS.fr;
}

// Cache for converted logo PNGs (SVG -> PNG via Sharp)
let _logoBlackPng = null;
let _logoWhitePng = null;

async function getLogoPng(svgPath, width) {
  return sharp(svgPath)
    .resize({ width: width || 800 })
    .png()
    .toBuffer();
}

async function logoBlack() {
  if (!_logoBlackPng) _logoBlackPng = await getLogoPng(LOGO_BLACK_SVG, 800);
  return _logoBlackPng;
}

async function logoWhite() {
  if (!_logoWhitePng) _logoWhitePng = await getLogoPng(LOGO_WHITE_SVG, 800);
  return _logoWhitePng;
}

async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.error('Failed to download image:', url, err.message);
    return null;
  }
}

async function fitImage(buffer, width, height) {
  if (!buffer) return null;
  try {
    return await sharp(buffer)
      .resize(Math.round(width * 2), Math.round(height * 2), { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (err) {
    console.error('Sharp error:', err.message);
    return buffer;
  }
}

function rect(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function line(doc, x1, y1, x2, y2, color, w) {
  doc.save().moveTo(x1, y1).lineTo(x2, y2).strokeColor(color).lineWidth(w || 1).stroke().restore();
}

// ========================================
// STITCH COVER PAGE — HTML TEMPLATE
// ========================================

function generateCoverHTML(data, logoBase64, lang) {
  const L = getLabels(lang);
  const street = data.street || '';
  const city = data.city || '';
  const heroUrl = (data.photoUrls && data.photoUrls[0]) || 'https://placehold.co/1200x675/1a1a1a/333?text=Photo';
  const brokers = (data.brokers || []).slice(0, 3);
  const brokerCount = brokers.length;

  const area = data.livingArea || data.lotSize || 'N/A';
  const price = data.price || 'N/A';
  const propType = data.propertyType || data.category || 'N/A';
  const transaction = (data.transaction || '').toUpperCase();
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html class="dark" lang="fr">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background-color: #000000;
    color: #e5e2e1;
    font-family: 'Roboto', sans-serif;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
  }
  .canvas-container {
    width: 1276px;
    height: 1650px;
    position: relative;
    background: #000000;
    display: flex;
    flex-direction: column;
    padding: 80px 80px 80px 100px;
    overflow: hidden;
  }
  .font-headline { font-family: 'Roboto', sans-serif; }
  .font-body, .font-label { font-family: 'Roboto', sans-serif; }
</style>
</head>
<body>
<main class="canvas-container">

  <!-- Top Editorial Header -->
  <header style="width:100%; display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:32px; margin-bottom:48px;">
    <div style="display:flex; flex-direction:column;">
      <img alt="IMMODEV" src="data:image/png;base64,${logoBase64}" style="height:80px; width:auto; object-fit:contain; opacity:0.95;"/>
    </div>
    <div style="display:flex; flex-direction:column; align-items:flex-end;">
      <div style="background:#e9c349; padding:16px 32px;">
        <span class="font-headline" style="font-size:54px; font-weight:700; color:#0a0a0a; letter-spacing:0.1em; text-transform:uppercase;">${escapeHTML(transaction) || L.agence}</span>
      </div>
    </div>
  </header>

  <!-- Main Editorial Content Wrapper -->
  <div style="position:relative; flex-grow:1; display:flex; flex-direction:column;">

    <!-- Title -->
    <div style="margin-bottom:32px;">
      <h1 class="font-headline" style="font-weight:700; color:white; letter-spacing:-0.03em; text-transform:uppercase; font-size:60px; line-height:0.95;">${escapeHTML(street)}<br/><span>${escapeHTML(city)}</span></h1>
    </div>

    <!-- Featured Image Section (full width) -->
    <div style="position:relative; width:calc(100% + 180px); margin-left:-100px; aspect-ratio:16/9; margin-bottom:48px; overflow:hidden;">
      <img alt="Property" src="${escapeHTML(heroUrl)}" style="width:100%; height:100%; object-fit:cover; transform:scale(1.02);"/>
      <div style="position:absolute; inset:0; background:linear-gradient(to right, rgba(0,0,0,0.15), transparent 50%);"></div>
    </div>

    <!-- Info Grid -->
    <div style="flex-grow:1; display:grid; grid-template-columns:repeat(12, 1fr); gap:40px; align-items:start; padding-bottom:32px;">

      <!-- Left Column: Specs -->
      <div style="grid-column: span 5; display:flex; flex-direction:column; gap:40px; border-left:3px solid #e9c349; padding-left:48px; padding-top:16px; padding-bottom:16px;">
        <div style="display:flex; flex-direction:column;">
          <span class="font-label" style="font-size:12px; letter-spacing:0.5em; color:#e9c349; text-transform:uppercase; margin-bottom:16px;">${L.superficie}</span>
          <span class="font-headline" style="font-size:40px; font-weight:300; color:white;">${escapeHTML(area)}</span>
        </div>
        <div style="display:flex; flex-direction:column;">
          <span class="font-label" style="font-size:12px; letter-spacing:0.5em; color:#e9c349; text-transform:uppercase; margin-bottom:16px;">${L.prix}</span>
          <span class="font-headline" style="font-size:40px; font-weight:300; color:white; text-transform:uppercase; letter-spacing:-0.02em;">${escapeHTML(price)}</span>
        </div>
        <div style="display:flex; flex-direction:column;">
          <span class="font-label" style="font-size:12px; letter-spacing:0.5em; color:#e9c349; text-transform:uppercase; margin-bottom:16px;">${L.type}</span>
          <div style="display:flex; align-items:center; gap:20px;">
            <span class="font-headline" style="font-size:40px; font-weight:300; color:#e9c349;">${escapeHTML(propType)}</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Broker(s) -->
      <div style="grid-column: 7 / span 6; display:flex; flex-direction:column; justify-content:flex-start; gap:${brokerCount > 2 ? '24' : '32'}px;">
        ${brokers.map((b, i) => {
          const bName = b.name || '';
          const bTitle = b.title || '';
          const bPhone = b.phone || '';
          const bEmail = b.email || '';
          const bPhoto = b.photoUrl || '';
          const bCorp = b.corporation || '';
          // Adaptive sizes based on broker count
          const photoW = brokerCount === 1 ? 180 : brokerCount === 2 ? 130 : 100;
          const nameSize = brokerCount === 1 ? 28 : brokerCount === 2 ? 22 : 18;
          const phoneSize = brokerCount === 1 ? 16 : 13;
          const titleSize = brokerCount === 1 ? 14 : brokerCount === 2 ? 12 : 11;
          const corpSize = brokerCount === 1 ? 11 : brokerCount === 2 ? 10 : 9;
          return `
        <div style="display:flex; flex-direction:row; align-items:flex-start; gap:${brokerCount >= 3 ? '16' : '24'}px;${i > 0 ? ' border-top:1px solid rgba(255,255,255,0.08); padding-top:' + (brokerCount > 2 ? '20' : '28') + 'px;' : ''}">
          ${bPhoto ? `
          <div style="position:relative; width:${photoW}px; min-width:${photoW}px; aspect-ratio:4/5; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
            <img alt="${escapeHTML(bName)}" src="${escapeHTML(bPhoto)}" style="width:100%; height:100%; object-fit:cover;"/>
            <div style="position:absolute; inset:0; border:0.5px solid rgba(233,195,73,0.2);"></div>
          </div>` : ''}
          <div style="display:flex; flex-direction:column; gap:${brokerCount >= 3 ? '10' : '16'}px; padding-top:4px;">
            <div style="display:flex; flex-direction:column; gap:4px;">
              <h2 class="font-headline" style="font-size:${nameSize}px; font-weight:700; color:white; letter-spacing:-0.02em; text-transform:uppercase;">${escapeHTML(bName)}</h2>
              ${bTitle ? `<p class="font-label" style="font-size:${titleSize}px; letter-spacing:0.05em; color:rgba(255,255,255,0.85); line-height:1.3; margin-top:2px;">${escapeHTML(bTitle)}</p>` : ''}
              ${bCorp ? `<p class="font-label" style="font-size:${corpSize}px; letter-spacing:0.12em; color:rgba(255,255,255,0.5); text-transform:uppercase; margin-top:4px;">${escapeHTML(bCorp)}</p>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${bPhone ? `
              <div style="display:flex; align-items:center; gap:10px; color:rgba(255,255,255,0.7);">
                <span class="material-symbols-outlined" style="color:#e9c349; font-size:${brokerCount >= 3 ? '14' : '16'}px;">call</span>
                <span class="font-body" style="font-size:${phoneSize}px; letter-spacing:0.05em;">${escapeHTML(bPhone)}</span>
              </div>` : ''}
              ${bEmail ? `
              <div style="display:flex; align-items:center; gap:10px; color:rgba(255,255,255,0.7);">
                <span class="material-symbols-outlined" style="color:#e9c349; font-size:${brokerCount >= 3 ? '14' : '16'}px;">mail</span>
                <span class="font-body" style="font-size:${phoneSize}px; letter-spacing:0.05em;">${escapeHTML(bEmail)}</span>
              </div>` : ''}
            </div>
          </div>
        </div>`;
        }).join('')}
      </div>

    </div>
  </div>

  <!-- Decorative UI Elements -->
  <div style="position:absolute; right:48px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:24px; z-index:40;">
    <div style="width:6px; height:6px; background:#e9c349;"></div>
    <div style="width:6px; height:48px; background:rgba(255,255,255,0.1);"></div>
    <div style="width:6px; height:6px; background:rgba(255,255,255,0.1);"></div>
  </div>

</main>
</body>
</html>`;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function renderPageToPNG(html, extraWait) {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1276, height: 1650, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for fonts and images to load
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, extraWait || 2000));

    const element = await page.$('.canvas-container');
    const screenshotBuffer = await element.screenshot({ type: 'png' });
    return screenshotBuffer;
  } finally {
    await browser.close();
  }
}

// ========================================
// PAGE 2 — STITCH INSIDE PAGE TEMPLATE
// ========================================

function generatePage2HTML(data, logoBase64, lang) {
  const L = getLabels(lang);
  const street = data.street || '';
  const city = data.city || '';
  const region = data.region || '';
  const heroUrl = (data.photoUrls && data.photoUrls[0]) || 'https://placehold.co/1200x675/1a1a1a/333?text=Photo';
  const price = data.price || 'N/A';
  const area = data.livingArea || data.lotSize || '';
  const lotSize = data.lotSize || '';
  const propType = data.propertyType || data.category || '';
  const category = data.category || '';
  const transaction = (data.transaction || '').toUpperCase();
  const description = data.description || '';
  const addendum = data.addendum || '';
  const yearBuilt = data.yearBuilt || '';

  // Build specs list from available data
  const specs = [];
  if (data.livingArea) specs.push([L.superficie_habitable, data.livingArea]);
  if (data.lotSize) specs.push([L.terrain, data.lotSize]);
  if (data.yearBuilt) specs.push([L.annee_construction, data.yearBuilt]);
  if (data.zoning) specs.push([L.zonage, data.zoning]);
  if (data.waterSupply) specs.push([L.eau, data.waterSupply]);
  if (data.sewer) specs.push([L.egout, data.sewer]);
  if (data.stories) specs.push([L.etages, data.stories]);
  if (data.bedrooms) specs.push([L.chambres, data.bedrooms]);
  if (data.bathrooms) specs.push([L.salles_bain, data.bathrooms]);
  if (data.heating) specs.push([L.chauffage, data.heating]);
  if (data.heatingEnergy) specs.push([L.energie, data.heatingEnergy]);
  if (data.foundation) specs.push([L.fondation, data.foundation]);
  if (data.exterior) specs.push([L.revetement, data.exterior]);
  if (data.roof) specs.push([L.toiture, data.roof]);
  if (data.fenestration) specs.push([L.fenestration, data.fenestration]);
  if (data.parking) specs.push([L.stationnement, data.parking]);
  if (data.pool) specs.push([L.piscine, data.pool]);
  if (data.fireplace) specs.push([L.foyer, data.fireplace]);
  if (data.basement) specs.push([L.sous_sol, data.basement]);
  if (data.terrain) specs.push([L.topographie, data.terrain]);

  const specsHTML = specs.map(([label, value]) => `
    <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(76,69,70,0.3); padding-bottom:16px;">
      <span style="color:#cfc4c5; text-transform:uppercase; font-size:12px; letter-spacing:0.15em;">${escapeHTML(label)}</span>
      <span style="font-weight:700; color:#e5e2e1; font-size:14px;">${escapeHTML(value)}</span>
    </div>`).join('');

  // Financial data
  const fin = data.financials || { evaluations: [], taxes: [] };
  const fmtMoney = (amt) => {
    if (!amt) return '';
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(amt);
  };

  // Description truncated for page
  const descTruncated = description.length > 400 ? description.substring(0, 400) + '...' : description;

  // Second photo for the bottom section
  const photo2Url = (data.photoUrls && data.photoUrls[1]) || '';
  const photo3Url = (data.photoUrls && data.photoUrls[2]) || '';

  // Inclusions / Exclusions
  const inclusions = data.inclusions || '';
  const exclusions = data.exclusions || '';

  // Adaptive: detect if content is sparse
  const isShortContent = description.length < 200 && !inclusions && !exclusions;
  const addendaFontSize = isShortContent ? '20px' : '16px';
  const addendaLineHeight = isShortContent ? '1.9' : '1.8';

  return `<!DOCTYPE html>
<html class="dark" lang="fr">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background-color: #131313;
    color: #e5e2e1;
    font-family: 'Roboto', sans-serif;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
  }
  .canvas-container {
    width: 1276px;
    height: 1650px;
    position: relative;
    background: #131313;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .font-headline { font-family: 'Roboto', sans-serif; }
  .font-body, .font-label { font-family: 'Roboto', sans-serif; }
  .glass-panel {
    background: rgba(32, 32, 31, 0.7);
    backdrop-filter: blur(20px);
    border-left: 1px solid rgba(233, 195, 73, 0.1);
  }
</style>
</head>
<body>
<main class="canvas-container">

  <!-- Header Bar -->
  <header style="display:flex; justify-content:space-between; align-items:center; padding:24px 64px; background:linear-gradient(to bottom, #131313, transparent); z-index:10;">
    <div style="display:flex; align-items:center; gap:16px;">
      <img alt="IMMODEV" src="data:image/png;base64,${logoBase64}" style="height:40px; width:auto; object-fit:contain; opacity:0.9;"/>
    </div>
    <div style="display:flex; gap:32px; align-items:center;">
      <span class="font-label" style="font-size:11px; letter-spacing:0.25em; text-transform:uppercase; color:rgba(255,255,255,0.5);">${escapeHTML(data.refNumber || '')}</span>
    </div>
  </header>

  <!-- Hero Section -->
  <section style="padding:0 64px; margin-bottom:48px;">
    <div style="display:grid; grid-template-columns:8fr 4fr; gap:32px;">

      <!-- Left: Title + Image -->
      <div style="display:flex; flex-direction:column; gap:32px;">
        <div style="display:flex; flex-direction:column; gap:8px;">
          <span class="font-headline" style="color:#e9c349; text-transform:uppercase; letter-spacing:0.3em; font-size:12px; font-weight:600;">${escapeHTML(city)} ${region ? '• ' + escapeHTML(region) : ''}</span>
          <h1 class="font-headline" style="font-size:72px; font-weight:700; line-height:0.9; letter-spacing:-0.03em; text-transform:uppercase;">${escapeHTML(street)}</h1>
        </div>
        <div style="position:relative; width:100%; aspect-ratio:16/9; overflow:hidden;">
          <img alt="Property" src="${escapeHTML(heroUrl)}" style="width:100%; height:100%; object-fit:cover; filter:brightness(0.85); transform:scale(1.05);"/>
          <div style="position:absolute; bottom:0; right:0; padding:32px;" class="glass-panel">
            <p class="font-headline" style="font-size:30px; font-weight:700; color:#e9c349;">${escapeHTML(price)}</p>
            <p style="font-size:10px; color:#cfc4c5; text-transform:uppercase; letter-spacing:0.15em;">${escapeHTML(transaction || category)}</p>
          </div>
        </div>
      </div>

      <!-- Right: Stats only -->
      <div style="display:flex; flex-direction:column; justify-content:flex-end; gap:16px; padding-bottom:32px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          ${area ? `
          <div style="background:#1c1b1b; padding:28px;">
            <span class="material-symbols-outlined" style="color:#e9c349; margin-bottom:10px; font-size:28px;">domain</span>
            <p class="font-headline" style="font-size:26px; font-weight:700;">${escapeHTML(area)}</p>
            <p style="font-size:12px; color:#cfc4c5; text-transform:uppercase; letter-spacing:0.15em; margin-top:4px;">${L.superficie}</p>
          </div>` : ''}
          ${lotSize && lotSize !== area ? `
          <div style="background:#1c1b1b; padding:28px;">
            <span class="material-symbols-outlined" style="color:#e9c349; margin-bottom:10px; font-size:28px;">landscape</span>
            <p class="font-headline" style="font-size:26px; font-weight:700;">${escapeHTML(lotSize)}</p>
            <p style="font-size:12px; color:#cfc4c5; text-transform:uppercase; letter-spacing:0.15em; margin-top:4px;">${L.terrain}</p>
          </div>` : `
          <div style="background:#1c1b1b; padding:28px;">
            <span class="material-symbols-outlined" style="color:#e9c349; margin-bottom:10px; font-size:28px;">category</span>
            <p class="font-headline" style="font-size:26px; font-weight:700;">${escapeHTML(category || propType)}</p>
            <p style="font-size:12px; color:#cfc4c5; text-transform:uppercase; letter-spacing:0.15em; margin-top:4px;">${L.type}</p>
          </div>`}
        </div>
      </div>

    </div>
  </section>

  <!-- Content Bento -->
  <section style="padding:0 64px; flex-grow:1; display:flex; flex-direction:column; margin-bottom:32px;">
    <div style="display:grid; grid-template-columns:2fr 1fr; gap:4px; flex-grow:1;">

      <!-- Left: Description + Addenda -->
      <div style="background:#1c1b1b; padding:48px 48px 64px 48px; display:flex; flex-direction:column; gap:28px; overflow:hidden;">
        <h2 class="font-headline" style="font-size:40px; font-weight:700; text-transform:uppercase; letter-spacing:-0.03em;">${L.description}</h2>
        <p style="color:#cfc4c5; font-size:20px; line-height:1.8; font-weight:300;">${escapeHTML(description.length > 1500 ? description.substring(0, 1500) + '...' : description)}</p>
        ${addendum ? `
        <div style="border-top:1px solid rgba(76,69,70,0.3); padding-top:28px;">
          <h3 class="font-headline" style="font-size:24px; font-weight:700; color:#e9c349; margin-bottom:16px; text-transform:uppercase; letter-spacing:0.05em;">Addenda</h3>
          <p style="color:#cfc4c5; font-size:18px; line-height:1.8; font-weight:300;">${escapeHTML(addendum.length > 1200 ? addendum.substring(0, 1200) + '...' : addendum)}</p>
        </div>` : ''}
        ${inclusions ? `
        <div style="border-top:1px solid rgba(76,69,70,0.3); padding-top:24px;">
          <h3 class="font-headline" style="font-size:18px; font-weight:700; color:#e9c349; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.1em;">${L.inclusions}</h3>
          <p style="color:#cfc4c5; font-size:16px; line-height:1.7;">${escapeHTML(inclusions.length > 400 ? inclusions.substring(0, 400) + '...' : inclusions)}</p>
        </div>` : ''}
        ${exclusions ? `
        <div style="padding-top:16px;">
          <h3 class="font-headline" style="font-size:18px; font-weight:700; color:#e9c349; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.1em;">${L.exclusions}</h3>
          <p style="color:#cfc4c5; font-size:16px; line-height:1.7;">${escapeHTML(exclusions.length > 400 ? exclusions.substring(0, 400) + '...' : exclusions)}</p>
        </div>` : ''}
        ${isShortContent && specs.length > 0 ? `
        <div style="border-top:1px solid rgba(76,69,70,0.3); padding-top:28px;">
          <h3 class="font-headline" style="font-size:22px; font-weight:700; color:white; margin-bottom:20px; text-transform:uppercase; letter-spacing:-0.02em;">${L.caracteristiques}</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap-x:48px; gap-y:20px;">
            ${specsHTML}
          </div>
        </div>` : ''}
      </div>

      <!-- Financials Panel (gold) -->
      <div style="background:#e9c349; padding:48px 48px 64px 48px; color:#3c2f00; display:flex; flex-direction:column; justify-content:flex-start; gap:32px;">
        <div style="display:flex; flex-direction:column; gap:32px;">
          <h2 class="font-headline" style="font-size:36px; font-weight:700; text-transform:uppercase; letter-spacing:-0.03em; color:#3c2f00;">${L.donnees_financieres}</h2>

          ${fin.evaluations.filter(e => e.amount).length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:18px;">
            <p style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.15em; opacity:0.7;">${L.evaluation_municipale}</p>
            ${fin.evaluations.filter(e => e.amount).map(e => `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:1px solid rgba(60,47,0,0.2); padding-bottom:10px;">
              <span style="font-size:16px;">${escapeHTML(e.label)}${e.year ? ' (' + e.year + ')' : ''}</span>
              <span class="font-headline" style="font-size:${e.label === 'Total' ? '24' : '20'}px; font-weight:${e.label === 'Total' ? '900' : '700'};">${fmtMoney(e.amount)}</span>
            </div>`).join('')}
          </div>` : `
          <div style="display:flex; flex-direction:column; gap:18px;">
            <p style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.15em; opacity:0.7;">${L.evaluation_municipale}</p>
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:1px solid rgba(60,47,0,0.2); padding-bottom:10px;">
              <span style="font-size:16px;">${escapeHTML(propType || 'Bâtiment')}</span>
              <span class="font-headline" style="font-size:22px; font-weight:700;">${escapeHTML(price)}</span>
            </div>
          </div>`}

          ${fin.taxes.filter(t => t.amount).length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:18px; padding-top:20px; border-top:1px solid rgba(60,47,0,0.15);">
            <p style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.15em; opacity:0.7;">Taxes</p>
            ${fin.taxes.filter(t => t.amount).map(t => `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:1px solid rgba(60,47,0,0.2); padding-bottom:10px;">
              <span style="font-size:16px;">${escapeHTML(t.label)}${t.year ? ' (' + t.year + ')' : ''}</span>
              <span class="font-headline" style="font-size:20px; font-weight:700;">${fmtMoney(t.amount)}</span>
            </div>`).join('')}
          </div>` : ''}

          ${yearBuilt ? `
          <div style="padding-top:20px; border-top:1px solid rgba(60,47,0,0.15);">
            <p style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.15em; opacity:0.7;">${L.construction}</p>
            <div style="display:flex; justify-content:space-between; align-items:baseline; padding-bottom:10px; padding-top:10px;">
              <span style="font-size:16px;">${L.annee}</span>
              <span style="font-size:18px; font-weight:700;">${escapeHTML(yearBuilt)}</span>
            </div>
          </div>` : ''}
        </div>
        ${photo3Url ? `
        <!-- Photo in financial panel to fill space -->
        <div style="margin-top:auto; position:relative; width:100%; flex-grow:1; min-height:120px; overflow:hidden; border-radius:6px; border:4px solid rgba(60,47,0,0.15);">
          <img alt="Property" src="${escapeHTML(photo3Url)}" style="width:100%; height:100%; object-fit:cover;"/>
        </div>` : ''}
      </div>

    </div>
  </section>

  <!-- Footer -->
  <footer style="padding:32px 64px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(76,69,70,0.1);">
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span class="font-headline" style="font-weight:700; color:#e9c349; letter-spacing:0.3em; text-transform:uppercase; font-size:16px;">${L.footer_name}</span>
      <p style="font-size:13px; text-transform:uppercase; letter-spacing:0.15em; color:rgba(255,255,255,0.3);">© ${new Date().getFullYear()} • ${L.footer_sub}</p>
    </div>
    <span class="font-label" style="font-size:14px; letter-spacing:0.2em; text-transform:uppercase; color:rgba(255,255,255,0.5);">immodev.ca</span>
  </footer>

</main>
</body>
</html>`;
}

// ========================================
// PAGE 3 — PHOTO GALLERY (MASONRY)
// ========================================

function generatePage3HTML(data, logoBase64, lang) {
  const L = getLabels(lang);
  const photos = (data.photoUrls || []).slice(1);
  if (photos.length === 0) return null;

  const maxPhotos = Math.min(photos.length, 8);
  const p = photos.slice(0, maxPhotos);
  const street = data.street || '';
  const city = data.city || '';
  const year = new Date().getFullYear();

  // Grid height: 1650 total - 80 title - 70 footer = ~1500px usable
  const GRID_H = 1500;

  // Build rows of photos using flexbox with fixed pixel heights
  // Available: 1276px wide, ~1500px tall for photos
  const W = 1276 - 64; // padding
  const GAP = 5;
  const ph = (url, w, h) => `<div style="width:${w}px;height:${h}px;overflow:hidden;border-radius:3px;flex-shrink:0;"><img src="${escapeHTML(url)}" style="width:100%;height:100%;object-fit:cover;"/></div>`;

  let rowsHTML = '';

  if (maxPhotos === 1) {
    rowsHTML = `<div style="display:flex; gap:${GAP}px;">${ph(p[0], W, 1480)}</div>`;
  } else if (maxPhotos === 2) {
    const half = Math.floor((W - GAP) / 2);
    rowsHTML = `<div style="display:flex; gap:${GAP}px;">${ph(p[0], half, 1480)}${ph(p[1], half, 1480)}</div>`;
  } else if (maxPhotos === 3) {
    const rH = 740 - 2;
    const w1 = Math.floor(W * 0.6);
    const w2 = W - w1 - GAP;
    rowsHTML = `<div style="display:flex; gap:${GAP}px;">
      ${ph(p[0], w1, rH * 2 + GAP)}
      <div style="display:flex; flex-direction:column; gap:${GAP}px;">
        ${ph(p[1], w2, rH)}
        ${ph(p[2], w2, rH)}
      </div>
    </div>`;
  } else if (maxPhotos === 4) {
    const half = Math.floor((W - GAP) / 2);
    const rH = 740 - 2;
    rowsHTML = `
      <div style="display:flex; gap:${GAP}px;">${ph(p[0], half, rH)}${ph(p[1], half, rH)}</div>
      <div style="display:flex; gap:${GAP}px;">${ph(p[2], half, rH)}${ph(p[3], half, rH)}</div>`;
  } else if (maxPhotos === 5) {
    const topH = 880;
    const botH = 1480 - topH - GAP;
    const w1 = Math.floor(W * 0.6);
    const w2 = W - w1 - GAP;
    const third = Math.floor((W - GAP * 2) / 3);
    rowsHTML = `
      <div style="display:flex; gap:${GAP}px;">
        ${ph(p[0], w1, topH)}
        <div style="display:flex; flex-direction:column; gap:${GAP}px;">
          ${ph(p[1], w2, Math.floor((topH - GAP) / 2))}
          ${ph(p[2], w2, Math.floor((topH - GAP) / 2))}
        </div>
      </div>
      <div style="display:flex; gap:${GAP}px;">${ph(p[3], Math.floor((W - GAP) / 2), botH)}${ph(p[4], Math.floor((W - GAP) / 2), botH)}</div>`;
  } else if (maxPhotos === 6) {
    const third = Math.floor((W - GAP * 2) / 3);
    const rH = 740 - 2;
    rowsHTML = `
      <div style="display:flex; gap:${GAP}px;">${ph(p[0], third, rH)}${ph(p[1], third, rH)}${ph(p[2], third, rH)}</div>
      <div style="display:flex; gap:${GAP}px;">${ph(p[3], third, rH)}${ph(p[4], third, rH)}${ph(p[5], third, rH)}</div>`;
  } else if (maxPhotos === 7) {
    const topH = 900;
    const botH = 1480 - topH - GAP;
    const w1 = Math.floor(W * 0.5);
    const w2r = W - w1 - GAP;
    const w2half = Math.floor((w2r - GAP) / 2);
    const third = Math.floor((W - GAP * 2) / 3);
    rowsHTML = `
      <div style="display:flex; gap:${GAP}px;">
        ${ph(p[0], w1, topH)}
        <div style="display:flex; flex-direction:column; gap:${GAP}px;">
          <div style="display:flex; gap:${GAP}px;">${ph(p[1], w2half, Math.floor((topH - GAP) / 2))}${ph(p[2], w2half, Math.floor((topH - GAP) / 2))}</div>
          <div style="display:flex; gap:${GAP}px;">${ph(p[3], w2half, Math.floor((topH - GAP) / 2))}${ph(p[4], w2half, Math.floor((topH - GAP) / 2))}</div>
        </div>
      </div>
      <div style="display:flex; gap:${GAP}px;">${ph(p[5], Math.floor((W - GAP) / 2), botH)}${ph(p[6], Math.floor((W - GAP) / 2), botH)}</div>`;
  } else {
    const topH = 900;
    const botH = 1480 - topH - GAP;
    const w1 = Math.floor(W * 0.5);
    const w2r = W - w1 - GAP;
    const w2half = Math.floor((w2r - GAP) / 2);
    const third = Math.floor((W - GAP * 2) / 3);
    rowsHTML = `
      <div style="display:flex; gap:${GAP}px;">
        ${ph(p[0], w1, topH)}
        <div style="display:flex; flex-direction:column; gap:${GAP}px;">
          <div style="display:flex; gap:${GAP}px;">${ph(p[1], w2half, Math.floor((topH - GAP) / 2))}${ph(p[2], w2half, Math.floor((topH - GAP) / 2))}</div>
          <div style="display:flex; gap:${GAP}px;">${ph(p[3], w2half, Math.floor((topH - GAP) / 2))}${ph(p[4], w2half, Math.floor((topH - GAP) / 2))}</div>
        </div>
      </div>
      <div style="display:flex; gap:${GAP}px;">${ph(p[5], third, botH)}${ph(p[6], third, botH)}${ph(p[7], third, botH)}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background:#f5f5f3; font-family:'Roboto',sans-serif; margin:0; padding:0; overflow:hidden; }
  .canvas-container { width:1276px; height:1650px; background:#f5f5f3; display:flex; flex-direction:column; overflow:hidden; }
  .font-headline { font-family:'Roboto',sans-serif; }
  .font-label { font-family:'Roboto',sans-serif; }
</style>
</head>
<body>
<main class="canvas-container">

  <div style="padding:28px 32px 16px; text-align:center;">
    <span class="font-headline" style="font-size:13px; font-weight:600; color:#e9c349; letter-spacing:0.4em; text-transform:uppercase;">📷 Photos (${maxPhotos})</span>
  </div>

  <section style="padding:0 32px; display:flex; flex-direction:column; gap:${GAP}px; overflow:hidden;">
    ${rowsHTML}
  </section>

  <footer style="margin-top:auto; padding:20px 32px; display:flex; justify-content:space-between; align-items:center; background:#131313;">
    <div style="display:flex; align-items:center; gap:20px;">
      <img alt="IMMODEV" src="data:image/png;base64,${logoBase64}" style="height:28px; width:auto; object-fit:contain; opacity:0.9;"/>
      <span class="font-headline" style="font-weight:700; color:#e9c349; letter-spacing:0.2em; text-transform:uppercase; font-size:12px;">${escapeHTML(street)}, ${escapeHTML(city)}</span>
    </div>
    <span class="font-label" style="font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:rgba(255,255,255,0.4);">©${year} immodev.ca</span>
  </footer>

</main>
</body>
</html>`;
}

// ========================================
// PAGE 4 — LOCATION MAP
// ========================================

async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'ImmodevPDFGenerator/1.0' },
      timeout: 10000,
    });
    if (response.data && response.data.length > 0) {
      return { lat: parseFloat(response.data[0].lat), lng: parseFloat(response.data[0].lon) };
    }
  } catch (err) {
    console.error('Geocode failed:', err.message);
  }
  return null;
}

async function fetchMajorRoads(lat, lng) {
  const mirrors = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];
  const radius = 5000;
  const query = `[out:json][timeout:10];(way["highway"="motorway"](around:${radius},${lat},${lng});way["highway"="trunk"](around:${radius},${lat},${lng});way["highway"="primary"](around:${radius},${lat},${lng});way["highway"="secondary"](around:${radius},${lat},${lng});way["highway"="motorway_link"](around:${radius},${lat},${lng});way["highway"="trunk_link"](around:${radius},${lat},${lng}););out geom;`;

  for (const mirror of mirrors) {
    try {
      const response = await axios.post(mirror, 'data=' + encodeURIComponent(query), {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ImmodevPDFGenerator/1.0',
        },
      });
      if (response.data && response.data.elements) {
        const roads = response.data.elements.map(el => ({
          coords: (el.geometry || []).map(p => [p.lat, p.lon]),
          highway: (el.tags && el.tags.highway) || '',
          name: (el.tags && el.tags.name) || '',
          ref: (el.tags && el.tags.ref) || '',
        })).filter(r => r.coords.length > 1);
        console.log(`Overpass (${mirror}): ${roads.length} road segments`);
        return roads;
      }
    } catch (err) {
      console.error(`Overpass mirror ${mirror} failed:`, err.message);
    }
  }
  return [];
}

function generatePage4HTML(data, logoBase64, lang, lat, lng, roads) {
  const L = getLabels(lang);
  const street = data.street || '';
  const city = data.city || '';
  const region = data.region || '';
  const year = new Date().getFullYear();
  const address = data.address || `${street}, ${city}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#2a2a2a; font-family:'Roboto',sans-serif; margin:0; padding:0; overflow:hidden; }
  .canvas-container { width:1276px; height:1650px; background:#2a2a2a; display:flex; flex-direction:column; overflow:hidden; }
  .font-headline { font-family:'Roboto',sans-serif; }
  .font-label { font-family:'Roboto',sans-serif; }
  #map { width:100%; height:100%; }
  .leaflet-control-attribution { display:none !important; }
  .leaflet-control-zoom { display:none !important; }
  .custom-marker {
    width:32px; height:32px;
    background:#e9c349;
    border:4px solid white;
    border-radius:50%;
    box-shadow: 0 0 0 10px rgba(233,195,73,0.3), 0 4px 24px rgba(0,0,0,0.5);
  }
  .road-label {
    background:none !important;
    border:none !important;
    overflow:visible !important;
    width:auto !important;
    height:auto !important;
  }
</style>
</head>
<body>
<main class="canvas-container">

  <!-- Header with logo -->
  <header style="padding:48px 80px 40px; display:flex; justify-content:space-between; align-items:center;">
    <img alt="IMMODEV" src="data:image/png;base64,${logoBase64}" style="height:48px; width:auto; object-fit:contain; opacity:0.95;"/>
    <span class="font-label" style="font-size:13px; letter-spacing:0.4em; color:rgba(255,255,255,0.3); text-transform:uppercase;">${lang === 'en' ? 'Location' : 'Localisation'}</span>
  </header>

  <!-- Address block -->
  <div style="padding:0 80px; display:flex; flex-direction:column; gap:16px; flex-grow:1; justify-content:center;">
    <div style="width:64px; height:3px; background:#e9c349; margin-bottom:16px;"></div>
    <h1 class="font-headline" style="font-size:72px; font-weight:700; color:white; text-transform:uppercase; letter-spacing:-0.03em; line-height:0.95;">${escapeHTML(street)}</h1>
    <p class="font-headline" style="font-size:36px; font-weight:300; color:#e9c349; text-transform:uppercase; letter-spacing:0.1em;">${escapeHTML(city)}${region ? ' • ' + escapeHTML(region) : ''}</p>
  </div>

  <!-- Map — ~4/9 of page -->
  <section style="height:733px; margin:0 80px 0 80px; overflow:hidden; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
    <div id="map"></div>
  </section>

  <!-- Footer -->
  <footer style="padding:32px 80px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.1); margin-top:auto;">
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span class="font-headline" style="font-weight:700; color:#e9c349; letter-spacing:0.3em; text-transform:uppercase; font-size:16px;">${L.footer_name}</span>
      <span class="font-label" style="font-size:13px; letter-spacing:0.15em; text-transform:uppercase; color:rgba(255,255,255,0.3);">© ${year} • immodev.ca</span>
    </div>
  </footer>

</main>
<script>
  var map = L.map('map', {
    center: [${lat}, ${lng}],
    zoom: 16,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(map);

  var markerIcon = L.divIcon({
    className: '',
    html: '<div class="custom-marker"></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  L.marker([${lat}, ${lng}], { icon: markerIcon }).addTo(map);

  // Draw pre-fetched major roads in gold
  var roads = ${JSON.stringify(roads || [])};
  roads.forEach(function(r) {
    var weight = (r.highway === 'motorway' || r.highway === 'trunk') ? 7 : (r.highway === 'primary' ? 5 : (r.highway === 'secondary' ? 4 : 3));
    L.polyline(r.coords, {
      color: '#e9c349',
      weight: weight,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
  });

  // Add road name labels within the visible map area (inset from edges)
  setTimeout(function() {
    var bounds = map.getBounds();
    // Create inner bounds with ~12% inset so labels don't sit at edges
    var latRange = bounds.getNorth() - bounds.getSouth();
    var lngRange = bounds.getEast() - bounds.getWest();
    var insetLat = latRange * 0.12;
    var insetLng = lngRange * 0.12;
    var innerBounds = L.latLngBounds(
      [bounds.getSouth() + insetLat, bounds.getWest() + insetLng],
      [bounds.getNorth() - insetLat, bounds.getEast() - insetLng]
    );
    var labelMap = {};

    roads.forEach(function(r) {
      var displayLabel = '';
      var key = r.ref || r.name;
      if (!key) return;
      if (r.ref) {
        var hw = r.highway;
        if (hw === 'motorway' || hw === 'trunk') {
          displayLabel = 'A-' + r.ref;
        } else {
          displayLabel = r.ref;
        }
      } else {
        displayLabel = r.name;
      }

      // Find the coord closest to map center that is within the INNER bounds
      var center = map.getCenter();
      var bestDist = Infinity;
      var bestCoord = null;
      for (var i = 0; i < r.coords.length; i++) {
        var c = r.coords[i];
        if (innerBounds.contains(L.latLng(c[0], c[1]))) {
          var d = Math.pow(c[0] - center.lat, 2) + Math.pow(c[1] - center.lng, 2);
          if (d < bestDist) {
            bestDist = d;
            bestCoord = c;
          }
        }
      }
      if (!bestCoord) return;

      if (!labelMap[key] || bestDist < labelMap[key].dist) {
        labelMap[key] = { lat: bestCoord[0], lng: bestCoord[1], dist: bestDist, highway: r.highway, label: displayLabel };
      }
    });

    Object.keys(labelMap).forEach(function(key) {
      var info = labelMap[key];
      var isMajor = (info.highway === 'motorway' || info.highway === 'trunk');
      var fontSize = isMajor ? '14px' : '12px';
      var fontWeight = '700';
      var padding = isMajor ? '6px 14px' : '5px 10px';

      var icon = L.divIcon({
        className: 'road-label',
        html: '<div style="font-family:Roboto,sans-serif; font-size:' + fontSize + '; font-weight:' + fontWeight + '; color:#333; background:rgba(255,255,255,0.95); padding:' + padding + '; border-radius:4px; white-space:nowrap; letter-spacing:0.03em; box-shadow:0 1px 6px rgba(0,0,0,0.18); border:1px solid rgba(0,0,0,0.1); display:inline-block;">' + info.label + '</div>',
        iconSize: [0, 0],
        iconAnchor: [0, 12],
      });
      L.marker([info.lat, info.lng], { icon: icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
    });
  }, 500);
</script>
</body>
</html>`;
}

// ========================================
// MAIN PDF GENERATOR
// ========================================

async function generatePDF(data, outputPath) {
  // ========================================
  // PAGE 1 — STITCH COVER (rendered via Puppeteer)
  // ========================================
  console.log('Rendering Stitch cover page...');
  const logoBase64 = fs.readFileSync(LOGO_WHITE_PNG).toString('base64');
  const lang = data.lang || 'fr';
  const coverHTML = generateCoverHTML(data, logoBase64, lang);
  const coverPNG = await renderPageToPNG(coverHTML);
  console.log('Cover page rendered.');

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: false,
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const BOLD = 'Helvetica-Bold';
  const REG = 'Helvetica';

  // PAGE 1 — Full-bleed cover image
  doc.addPage({ size: 'LETTER', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  doc.image(coverPNG, 0, 0, { width: PAGE_W, height: PAGE_H });


  // ========================================
  // PAGE 2 — STITCH INSIDE PAGE (rendered via Puppeteer)
  // ========================================
  console.log('Rendering Stitch page 2...');
  const page2HTML = generatePage2HTML(data, logoBase64, lang);
  const page2PNG = await renderPageToPNG(page2HTML);
  console.log('Page 2 rendered.');

  doc.addPage({ size: 'LETTER', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  doc.image(page2PNG, 0, 0, { width: PAGE_W, height: PAGE_H });

  // ========================================
  // PAGE 3 — PHOTO GALLERY (rendered via Puppeteer)
  // ========================================
  const page3HTML = generatePage3HTML(data, logoBase64, lang);
  if (page3HTML) {
    console.log('Rendering photo gallery page 3...');
    const page3PNG = await renderPageToPNG(page3HTML);
    console.log('Page 3 rendered.');

    doc.addPage({ size: 'LETTER', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    doc.image(page3PNG, 0, 0, { width: PAGE_W, height: PAGE_H });
  }

  // ========================================
  // PAGE 4 — LOCATION MAP (rendered via Puppeteer)
  // ========================================
  let lat = parseFloat(data.lat) || 0;
  let lng = parseFloat(data.lng) || 0;

  // Fallback: geocode the address if no coords from scraper
  if (!lat || !lng) {
    console.log('Geocoding address...');
    const coords = await geocodeAddress(data.address || `${data.street}, ${data.city}, QC, Canada`);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
      console.log('Geocoded:', lat, lng);
    }
  }

  if (lat && lng) {
    console.log('Fetching major roads...');
    const roads = await fetchMajorRoads(lat, lng);
    console.log('Found', roads.length, 'road segments');

    console.log('Rendering map page 4...');
    const page4HTML = generatePage4HTML(data, logoBase64, lang, lat, lng, roads);
    const page4PNG = await renderPageToPNG(page4HTML, 3000);
    console.log('Page 4 rendered.');

    doc.addPage({ size: 'LETTER', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    doc.image(page4PNG, 0, 0, { width: PAGE_W, height: PAGE_H });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

module.exports = { generatePDF };
