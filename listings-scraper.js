const puppeteer = require('puppeteer');

let cachedData = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function scrapeAllListings() {
  // Return cache if fresh
  if (cachedData && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    console.log('Returning cached listings data');
    return cachedData;
  }

  console.log('Scraping all listings from immodev.ca...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // First: scrape the team page to get broker id→name mapping
    console.log('Scraping team page for broker names...');
    await page.goto('https://www.immodev.ca/notre-equipe/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const brokerMap = await page.evaluate(() => {
      const map = {};
      const els = document.querySelectorAll('.si-item');
      for (const el of els) {
        if (!window.angular) continue;
        const scope = angular.element(el).scope();
        if (scope && scope.item && scope.item.id) {
          const b = scope.item;
          if (!map[b.id]) {
            map[b.id] = {
              id: b.id,
              ref: b.ref_number || '',
              name: ((b.first_name || '') + ' ' + (b.last_name || '')).trim(),
              photo: b.photo_url || '',
            };
          }
        }
      }
      return map;
    });

    console.log(`Found ${Object.keys(brokerMap).length} unique brokers`);

    // Second: scrape the listings page
    console.log('Scraping listings page...');
    await page.goto('https://www.immodev.ca/nos-proprietes/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const listings = await page.evaluate((brokerLookup) => {
      const items = document.querySelectorAll('.si-listing-item');
      const results = [];
      for (const card of items) {
        if (!window.angular) continue;
        const scope = angular.element(card).scope();
        if (!scope || !scope.item) continue;
        const it = scope.item;

        const img = card.querySelector('img');
        const link = card.querySelector('a[href]');

        // Format price
        let priceText = '';
        if (it.price) {
          if (it.price.sell && it.price.sell.amount) {
            priceText = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(it.price.sell.amount);
            if (it.price.sell.taxable) priceText += ' +tx';
          } else if (it.price.lease && it.price.lease.amount) {
            const amt = it.price.lease.amount;
            const unit = it.price.lease.unit_code === 'SF' ? 'pc' : '';
            const period = it.price.lease.period_code === 'Y' ? 'an' : 'mois';
            priceText = `${new Intl.NumberFormat('fr-CA').format(amt)} $`;
            if (unit) priceText += `/${unit}`;
            priceText += `/${period}`;
            if (it.price.lease.taxable) priceText += ' +tx';
          }
        }

        // Resolve broker names from IDs
        const brokerIds = it.brokers_ids || [];
        const brokers = brokerIds
          .map(id => brokerLookup[id])
          .filter(Boolean);

        results.push({
          ref: it.ref_number || '',
          address: (it.location && it.location.address)
            ? ((it.location.address.street_number || '') + ' ' + (it.location.address.street_name || '')).trim()
            : '',
          city: (it.location && it.location.city) || '',
          price: priceText,
          imgUrl: it.photo_url || (img ? img.src : ''),
          category: it.subcategory || it.category || '',
          transaction: it.transaction || '',
          href: link ? link.href : '',
          brokers,
        });
      }
      return results;
    }, brokerMap);

    // Get unique brokers from all listings
    const allBrokers = {};
    for (const listing of listings) {
      for (const b of listing.brokers) {
        if (!allBrokers[b.id]) {
          allBrokers[b.id] = b;
        }
      }
    }

    const result = {
      listings,
      brokers: Object.values(allBrokers).sort((a, b) => a.name.localeCompare(b.name)),
      scrapedAt: new Date().toISOString(),
    };

    // Cache it
    cachedData = result;
    cacheTimestamp = Date.now();

    console.log(`Scraped ${listings.length} listings, ${result.brokers.length} brokers`);
    return result;

  } finally {
    await browser.close();
  }
}

function clearCache() {
  cachedData = null;
  cacheTimestamp = 0;
}

module.exports = { scrapeAllListings, clearCache };
