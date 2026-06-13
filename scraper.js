const puppeteer = require('puppeteer');

async function scrapeListing(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for the AngularJS property widget to load
    await page.waitForSelector('#propriete__fiche--cus', { timeout: 15000 });
    // Give Angular time to digest and populate the model
    await new Promise(r => setTimeout(r, 3000));

    // Extract listing number from URL as fallback
    const urlMatch = url.match(/(\d{7,8})\/?$/);
    const urlRefNumber = urlMatch ? urlMatch[1] : '';

    // Pull everything from the AngularJS scope model
    const data = await page.evaluate((fallbackRef) => {
      // Access the Angular model
      const el = document.querySelector('#propriete__fiche--cus');
      if (!el || !window.angular) {
        throw new Error('AngularJS widget not found on this page');
      }

      const scope = angular.element(el).scope();
      if (!scope || !scope.model) {
        throw new Error('Angular model not available');
      }

      const m = scope.model;

      // ---- Address ----
      const addr = m.location && m.location.address ? m.location.address : {};
      const streetNumber = addr.street_number || '';
      const streetName = addr.street_name || '';
      const street = `${streetNumber} ${streetName}`.trim();
      const city = (m.location && m.location.city) || '';
      const region = (m.location && m.location.region) || '';
      const postal = addr.postal_code || '';
      const lat = (m.location && m.location.latitude) || (m.location && m.location.lat) || (addr.latitude) || '';
      const lng = (m.location && m.location.longitude) || (m.location && m.location.lng) || (addr.longitude) || '';

      // ---- Price ----
      let price = '';
      if (m.price) {
        if (m.price.sell && m.price.sell.amount) {
          price = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(m.price.sell.amount);
        } else if (m.price.lease && m.price.lease.amount) {
          const amt = m.price.lease.amount;
          const unit = m.price.lease.unit_code === 'SF' ? 'pc' : '';
          const period = m.price.lease.period_code === 'Y' ? 'an' : 'mois';
          price = `${amt} $/${unit}/${period}`;
          if (m.price.lease.taxable) price += ' +tx';
        }
      }

      // ---- Property type ----
      const propertyType = m.subcategory || m.category || '';
      const transaction = m.transaction || '';

      // ---- Key flags (bedrooms, bathrooms, area, etc.) ----
      let bedrooms = '';
      let bathrooms = '';
      let halfBaths = '';
      let garage = '';
      let livingArea = '';

      if (m.important_flags && m.important_flags.length > 0) {
        for (const flag of m.important_flags) {
          const cap = (flag.caption || '').toLowerCase();
          const icon = (flag.icon || '').toLowerCase();
          const val = flag.value || '';

          if (cap.includes('chambre') || icon.includes('bed')) bedrooms = val;
          else if (cap.includes('salle de bain') || icon.includes('bath')) bathrooms = val;
          else if (cap.includes("salle d'eau") || icon.includes('half')) halfBaths = val;
          else if (cap.includes('garage') || icon.includes('garage') || icon.includes('car')) garage = val;
          else if (cap.includes('superficie') || icon.includes('vector-square') || icon.includes('area')) livingArea = val;
        }
      }

      // ---- Building specs ----
      function extractSpecs(specObj) {
        const result = {};
        if (!specObj || !specObj.attributes) return result;
        for (const attr of specObj.attributes) {
          const key = (attr.label || attr.name || '').toLowerCase();
          const val = attr.value || attr.display_value || '';
          if (val && val !== '-' && val !== 'N/D') {
            result[key] = val;
          }
        }
        return result;
      }

      const buildingSpecs = extractSpecs(m.building);
      const landSpecs = extractSpecs(m.land);

      // Merge all specs
      const allSpecs = { ...buildingSpecs, ...landSpecs };

      // Also check top-level attributes (zoning, etc.)
      if (m.attributes) {
        for (const attr of m.attributes) {
          const key = (attr.label || attr.name || '').toLowerCase();
          const val = attr.value || attr.display_value || '';
          if (val && val !== '-') allSpecs[key] = val;
        }
      }

      // Helper: find spec value by partial key match
      function findVal(...partials) {
        for (const p of partials) {
          for (const [key, val] of Object.entries(allSpecs)) {
            if (key.includes(p)) return val;
          }
        }
        return '';
      }

      const yearBuilt = findVal('année de construction', 'annee de construction', 'year built') || '';
      const lotSize = findVal('superficie du terrain', 'lot area', 'terrain') || '';
      const rooms = findVal('nombre de pièces', 'rooms') || '';
      const stories = findVal("nombre d'étages", 'stories', 'étages') || '';
      const style = findVal('genre de propriété', 'style', 'building style') || '';
      const waterSupply = findVal('approvisionnement en eau', 'water') || '';
      const sewer = findVal("système d'égout", 'sewer') || '';
      const zoning = findVal('zonage', 'zoning') || '';
      const parking = findVal('stationnement', 'parking', 'garage') || '';
      const pool = findVal('piscine', 'pool') || '';
      const fireplace = findVal('foyer', 'fireplace') || '';
      const basement = findVal('sous-sol', 'basement') || '';
      const heating = findVal('mode de chauffage', 'chauffage', 'heating') || '';
      const heatingEnergy = findVal('énergie pour le chauffage', 'heating energy') || '';
      const foundation = findVal('fondation', 'foundation') || '';
      const exterior = findVal('revêtement', 'exterior', 'siding') || '';
      const roof = findVal('toiture', 'roof') || '';
      const fenestration = findVal('fenestration', 'windows') || '';
      const kitchen = findVal('armoires de cuisine', 'kitchen') || '';
      const terrain = findVal('topographie', 'topography') || '';
      const driveway = findVal('allée', 'driveway') || '';
      const proximity = findVal('proximité', 'proximity', 'nearby') || '';
      const equipment = findVal('équipement', 'equipment') || '';

      // ---- Financial details (assessment & expenses) ----
      const financials = { evaluations: [], taxes: [] };

      // Municipal assessment — values are in m.land.assessment and m.building.assessment
      const assessYear = (m.assessment && m.assessment.year) || '';
      if (m.land && m.land.assessment && m.land.assessment.amount) {
        financials.evaluations.push({
          label: 'Terrain',
          year: m.land.assessment.year || assessYear,
          amount: m.land.assessment.amount,
        });
      }
      if (m.building && m.building.assessment && m.building.assessment.amount) {
        financials.evaluations.push({
          label: 'Bâtiment',
          year: m.building.assessment.year || assessYear,
          amount: m.building.assessment.amount,
        });
      }
      // Total if both exist
      if (financials.evaluations.length === 2) {
        const total = financials.evaluations[0].amount + financials.evaluations[1].amount;
        financials.evaluations.push({
          label: 'Total',
          year: assessYear,
          amount: total,
        });
      }

      // Expenses (taxes)
      if (m.expenses) {
        const ex = Array.isArray(m.expenses) ? m.expenses : [m.expenses];
        for (const item of ex) {
          if (typeof item === 'object' && item !== null) {
            financials.taxes.push({
              label: item.label || item.type || item.name || 'Taxes',
              year: item.year || '',
              amount: item.amount || item.value || '',
            });
          }
        }
      }

      // Dump raw for debug
      const rawAssessment = JSON.stringify(m.assessment || null);
      const rawExpenses = JSON.stringify(m.expenses || null);
      const modelKeys = Object.keys(m);

      // ---- Inclusions & Exclusions ----
      let inclusions = '';
      let exclusions = '';
      if (m.inclusions) inclusions = typeof m.inclusions === 'string' ? m.inclusions : (m.inclusions.value || '');
      if (m.exclusions) exclusions = typeof m.exclusions === 'string' ? m.exclusions : (m.exclusions.value || '');

      // ---- Room details ----
      const roomDetails = [];
      if (m.rooms && m.rooms.length > 0) {
        for (const room of m.rooms) {
          roomDetails.push({
            name: room.type || room.name || '',
            level: room.level || room.floor_label || '',
            dimensions: room.dimension ? `${room.dimension.width || ''} x ${room.dimension.length || ''}` : '',
            flooring: room.floor || room.flooring || '',
            details: room.description || '',
          });
        }
      }

      // ---- Brokers ----
      const brokers = [];
      if (m.brokers && m.brokers.length > 0) {
        for (const b of m.brokers) {
          const name = `${b.first_name || ''} ${b.last_name || ''}`.trim();
          const title = b.license_type || b.title || b.license_type_code || '';
          const phone = (b.phones && (b.phones.mobile || b.phones.office || b.phones.home)) || '';
          const email = b.email || '';
          const photoUrl = b.photo_url || '';
          const corporation = b.company_name || b.corporation || b.company || '';

          if (name) {
            brokers.push({ name, title, phone, email, photoUrl, corporation });
          }
        }
      }

      // ---- Description ----
      const rawDescription = m.description || '';
      const rawAddendum = m.addendum || '';
      // Main description: prefer description, fallback to addendum
      const description = rawDescription || rawAddendum || '';
      // Addendum only if meaningfully different from description
      // Compare trimmed + normalized to catch whitespace/punctuation differences
      const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase().substring(0, 200);
      const isSameText = !rawAddendum || !rawDescription || norm(rawAddendum) === norm(rawDescription) || rawDescription.includes(rawAddendum.substring(0, 100)) || rawAddendum.includes(rawDescription.substring(0, 100));
      const addendum = isSameText ? '' : rawAddendum;

      // ---- Photos ----
      const photoUrls = [];
      if (m.photos && m.photos.length > 0) {
        for (const photo of m.photos) {
          const photoUrl = photo.url || photo.source_url || '';
          if (photoUrl && !photoUrls.includes(photoUrl)) {
            photoUrls.push(photoUrl);
          }
        }
      }

      // ---- Units ----
      const units = [];
      if (m.units && m.units.length > 0) {
        for (const u of m.units) {
          units.push({
            category: u.category || '',
            area: u.dimension ? u.dimension.area : '',
            areaUnit: u.dimension ? u.dimension.area_unit : '',
          });
        }
      }

      // If livingArea not from flags, try units
      if (!livingArea && units.length > 0 && units[0].area) {
        livingArea = `${units[0].area} ${units[0].areaUnit || 'pc'}`;
      }

      return {
        street, city, region, postal, lat, lng,
        address: `${street}, ${city} ${postal}`.trim(),
        price, propertyType, transaction,
        lotSize, yearBuilt, rooms, livingArea,
        stories, style, waterSupply, sewer, zoning, parking,
        pool, fireplace, basement, heating, heatingEnergy, foundation, exterior, roof,
        fenestration, kitchen, terrain, driveway, proximity, equipment,
        bedrooms, bathrooms, halfBaths, garage,
        inclusions, exclusions,
        brokers,
        roomDetails,
        description,
        addendum,
        photoUrls,
        refNumber: m.ref_number || fallbackRef,
        category: m.category || '',
        allSpecs,
        financials,
        modelKeys,
        rawAssessment,
        rawExpenses,
      };
    }, urlRefNumber);

    // Take top 9 photos (1 hero + up to 8 gallery)
    data.photoUrls = data.photoUrls.slice(0, 9);

    // Also set mlsNumber for backward compatibility
    data.mlsNumber = data.refNumber;

    console.log('Scraped data:', JSON.stringify(data, null, 2));
    return data;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeListing };
