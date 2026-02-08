import 'dotenv/config';
import axios from 'axios';

// ============================================
// CONFIGURATION
// ============================================

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "AIzaSyDYwa9N6fEHmcxAPHUFa2i_CkPCq-hmZVM";
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || "13dnXL9DoFf1fjsBHmzL3p4r7ZNSwZuVfMtxZS9fzbM0";

// Default location - Küçükçekmece, İstanbul
const DEFAULT_LOCATION = 'Küçükçekmece Istanbul';

// Küçükçekmece Mahalleleri - Daha fazla sonuç için mahalle bazlı arama
const KUCUKCEKMECE_MAHALLELERI = [
  'Atakent',
  'Atatürk',
  'Beşyol',
  'Cennet',
  'Cumhuriyet',
  'Fatih',
  'Fevzi Çakmak',
  'Gültepe',
  'Halkalı',
  'İnönü',
  'İstasyon',
  'Kanarya',
  'Kartaltepe',
  'Kemalpaşa',
  'Mehmet Akif',
  'Söğütlüçeşme',
  'Sultan Murat',
  'Tevfikbey',
  'Yarımburgaz',
  'Yeni Mahalle',
  'Yeşilova',
  'Sefaköy'
];

// API endpoints (Legacy Places API)
const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

// Delay settings (in milliseconds)
const NEXT_PAGE_DELAY = 2500; // 2.5 seconds between pagination requests
const DETAILS_REQUEST_DELAY = 1000; // 1 second between details requests
const SECTOR_DELAY = 5000; // 5 seconds between different sectors

// Maximum results per sector (Google Places API returns max 60 results with 3 pages)
const MAX_RESULTS_PER_SECTOR = 60;

// ============================================
// HEDEF SEKTÖRLER (analiz.md'den alındı)
// ============================================

const HEDEF_SEKTORLER = [
  {
    id: 'dis-klinigi',
    name: '🦷 Diş Klinikleri',
    keywords: ['diş kliniği', 'diş hekimi', 'diş doktoru', 'ağız ve diş sağlığı'],
    odak: 'SEO + GMB',
    potansiyel: 'Çok yüksek'
  },
  {
    id: 'sac-ekimi',
    name: '💇 Saç Ekimi Klinikleri',
    keywords: ['saç ekim merkezi', 'saç ekimi kliniği', 'saç ekim'],
    odak: 'SEO',
    potansiyel: 'Çok yüksek'
  },
  {
    id: 'avukat',
    name: '⚖️ Avukatlık Büroları',
    keywords: ['avukat', 'avukatlık bürosu', 'hukuk bürosu'],
    odak: 'SEO',
    potansiyel: 'Yüksek'
  },
  {
    id: 'emlak',
    name: '🏘️ Emlak Ofisleri',
    keywords: ['emlak ofisi', 'emlakçı', 'gayrimenkul'],
    odak: 'GMB',
    potansiyel: 'Orta / Yüksek'
  },
  {
    id: 'oto-servis',
    name: '🚗 Oto Servis & Tamirhaneler',
    keywords: ['oto servis', 'oto tamirhanesi', 'araba servisi', 'oto tamir'],
    odak: 'GMB',
    potansiyel: 'Yüksek'
  },
  {
    id: 'oto-lastik',
    name: '🛞 Oto Lastik & Yol Yardım',
    keywords: ['oto lastik', 'lastikçi', 'yol yardım', 'lastik değişimi'],
    odak: 'GMB',
    potansiyel: 'Çok yüksek'
  },
  {
    id: 'veteriner',
    name: '🐾 Veteriner Klinikleri',
    keywords: ['veteriner', 'veteriner kliniği', 'hayvan doktoru'],
    odak: 'GMB',
    potansiyel: 'Yüksek'
  },
  {
    id: 'petshop',
    name: '🐶 Petshop & Hayvan Hastaneleri',
    keywords: ['petshop', 'pet shop', 'hayvan hastanesi'],
    odak: 'GMB',
    potansiyel: 'Orta'
  },
  {
    id: 'surucu-kursu',
    name: '🚦 Sürücü Kursları',
    keywords: ['sürücü kursu', 'ehliyet kursu', 'sürücü okulu'],
    odak: 'GMB + SEO',
    potansiyel: 'Orta / Yüksek'
  },
  {
    id: 'restoran',
    name: '🍽️ Restoranlar',
    keywords: ['restoran', 'lokanta', 'yemek'],
    odak: 'GMB',
    potansiyel: 'Orta'
  },
  {
    id: 'tesisatci',
    name: '🚰 Tesisatçı / Su Kaçağı',
    keywords: ['tesisatçı', 'su tesisatçısı', 'su kaçağı', 'tesisat'],
    odak: 'GMB',
    potansiyel: 'Çok yüksek'
  },
  {
    id: 'elektrikci',
    name: '⚡ Elektrikçi / Acil Teknik Servis',
    keywords: ['elektrikçi', 'elektrik tamircisi', 'acil elektrikçi'],
    odak: 'GMB',
    potansiyel: 'Çok yüksek'
  },
  {
    id: 'klima-servisi',
    name: '❄️ Klima Servisi',
    keywords: ['klima servisi', 'klima tamiri', 'klima montaj'],
    odak: 'GMB',
    potansiyel: 'Yüksek'
  },
  {
    id: 'nakliyat',
    name: '🚚 Nakliyat Firmaları',
    keywords: ['nakliyat', 'nakliye', 'evden eve nakliyat', 'taşımacılık'],
    odak: 'SEO + GMB',
    potansiyel: 'Yüksek'
  },
  {
    id: 'hali-yikama',
    name: '🧼 Halı Yıkama',
    keywords: ['halı yıkama', 'koltuk yıkama', 'halı temizleme'],
    odak: 'GMB',
    potansiyel: 'Orta / Yüksek'
  },
  {
    id: 'temizlik',
    name: '🧹 Temizlik Şirketleri',
    keywords: ['temizlik şirketi', 'temizlik firması', 'ev temizliği', 'ofis temizliği'],
    odak: 'SEO + GMB',
    potansiyel: 'Yüksek'
  },
  {
    id: 'cam-balkon',
    name: '🪟 Cam Balkon Firmaları',
    keywords: ['cam balkon', 'cam balkon firması', 'balkon kapatma'],
    odak: 'SEO',
    potansiyel: 'Yüksek'
  },
  {
    id: 'insaat-tadilat',
    name: '🏗️ İnşaat & Tadilat Firmaları',
    keywords: ['tadilat', 'tadilat firması', 'ev tadilatı', 'dekorasyon', 'boya badana'],
    odak: 'SEO + GMB',
    potansiyel: 'Çok yüksek'
  },
  {
    id: 'perdeci',
    name: '🏗️ Perdeci',
    keywords: ['perdeci', 'perde mağazası', 'stor perde'],
    odak: 'GMB',
    potansiyel: 'Orta'
  }
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Sleep function for adding delays
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sanitize a string for safe filenames (Turkish character support)
 * @param {string} input
 * @returns {string}
 */
function sanitizeFilename(input) {
  const turkishMap = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
  };

  return input
    .split('')
    .map(char => turkishMap[char] || char)
    .join('')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Save business data to a TXT file
 * @param {Array} businesses - Array of business objects
 * @param {string} sectorId - Sector identifier
 * @param {string} sectorName - Sector display name
 */
async function saveToTxt(businesses, sectorId, sectorName) {
  if (businesses.length === 0) {
    console.log(`\n⚠️ No businesses to save for ${sectorName}`);
    return null;
  }

  const { writeFileSync, mkdirSync, existsSync } = await import('fs');
  const date = new Date().toISOString().split('T')[0];

  // Create output directory if not exists
  const outputDir = './output';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${outputDir}/${sectorId}-kucukcekmece-${date}.txt`;

  // Header
  const lines = [
    `=== ${sectorName} - Küçükçekmece ===`,
    `Tarih: ${date}`,
    `Toplam İşletme: ${businesses.length}`,
    '='.repeat(50),
    ''
  ];

  // Business details
  businesses.forEach((b, index) => {
    lines.push(`${index + 1}. ${b.name}`);
    lines.push(`   📞 ${b.phone}`);
    lines.push(`   📍 ${b.address}`);
    lines.push(`   🌐 ${b.website}`);
    lines.push(`   ⭐ ${b.rating} (${b.reviewCount} yorum)`);
    lines.push(`   🗺️ ${b.mapsUrl}`);
    lines.push('');
  });

  // Phone numbers summary (for easy copy-paste)
  const phoneNumbers = businesses
    .map((b) => (b.phone || '').replace(/\D/g, ''))
    .filter((p) => p.length > 0);

  if (phoneNumbers.length > 0) {
    lines.push('='.repeat(50));
    lines.push('TÜM TELEFON NUMARALARI:');
    lines.push(phoneNumbers.join(', '));
  }

  writeFileSync(filename, lines.join('\n'), 'utf8');
  console.log(`\n✅ TXT saved to: ${filename}`);
  return filename;
}

/**
 * Search for businesses using Google Places Text Search API (Legacy)
 * @param {string} keyword - Search keyword
 * @param {string} location - Location
 * @param {number} maxResults - Maximum results to fetch
 * @param {boolean} verbose - Whether to show detailed logs
 * @returns {Array} - Array of place IDs
 */
async function searchPlaces(keyword, location, maxResults = MAX_RESULTS_PER_SECTOR, verbose = false) {
  if (verbose) {
    console.log(`\n🔍 Searching: "${keyword}" in "${location}"...`);
  }

  const allPlaceIds = [];
  let nextPageToken = null;
  let pageNumber = 1;

  do {
    try {
      const params = {
        query: `${keyword} in ${location}`,
        key: GOOGLE_PLACES_API_KEY,
        language: 'tr' // Turkish results
      };

      if (nextPageToken) {
        params.pagetoken = nextPageToken;
        await sleep(NEXT_PAGE_DELAY);
      }

      const response = await axios.get(PLACES_TEXT_SEARCH_URL, { params });
      const data = response.data;

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        if (data.status === 'REQUEST_DENIED') {
          console.error(`❌ API Error: REQUEST_DENIED - ${data.error_message || ''}`);
        } else if (verbose) {
          console.error(`❌ API Error: ${data.status} - ${data.error_message || 'Unknown error'}`);
        }
        break;
      }

      if (data.results && data.results.length > 0) {
        const placeIds = data.results.map(place => place.place_id);
        allPlaceIds.push(...placeIds);
        if (verbose) {
          console.log(`✅ Page ${pageNumber}: Found ${placeIds.length} businesses`);
        }
      }

      if (allPlaceIds.length >= maxResults) {
        break;
      }

      nextPageToken = data.next_page_token || null;
      pageNumber++;

    } catch (error) {
      if (verbose) {
        console.error(`❌ Error fetching search results:`, error.message);
      }
      break;
    }
  } while (nextPageToken && pageNumber <= 3); // Max 3 pages from Google

  const limitedPlaceIds = allPlaceIds.slice(0, maxResults);
  return limitedPlaceIds;
}

/**
 * Fetch detailed information for a specific place using Legacy Places API
 * @param {string} placeId - Google Place ID
 * @returns {Object|null} - Business details or null if no phone number
 */
async function getPlaceDetails(placeId) {
  try {
    const params = {
      place_id: placeId,
      fields: 'name,formatted_phone_number,website,rating,user_ratings_total,formatted_address,url',
      key: GOOGLE_PLACES_API_KEY,
      language: 'tr'
    };

    const response = await axios.get(PLACES_DETAILS_URL, { params });
    const data = response.data;

    if (data.status !== 'OK') {
      console.warn(`⚠️ Could not fetch details for place ${placeId}: ${data.status}`);
      return null;
    }

    const result = data.result;

    // Filter: Skip businesses without phone numbers
    if (!result.formatted_phone_number) {
      return null;
    }

    return {
      name: result.name || 'N/A',
      phone: result.formatted_phone_number || 'N/A',
      website: result.website || 'N/A',
      rating: result.rating || 'N/A',
      reviewCount: result.user_ratings_total || 0,
      address: result.formatted_address || 'N/A',
      mapsUrl: result.url || 'N/A',
    };

  } catch (error) {
    console.error(`❌ Error fetching details for place ${placeId}:`, error.message);
    return null;
  }
}

/**
 * Fetch details for all places with rate limiting
 * @param {Array} placeIds - Array of place IDs
 * @param {Object} sector - Sector object
 * @param {string} location - Search location
 * @returns {Array} - Array of business details
 */
async function fetchAllPlaceDetails(placeIds, sector, location) {
  console.log(`\n📞 Fetching details for ${placeIds.length} businesses...`);

  const businesses = [];
  const currentDate = new Date().toISOString().split('T')[0];
  const seenPhones = new Set(); // Avoid duplicates

  for (let i = 0; i < placeIds.length; i++) {
    const placeId = placeIds[i];

    // Progress indicator every 10 items
    if ((i + 1) % 10 === 0 || i === 0) {
      console.log(`Processing ${i + 1}/${placeIds.length}...`);
    }

    const details = await getPlaceDetails(placeId);

    if (details) {
      // Check for duplicate phone numbers
      const normalizedPhone = details.phone.replace(/\D/g, '');
      if (!seenPhones.has(normalizedPhone)) {
        seenPhones.add(normalizedPhone);

        // Add metadata
        details.sector = sector.id;
        details.sectorName = sector.name;
        details.location = location;
        details.date = currentDate;

        businesses.push(details);
      }
    }

    // Add delay between requests
    if (i < placeIds.length - 1) {
      await sleep(DETAILS_REQUEST_DELAY);
    }
  }

  console.log(`\n✅ Found ${businesses.length} unique businesses with phone numbers`);
  return businesses;
}

/**
 * Process a single sector with neighborhood-based search
 * @param {Object} sector - Sector configuration object
 * @param {string} location - Location to search (ignored if using neighborhoods)
 * @param {boolean} useNeighborhoods - Whether to search by neighborhoods for more results
 * @returns {Object} - Results summary
 */
async function processSector(sector, location, useNeighborhoods = true) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${sector.name}`);
  console.log(`Odak: ${sector.odak} | Potansiyel: ${sector.potansiyel}`);
  console.log(`${'='.repeat(60)}`);

  const allPlaceIds = new Set();

  if (useNeighborhoods) {
    // Search by neighborhoods for more comprehensive results
    console.log(`\n🏘️ Mahalle bazlı arama yapılıyor (${KUCUKCEKMECE_MAHALLELERI.length} mahalle)...`);

    for (const keyword of sector.keywords) {
      console.log(`\n📍 Anahtar kelime: "${keyword}"`);

      for (let i = 0; i < KUCUKCEKMECE_MAHALLELERI.length; i++) {
        const mahalle = KUCUKCEKMECE_MAHALLELERI[i];
        const searchLocation = `${mahalle} Küçükçekmece Istanbul`;

        // Only show progress every 5 neighborhoods
        if (i % 5 === 0) {
          console.log(`   Taranıyor: ${i + 1}/${KUCUKCEKMECE_MAHALLELERI.length} mahalle (${allPlaceIds.size} benzersiz işletme)...`);
        }

        const placeIds = await searchPlaces(keyword, searchLocation, 60);
        placeIds.forEach(id => allPlaceIds.add(id));

        // Short delay between neighborhood searches
        await sleep(500);
      }

      console.log(`   ✅ "${keyword}" için toplam: ${allPlaceIds.size} benzersiz işletme`);

      // Wait between keyword searches
      if (sector.keywords.indexOf(keyword) < sector.keywords.length - 1) {
        await sleep(1000);
      }
    }
  } else {
    // Simple search (original method)
    for (const keyword of sector.keywords) {
      const placeIds = await searchPlaces(keyword, location);
      placeIds.forEach(id => allPlaceIds.add(id));

      if (sector.keywords.indexOf(keyword) < sector.keywords.length - 1) {
        await sleep(1000);
      }
    }
  }

  console.log(`\n📊 TOPLAM BENZERSİZ İŞLETME: ${allPlaceIds.size}`);

  if (allPlaceIds.size === 0) {
    return {
      sectorId: sector.id,
      sectorName: sector.name,
      totalFound: 0,
      withPhone: 0,
      file: null
    };
  }

  // Fetch details for all places
  const businesses = await fetchAllPlaceDetails(Array.from(allPlaceIds), sector, 'Küçükçekmece');

  // Save to TXT file
  const filename = await saveToTxt(businesses, sector.id, sector.name);

  return {
    sectorId: sector.id,
    sectorName: sector.name,
    totalFound: allPlaceIds.size,
    withPhone: businesses.length,
    file: filename
  };
}

/**
 * Save summary report
 * @param {Array} results - Array of sector results
 */
async function saveSummaryReport(results) {
  const { writeFileSync, mkdirSync, existsSync } = await import('fs');
  const date = new Date().toISOString().split('T')[0];

  const outputDir = './output';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${outputDir}/OZET-RAPOR-${date}.txt`;

  const lines = [
    '═'.repeat(60),
    '  KÜÇÜKÇEKMECE GMB VERİ ÇEKME RAPORU',
    `  Tarih: ${date}`,
    '═'.repeat(60),
    ''
  ];

  let totalBusinesses = 0;
  let totalWithPhone = 0;

  results.forEach((result, index) => {
    totalBusinesses += result.totalFound;
    totalWithPhone += result.withPhone;

    lines.push(`${index + 1}. ${result.sectorName}`);
    lines.push(`   Bulunan: ${result.totalFound} | Telefonlu: ${result.withPhone}`);
    if (result.file) {
      lines.push(`   Dosya: ${result.file}`);
    }
    lines.push('');
  });

  lines.push('═'.repeat(60));
  lines.push(`TOPLAM: ${totalBusinesses} işletme bulundu, ${totalWithPhone} telefon numarası çekildi`);
  lines.push('═'.repeat(60));

  writeFileSync(filename, lines.join('\n'), 'utf8');
  console.log(`\n📋 Summary report saved to: ${filename}`);
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('🚀 Küçükçekmece GMB Veri Çekme Başladı');
  console.log('═'.repeat(60));
  console.log(`📍 Konum: Küçükçekmece, İstanbul`);
  console.log(`📊 Hedef Sektör Sayısı: ${HEDEF_SEKTORLER.length}`);
  console.log('═'.repeat(60));

  // Validate environment variables
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌ Error: GOOGLE_PLACES_API_KEY is not set in .env file');
    process.exit(1);
  }

  // Check for command line arguments
  const args = process.argv.slice(2);
  let sectorsToProcess = HEDEF_SEKTORLER;

  if (args.length > 0) {
    // If specific sector ID provided, only process that one
    const sectorId = args[0].toLowerCase();
    const foundSector = HEDEF_SEKTORLER.find(s => s.id === sectorId);

    if (foundSector) {
      sectorsToProcess = [foundSector];
      console.log(`\n🎯 Processing single sector: ${foundSector.name}`);
    } else {
      // Could be a custom keyword search like before
      console.log(`\n🔍 Custom search: "${args[0]}" in "${args[1] || DEFAULT_LOCATION}"`);

      const customSector = {
        id: sanitizeFilename(args[0]),
        name: `🔍 ${args[0]}`,
        keywords: [args[0]],
        odak: 'Custom',
        potansiyel: 'Custom'
      };

      const location = args[1] || DEFAULT_LOCATION;
      const result = await processSector(customSector, location);

      console.log('\n✅ Custom search completed!');
      console.log(`📊 Found: ${result.totalFound} | With Phone: ${result.withPhone}`);
      if (result.file) {
        console.log(`📁 Saved to: ${result.file}`);
      }
      return;
    }
  }

  // Process all sectors
  const results = [];

  for (let i = 0; i < sectorsToProcess.length; i++) {
    const sector = sectorsToProcess[i];

    console.log(`\n📌 Progress: ${i + 1}/${sectorsToProcess.length}`);

    const result = await processSector(sector, DEFAULT_LOCATION);
    results.push(result);

    // Wait between sectors to avoid API throttling
    if (i < sectorsToProcess.length - 1) {
      console.log(`\n⏳ Waiting ${SECTOR_DELAY / 1000} seconds before next sector...`);
      await sleep(SECTOR_DELAY);
    }
  }

  // Save summary report
  await saveSummaryReport(results);

  console.log('\n' + '═'.repeat(60));
  console.log('✅ TÜM VERİ ÇEKME İŞLEMİ TAMAMLANDI!');
  console.log('═'.repeat(60));

  // Final summary
  const totalFound = results.reduce((sum, r) => sum + r.totalFound, 0);
  const totalWithPhone = results.reduce((sum, r) => sum + r.withPhone, 0);

  console.log(`\n📊 ÖZET:`);
  console.log(`   • Taranan Sektör: ${results.length}`);
  console.log(`   • Toplam İşletme: ${totalFound}`);
  console.log(`   • Telefonlu İşletme: ${totalWithPhone}`);
  console.log(`\n📁 Dosyalar ./output klasörüne kaydedildi`);
}

// Run the script
main();
