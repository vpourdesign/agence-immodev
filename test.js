const { scrapeListing } = require('./scraper');
const { generatePDF } = require('./pdf-generator');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  const url = 'https://www.immodev.ca/proprietes/laurentides/saint-eustache/a-louer/20241534/';

  console.log('Scraping listing...');
  const data = await scrapeListing(url);
  console.log('Data:', JSON.stringify(data, null, 2));

  const outputPath = path.join(OUTPUT_DIR, 'test-output.pdf');
  console.log('Generating PDF...');
  await generatePDF(data, outputPath);
  console.log('PDF saved to:', outputPath);
}

main().catch(console.error);
