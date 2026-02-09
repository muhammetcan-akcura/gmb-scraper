import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================

const app = express();
const PORT = process.env.PORT || 3001;

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

// Delay settings
const NEXT_PAGE_DELAY = 2500;
const DETAILS_REQUEST_DELAY = 600; // Biraz hızlandırdık
const NEIGHBORHOOD_DELAY = 300;
const KEYWORD_DELAY = 800;

// Job storage
const JOBS_FILE = join(__dirname, 'data', 'jobs-persistence.json');
let jobs = new Map();
const jobLogs = new Map();

// Ensure required directories exist
const dataDir = join(__dirname, 'data');
const outputDir = join(__dirname, 'output');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

function loadJobs() {
    try {
        if (existsSync(JOBS_FILE)) {
            const data = JSON.parse(readFileSync(JOBS_FILE, 'utf8'));
            jobs = new Map(Object.entries(data));
            console.log(`📋 ${jobs.size} eski iş kaydı yüklendi`);
        }
    } catch (error) {
        console.warn('⚠️ İş kayıtları yüklenemedi');
        jobs = new Map();
    }
}

function saveJobs() {
    try {
        const obj = Object.fromEntries(jobs);
        writeFileSync(JOBS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (error) {
        console.error('İş kayıtları kaydedilemedi:', error.message);
    }
}

loadJobs();

// Allowed origins for CORS
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://gmb-scraper.netlify.app',
    process.env.FRONTEND_URL, // Netlify URL
].filter(Boolean);

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // Allow all origins in development, or check against allowed list
        if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin) || origin.includes('netlify.app')) {
            return callback(null, true);
        }

        return callback(new Error('CORS not allowed'), false);
    },
    credentials: true
}));
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ============================================
// SEKTÖRLER (analiz.md'den)
// ============================================

const SEKTORLER = [
    { id: 'dis-klinigi', name: '🦷 Diş Klinikleri', keywords: ['diş kliniği', 'diş hekimi', 'diş doktoru'], potansiyel: 'Çok yüksek' },
    { id: 'sac-ekimi', name: '💇 Saç Ekimi Klinikleri', keywords: ['saç ekim merkezi', 'saç ekimi kliniği'], potansiyel: 'Çok yüksek' },
    { id: 'avukat', name: '⚖️ Avukatlık Büroları', keywords: ['avukat', 'avukatlık bürosu', 'hukuk bürosu'], potansiyel: 'Yüksek' },
    { id: 'emlak', name: '🏘️ Emlak Ofisleri', keywords: ['emlak ofisi', 'emlakçı', 'gayrimenkul'], potansiyel: 'Orta' },
    { id: 'oto-servis', name: '🚗 Oto Servis', keywords: ['oto servis', 'oto tamirhanesi', 'araba servisi'], potansiyel: 'Yüksek' },
    { id: 'oto-lastik', name: '🛞 Oto Lastik', keywords: ['oto lastik', 'lastikçi', 'yol yardım'], potansiyel: 'Çok yüksek' },
    { id: 'veteriner', name: '🐾 Veteriner', keywords: ['veteriner', 'veteriner kliniği'], potansiyel: 'Yüksek' },
    { id: 'petshop', name: '🐶 Petshop', keywords: ['petshop', 'pet shop', 'hayvan hastanesi'], potansiyel: 'Orta' },
    { id: 'surucu-kursu', name: '🚦 Sürücü Kursları', keywords: ['sürücü kursu', 'ehliyet kursu'], potansiyel: 'Orta' },
    { id: 'restoran', name: '🍽️ Restoranlar', keywords: ['restoran', 'lokanta'], potansiyel: 'Orta' },
    { id: 'tesisatci', name: '🚰 Tesisatçı', keywords: ['tesisatçı', 'su tesisatçısı', 'su kaçağı'], potansiyel: 'Çok yüksek' },
    { id: 'elektrikci', name: '⚡ Elektrikçi', keywords: ['elektrikçi', 'elektrik tamircisi', 'acil elektrikçi'], potansiyel: 'Çok yüksek' },
    { id: 'klima-servisi', name: '❄️ Klima Servisi', keywords: ['klima servisi', 'klima tamiri'], potansiyel: 'Yüksek' },
    { id: 'nakliyat', name: '🚚 Nakliyat', keywords: ['nakliyat', 'evden eve nakliyat'], potansiyel: 'Yüksek' },
    { id: 'hali-yikama', name: '🧼 Halı Yıkama', keywords: ['halı yıkama', 'koltuk yıkama'], potansiyel: 'Orta' },
    { id: 'temizlik', name: '🧹 Temizlik Şirketi', keywords: ['temizlik şirketi', 'temizlik firması'], potansiyel: 'Yüksek' },
    { id: 'cam-balkon', name: '🪟 Cam Balkon', keywords: ['cam balkon', 'balkon kapatma'], potansiyel: 'Yüksek' },
    { id: 'insaat-tadilat', name: '🏗️ Tadilat', keywords: ['tadilat', 'tadilat firması', 'boya badana'], potansiyel: 'Çok yüksek' },
    { id: 'perdeci', name: '🏠 Perdeci', keywords: ['perdeci', 'perde mağazası'], potansiyel: 'Orta' }
];

// Load neighborhoods
let ISTANBUL_MAHALLELER = {};
try {
    const mahalleData = readFileSync(join(__dirname, 'data', 'istanbul-mahalleler.json'), 'utf8');
    ISTANBUL_MAHALLELER = JSON.parse(mahalleData);
    console.log(`✅ Mahalle verileri yüklendi: ${Object.keys(ISTANBUL_MAHALLELER).length} ilçe`);
} catch (error) {
    console.warn('⚠️ Mahalle verileri yüklenemedi');
    ISTANBUL_MAHALLELER = { "Küçükçekmece": ["Atakent", "Cennet", "Halkalı Merkez", "Sefaköy"] };
}

const ISTANBUL_ILCELERI = Object.keys(ISTANBUL_MAHALLELER).sort();

// ============================================
// 💾 CACHE SİSTEMİ - API maliyetini düşürür
// ============================================

const CACHE_FILE = join(__dirname, 'data', 'places-cache.json');
let placesCache = {};

function loadCache() {
    try {
        if (existsSync(CACHE_FILE)) {
            const data = readFileSync(CACHE_FILE, 'utf8');
            placesCache = JSON.parse(data);
            console.log(`💾 Cache yüklendi: ${Object.keys(placesCache).length} işletme`);
        }
    } catch (error) {
        console.warn('⚠️ Cache yüklenemedi');
        placesCache = {};
    }
}

function saveCache() {
    try {
        writeFileSync(CACHE_FILE, JSON.stringify(placesCache, null, 2), 'utf8');
    } catch (error) {
        console.error('Cache kaydedilemedi:', error.message);
    }
}

loadCache();

// ============================================
// HELPER FUNCTIONS
// ============================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function addLog(jobId, type, message, data = null) {
    if (!jobLogs.has(jobId)) {
        jobLogs.set(jobId, []);
    }
    const logEntry = { timestamp: new Date().toISOString(), type, message, data };
    jobLogs.get(jobId).push(logEntry);

    // İş tamamlandığında veya önemli bir adımda kayıt yap
    if (type === 'success' && (message.includes('TAMAMLANDI') || message.includes('dosyalar hazır'))) {
        saveJobs();
    }

    const prefix = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', progress: '📊', neighborhood: '🏘️', cache: '💾' }[type] || '•';
    console.log(`[${jobId.slice(-8)}] ${prefix} ${message}`);
}

function sanitizeFilename(input) {
    const turkishMap = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u' };
    return input.split('').map(char => turkishMap[char] || char).join('').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ============================================
// GOOGLE PLACES API FUNCTIONS
// ============================================

async function searchPlaces(jobId, keyword, location, maxResults = 60) {
    const allPlaceIds = [];
    let nextPageToken = null;
    let pageNumber = 1;

    do {
        try {
            const params = {
                query: `${keyword} in ${location}`,
                key: GOOGLE_PLACES_API_KEY,
                language: 'tr'
            };

            if (nextPageToken) {
                params.pagetoken = nextPageToken;
                await sleep(NEXT_PAGE_DELAY);
            }

            const response = await axios.get(PLACES_TEXT_SEARCH_URL, { params });
            const data = response.data;

            if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                if (data.status === 'REQUEST_DENIED') {
                    addLog(jobId, 'error', `API Hatası: ${data.error_message || 'REQUEST_DENIED'}`);
                }
                break;
            }

            if (data.results && data.results.length > 0) {
                const placeIds = data.results.map(place => place.place_id);
                allPlaceIds.push(...placeIds);
            }

            if (allPlaceIds.length >= maxResults) break;
            nextPageToken = data.next_page_token || null;
            pageNumber++;

        } catch (error) {
            addLog(jobId, 'error', `Arama hatası: ${error.message}`);
            break;
        }
    } while (nextPageToken && pageNumber <= 3);

    return allPlaceIds.slice(0, maxResults);
}

// 🎯 OPTİMİZE EDİLDİ: Sadece isim ve telefon çekiliyor!
async function getPlaceDetails(jobId, placeId) {
    try {
        const params = {
            place_id: placeId,
            // 💰 MALİYET + SATIŞ OPTİMİZASYONU: Adres, Telefon, Web sitesi, Puan ve Yorum Sayısı
            fields: 'name,formatted_phone_number,formatted_address,website,rating,user_ratings_total,url',
            key: GOOGLE_PLACES_API_KEY,
            language: 'tr'
        };

        const response = await axios.get(PLACES_DETAILS_URL, { params });
        const data = response.data;

        if (data.status !== 'OK') return null;

        const result = data.result;
        if (!result.formatted_phone_number) return null;

        return {
            name: result.name || 'N/A',
            phone: result.formatted_phone_number,
            address: result.formatted_address || '',
            website: result.website || '',
            rating: result.rating || 0,
            reviews: result.user_ratings_total || 0,
            mapsUrl: result.url || ''
        };

    } catch (error) {
        return null;
    }
}

// ============================================
// MAIN SCRAPING FUNCTION
// ============================================

async function runScrapeJob(jobId, sectorData, district, useNeighborhoods = true, city = 'Istanbul', customName = null) {
    const job = jobs.get(jobId);
    job.status = 'running';
    job.startTime = new Date();

    const neighborhoods = ISTANBUL_MAHALLELER[district] || [];
    const searchName = customName || sectorData.map(s => s.name).join(', ');

    addLog(jobId, 'info', `🚀 VERİ ÇEKME BAŞLADI`);
    addLog(jobId, 'info', `${'─'.repeat(50)}`);
    addLog(jobId, 'info', `📍 İlçe: ${district}`);
    addLog(jobId, 'info', `🔍 Arama: ${searchName}`);
    addLog(jobId, 'info', `🏘️ Mahalle sayısı: ${neighborhoods.length}`);
    addLog(jobId, 'info', `📊 Mahalle bazlı: ${useNeighborhoods ? 'AÇIK ✓' : 'KAPALI'}`);
    addLog(jobId, 'info', `${'─'.repeat(50)}`);

    const allPlaceIds = new Set();
    const placeToSectorsMap = new Map(); // placeId -> Set of sector names
    const seenPhones = new Set();
    const allBusinesses = [];

    try {
        // Search phase
        for (const sector of sectorData) {
            addLog(jobId, 'progress', `🏢 Sektör taranıyor: ${sector.name}`);

            for (const keyword of sector.keywords) {
                addLog(jobId, 'progress', `   🔍 Anahtar kelime: "${keyword}"`);

                if (useNeighborhoods && neighborhoods.length > 0) {
                    for (let i = 0; i < neighborhoods.length; i++) {
                        const mahalle = neighborhoods[i];
                        const searchLocation = `${mahalle} ${district} ${city}`;

                        job.currentNeighborhood = mahalle;
                        job.neighborhoodProgress = { current: i + 1, total: neighborhoods.length };

                        const placeIds = await searchPlaces(jobId, keyword, searchLocation, 60);
                        placeIds.forEach(id => {
                            allPlaceIds.add(id);
                            if (!placeToSectorsMap.has(id)) placeToSectorsMap.set(id, new Set());
                            placeToSectorsMap.get(id).add(sector.name);
                        });

                        await sleep(NEIGHBORHOOD_DELAY);
                    }
                } else {
                    const searchLocation = `${district} ${city}`;
                    const placeIds = await searchPlaces(jobId, keyword, searchLocation, 60);
                    placeIds.forEach(id => {
                        allPlaceIds.add(id);
                        if (!placeToSectorsMap.has(id)) placeToSectorsMap.set(id, new Set());
                        placeToSectorsMap.get(id).add(sector.name);
                    });
                }
                await sleep(KEYWORD_DELAY);
            }
        }

        job.currentNeighborhood = null;
        addLog(jobId, 'info', ``);
        addLog(jobId, 'info', `${'═'.repeat(50)}`);
        addLog(jobId, 'info', `📊 ARAMA TAMAMLANDI: ${allPlaceIds.size} benzersiz işletme bulundu`);
        addLog(jobId, 'info', `${'═'.repeat(50)}`);

        // Detail fetch phase
        addLog(jobId, 'progress', `📞 Telefon numaraları çekiliyor...`);

        const placeIdArray = Array.from(allPlaceIds);
        job.totalPlaces = placeIdArray.length;

        const startDetailTime = Date.now();
        let apiCalls = 0;
        let cacheHits = 0;

        for (let i = 0; i < placeIdArray.length; i++) {
            const placeId = placeIdArray[i];

            job.processedPlaces = i + 1;
            job.progress = Math.round(((i + 1) / placeIdArray.length) * 100);

            if ((i + 1) % 30 === 0 || i === 0) {
                const elapsed = Math.round((Date.now() - startDetailTime) / 1000);
                const remaining = Math.round((elapsed / (i + 1)) * (placeIdArray.length - i - 1));
                addLog(jobId, 'progress', `   ${i + 1}/${placeIdArray.length} (${job.progress}%) - ~${remaining}sn kaldı`);
            }

            if (job.shouldStop) {
                addLog(jobId, 'warning', `🛑 İşlem durduruldu. Mevcut ${allBusinesses.length} işletme kaydediliyor...`);
                break;
            }

            let details = null;
            if (placesCache[placeId]) {
                details = placesCache[placeId];
                cacheHits++;
            } else {
                details = await getPlaceDetails(jobId, placeId);
                apiCalls++;
                if (details) placesCache[placeId] = details;
                await sleep(DETAILS_REQUEST_DELAY);
            }

            if (details) {
                const address = (details.address || '').toLowerCase();
                const targetDistrict = (district || '').toLowerCase();

                if (address && address.includes(targetDistrict)) {
                    const normalizedPhone = details.phone.replace(/\D/g, '');
                    if (!seenPhones.has(normalizedPhone)) {
                        seenPhones.add(normalizedPhone);

                        // Sektör listesini işletmeye ekle
                        details.foundSectors = Array.from(placeToSectorsMap.get(placeId) || []);
                        allBusinesses.push(details);
                    }
                }
            }
        }

        // Cache'i diske kaydet
        saveCache();

        // Results
        job.businesses = allBusinesses;
        job.endTime = new Date();
        job.totalBusinesses = allBusinesses.length;
        job.progress = 100;
        job.apiCalls = apiCalls;
        job.cacheHits = cacheHits;

        // Generate files
        addLog(jobId, 'progress', `📂 Dosyalar hazırlanıyor (${allBusinesses.length} işletme)...`);
        await generateFiles(jobId, allBusinesses, district, searchName);

        job.status = 'completed';
        const duration = Math.round((job.endTime - job.startTime) / 1000);
        addLog(jobId, 'info', ``);
        addLog(jobId, 'success', `🎉 İŞLEM TAMAMLANDI!`);
        addLog(jobId, 'info', `⏱️ Süre: ${Math.floor(duration / 60)}dk ${duration % 60}sn`);
        addLog(jobId, 'info', `📊 Sonuç: ${allBusinesses.length} işletme (telefon numaralı)`);
        addLog(jobId, 'cache', `💾 Cache: ${cacheHits} işletme cache'den okundu (API çağrısı yapılmadı)`);
        addLog(jobId, 'info', `💰 API: ${apiCalls} yeni çağrı yapıldı`);
        addLog(jobId, 'success', `📁 Dosyalar indirmeye hazır!`);

    } catch (error) {
        addLog(jobId, 'error', `❌ HATA: ${error.message}`);
        job.status = 'error';
        job.error = error.message;
    }
}

async function generateFiles(jobId, businesses, district, searchName) {
    const job = jobs.get(jobId);
    const date = new Date().toISOString().split('T')[0];
    const safeDistrict = sanitizeFilename(district);
    const safeName = sanitizeFilename(searchName.slice(0, 30));
    const outputDir = join(__dirname, 'output', jobId);

    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    // TXT - Sadece isim ve telefon (minimal format)
    const txtFilename = `${safeDistrict}-${safeName}-${date}.txt`;
    const txtPath = join(outputDir, txtFilename);

    const txtLines = [
        `${'═'.repeat(50)}`,
        `  ${district} - ${searchName}`,
        `  Tarih: ${date} | Toplam: ${businesses.length} işletme`,
        `${'═'.repeat(50)}`,
        ``
    ];

    businesses.forEach((b, i) => {
        txtLines.push(`${i + 1}. ${b.name}`);
        txtLines.push(`   📞 ${b.phone}`);
        if (b.foundSectors) txtLines.push(`   📂 Sektörler: ${b.foundSectors.join(', ')}`);
        txtLines.push(``);
    });

    // Telefon listesi
    txtLines.push(`${'═'.repeat(50)}`);
    txtLines.push(`  TELEFON NUMARALARI (${businesses.length} adet)`);
    txtLines.push(`${'═'.repeat(50)}`);
    txtLines.push(businesses.map(b => b.phone).join('\n'));

    writeFileSync(txtPath, txtLines.join('\n'), 'utf8');
    addLog(jobId, 'success', `📄 TXT: ${txtFilename}`);

    // Excel - Çoklu Sayfa Formatı
    const xlsxFilename = `${safeDistrict}-${safeName}-${date}.xlsx`;
    const xlsxPath = join(outputDir, xlsxFilename);

    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();

    // Sektörleri grupla
    const sectorGroups = new Map();
    businesses.forEach(b => {
        const sectors = b.foundSectors && b.foundSectors.length > 0 ? b.foundSectors : ['Genel'];
        sectors.forEach(sName => {
            if (!sectorGroups.has(sName)) sectorGroups.set(sName, []);
            sectorGroups.get(sName).push(b);
        });
    });

    // Her sektör için bir sayfa oluştur
    for (const [sName, sBusinesses] of sectorGroups.entries()) {
        const sheetName = sName.replace(/[\[\]\*\?\:\/\\\s]+/g, ' ').trim().slice(0, 31) || 'Liste';
        const worksheet = workbook.addWorksheet(sheetName);

        worksheet.columns = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'İşletme Adı', key: 'name', width: 45 },
            { header: 'Telefon', key: 'phone', width: 20 },
            { header: 'Web Sitesi', key: 'website', width: 30 },
            { header: 'Puan', key: 'rating', width: 10 },
            { header: 'Yorum Sayısı', key: 'reviews', width: 15 },
            { header: 'Potansiyel', key: 'potential', width: 20 },
            { header: 'Örnek WP Mesajı (Profesyonel)', key: 'pitch', width: 120 },
            { header: 'Google Maps Linki', key: 'mapsUrl', width: 40 },
            { header: 'Adres', key: 'address', width: 50 },
            { header: 'Telefon (Rakam)', key: 'phoneRaw', width: 15 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };

        sBusinesses.forEach((b, i) => {
            const pitchData = generateSalesPitch(b, district);
            worksheet.addRow({
                no: i + 1,
                name: b.name,
                phone: b.phone,
                website: b.website,
                rating: b.rating,
                reviews: b.reviews,
                potential: pitchData.potential,
                pitch: pitchData.message,
                mapsUrl: b.mapsUrl,
                address: b.address,
                phoneRaw: b.phone.replace(/\D/g, '')
            });
        });
    }

    // Eğer hiç sayfa oluşmadıysa (işletme yoksa) boş bir sayfa ekle
    if (workbook.worksheets.length === 0) {
        workbook.addWorksheet('Boş').addRow(['Sonuç Bulunamadı']);
    }

    await workbook.xlsx.writeFile(xlsxPath);
    addLog(jobId, 'success', `📊 Excel: ${xlsxFilename}`);

    job.files = {
        txt: { filename: txtFilename, path: txtPath },
        xlsx: { filename: xlsxFilename, path: xlsxPath }
    };
}

// ============================================
// API ENDPOINTS
// ============================================

app.get('/api/sectors', (req, res) => {
    res.json(SEKTORLER.map(s => ({ id: s.id, name: s.name, keywords: s.keywords, potansiyel: s.potansiyel })));
});

app.get('/api/districts', (req, res) => {
    res.json(ISTANBUL_ILCELERI);
});

app.get('/api/districts/:district/neighborhoods', (req, res) => {
    const { district } = req.params;
    res.json(ISTANBUL_MAHALLELER[district] || []);
});

// Sektör bazlı arama
app.post('/api/scrape', (req, res) => {
    const { sectors, district, useNeighborhoods = true, city = 'Istanbul' } = req.body;

    if (!sectors || !Array.isArray(sectors) || sectors.length === 0) {
        return res.status(400).json({ error: 'En az bir sektör seçilmeli' });
    }
    if (!district) {
        return res.status(400).json({ error: 'İlçe seçilmeli' });
    }

    const sectorData = [];
    for (const sectorId of sectors) {
        const sector = SEKTORLER.find(s => s.id === sectorId);
        if (sector) {
            sectorData.push({ name: sector.name, keywords: sector.keywords });
        }
    }

    const jobId = generateJobId();
    const neighborhoods = ISTANBUL_MAHALLELER[district] || [];

    jobs.set(jobId, {
        id: jobId,
        status: 'pending',
        type: 'sector',
        sectors,
        district,
        city,
        useNeighborhoods,
        neighborhoodCount: neighborhoods.length,
        progress: 0,
        totalPlaces: 0,
        processedPlaces: 0,
        totalBusinesses: 0,
        currentNeighborhood: null,
        neighborhoodProgress: null,
        businesses: [],
        files: null,
        shouldStop: false,
        createdAt: new Date()
    });

    runScrapeJob(jobId, sectorData, district, useNeighborhoods, city);

    res.json({ jobId, message: 'İşlem başlatıldı', neighborhoodCount: neighborhoods.length, sectorCount: sectorData.length });
});

// 🆕 Custom arama (özel sektör/keyword)
app.post('/api/scrape/custom', (req, res) => {
    const { keywords, district, useNeighborhoods = true, city = 'Istanbul', customName } = req.body;

    if (!keywords || keywords.length === 0) {
        return res.status(400).json({ error: 'En az bir anahtar kelime gerekli' });
    }
    if (!district) {
        return res.status(400).json({ error: 'İlçe seçilmeli' });
    }

    const keywordList = Array.isArray(keywords) ? keywords : keywords.split(',').map(k => k.trim()).filter(k => k);
    const sectorData = [{ name: customName || 'Özel Arama', keywords: keywordList }];

    const jobId = generateJobId();
    const neighborhoods = ISTANBUL_MAHALLELER[district] || [];

    jobs.set(jobId, {
        id: jobId,
        status: 'pending',
        type: 'custom',
        keywords: keywordList,
        customName: customName || keywordList.join(', '),
        district,
        city,
        useNeighborhoods,
        neighborhoodCount: neighborhoods.length,
        progress: 0,
        totalPlaces: 0,
        processedPlaces: 0,
        totalBusinesses: 0,
        currentNeighborhood: null,
        neighborhoodProgress: null,
        businesses: [],
        files: null,
        shouldStop: false,
        createdAt: new Date()
    });

    runScrapeJob(jobId, sectorData, district, useNeighborhoods, city, customName);

    res.json({ jobId, message: 'Custom arama başlatıldı', neighborhoodCount: neighborhoods.length, keywordCount: keywordList.length });
});

app.get('/api/job/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) return res.status(404).json({ error: 'İş bulunamadı' });

    res.json({
        id: job.id,
        status: job.status,
        type: job.type,
        progress: job.progress,
        totalPlaces: job.totalPlaces,
        processedPlaces: job.processedPlaces,
        totalBusinesses: job.totalBusinesses,
        currentNeighborhood: job.currentNeighborhood,
        neighborhoodProgress: job.neighborhoodProgress,
        neighborhoodCount: job.neighborhoodCount,
        files: job.files ? { txt: job.files.txt.filename, xlsx: job.files.xlsx.filename } : null,
        error: job.error,
        apiCalls: job.apiCalls
    });
});

app.get('/api/job/:jobId/logs', (req, res) => {
    const { jobId } = req.params;
    const { since = 0 } = req.query;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let lastSentIndex = parseInt(since);

    const sendLogs = () => {
        const logs = jobLogs.get(jobId) || [];
        const newLogs = logs.slice(lastSentIndex);
        if (newLogs.length > 0) {
            lastSentIndex = logs.length;
            res.write(`data: ${JSON.stringify({ logs: newLogs, total: logs.length })}\n\n`);
        }
    };

    sendLogs();

    const interval = setInterval(() => {
        const job = jobs.get(jobId);
        sendLogs();
        if (job && (job.status === 'completed' || job.status === 'error')) {
            res.write(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`);
            clearInterval(interval);
            res.end();
        }
    }, 400);

    req.on('close', () => clearInterval(interval));
});

app.get('/api/job/:jobId/download/:format', (req, res) => {
    const { jobId, format } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        console.error(`Download error: Job ${jobId} not found`);
        return res.status(404).json({ error: 'İş kaydı bulunamadı. Sunucu yeniden başlamış olabilir.' });
    }

    if (!job.files) {
        return res.status(400).json({ error: 'Dosyalar henüz hazır değil' });
    }

    const file = format === 'xlsx' ? job.files.xlsx : job.files.txt;

    if (!file || !file.path) {
        return res.status(404).json({ error: 'Dosya bilgisi bulunamadı' });
    }

    // Dosyanın fiziksel olarak diskte olup olmadığını kontrol et
    if (!existsSync(file.path)) {
        console.error(`Download error: File not found at ${file.path}`);
        return res.status(404).json({
            error: 'Dosya sunucudan silinmiş. Render geçici disk alanı dosyaları temizlemiş olabilir.',
            tip: 'Lütfen taramayı sistemden tekrar başlatın.'
        });
    }

    // Content-Type ve Content-Disposition ayarlarını Manuel yapalım (Bazen res.download hata verebiliyor)
    res.setHeader('Content-Disposition', `attachment; filename=${file.filename}`);
    res.download(file.path, file.filename, (err) => {
        if (err) {
            console.error(`Download error for ${jobId}:`, err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'İndirme sırasında bir hata oluştu' });
            }
        }
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', apiKeySet: !!GOOGLE_PLACES_API_KEY, sectors: SEKTORLER.length, districts: ISTANBUL_ILCELERI.length });
});

// ============================================
// START SERVER
// ============================================

// İşlemi durdur
app.post('/api/job/:jobId/stop', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (job && job.status === 'running') {
        job.shouldStop = true;
        addLog(jobId, 'warning', '🛑 Durdurma komutu alındı. Mevcut verilerle sonuçlar hazırlanıyor...');
        return res.json({ success: true });
    }

    res.status(404).json({ error: 'Çalışan işlem bulunamadı' });
});

// 🧠 AKILLI SATIŞ ASİSTANI: Profesyonel B2B Analiz ve Mesaj
function generateSalesPitch(b, district) {
    const isWebsiteMissing = !b.website;
    const isLowRated = b.rating && b.rating < 4.2;
    const isFewReviews = b.reviews && b.reviews < 20;

    // Potansiyel Analizi
    let potential = "Orta";
    if (isWebsiteMissing && isFewReviews) potential = "Çok Yüksek 🚀";
    else if (isWebsiteMissing) potential = "Yüksek 🔥";
    else if (isLowRated) potential = "Yüksek 🔥";

    // Profesyonel Yaklaşım Mesajı
    let message = `Merhabalar, ${b.name} yetkilisi ile mi görüşüyorum? `;
    message += `Google'da ${district} bölgesindeki işletmeleri incelerken size denk geldim. `;

    if (isWebsiteMissing) {
        message += `İşletmenizin potansiyeli çok yüksek ancak dijitalde tam olarak görünür olmadığınızı fark ettim (Web siteniz eksik). `;
        message += `Sizin gibi işletmelere özel, müşteri kazandıran dijital çözümler üretiyoruz. `;
        message += `Müsait olduğunuzda size özel hazırladığım kısa analizi paylaşmak isterim.`;
    } else if (isLowRated) {
        message += `Müşterilerinizin işletmeniz hakkında yaptığı yorumları analiz ettim. `;
        message += `Hizmet kaliteniz yüksek olsa da, dijital itibarınız (puanınız) bunu tam yansıtmıyor olabilir. `;
        message += `Bu durumu tersine çevirip güvenilirliğinizi artıracak stratejilerimiz var. `;
        message += `Detayları konuşmak isterseniz dönüş yapabilirsiniz.`;
    } else if (isFewReviews) {
        message += `Hizmetinizden memnun kalan çok müşteriniz olduğuna eminim, ancak bu Google profilinize yeterince yansımamış (${b.reviews} yorum). `;
        message += `Rakiplerinizin önüne geçmek ve daha çok telefon almak için yorum sayınızı organik olarak artırabiliriz. `;
        message += `Konuyla ilgili size bir sunum iletmemi ister misiniz?`;
    } else {
        message += `Profiliniz genel hatlarıyla başarılı görünüyor, tebrik ederim. 👏 `;
        message += `Ancak sektörünüzde rekabet artıyor ve sizi rakiplerinizden ayıracak özel bir SEO çalışması ile `;
        message += `arama sonuçlarında dominasyon kurmanızı sağlayabiliriz. Dijital büyüme hedefleriniz varsa görüşmek isterim.`;
    }

    return { message, potential };
}

app.listen(PORT, () => {
    console.log(`\n🚀 GMB Scraper API Server v2.0`);
    console.log(`${'═'.repeat(50)}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🔑 API Key: ${GOOGLE_PLACES_API_KEY ? '✅ OK' : '❌ Missing'}`);
    console.log(`📊 Sektörler: ${SEKTORLER.length}`);
    console.log(`🏙️ İlçeler: ${ISTANBUL_ILCELERI.length}`);
    console.log(`💰 Optimize: Sadece isim+telefon çekiliyor`);
    console.log(`${'═'.repeat(50)}\n`);
});
