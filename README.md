# 🗺️ GMB Veri Çekici

Google Maps'ten işletme bilgilerini (isim + telefon) çeken ve Excel/TXT formatında indiren web uygulaması.

## 📁 Proje Yapısı

```
google-maps-contact/
├── server.js              # Backend API (Render'a deploy edilecek)
├── data/
│   ├── istanbul-mahalleler.json  # 39 ilçe, yüzlerce mahalle
│   └── places-cache.json         # Cache (otomatik oluşur)
├── output/                # Çıktı dosyaları
├── .env                   # API Key (backend)
├── render.yaml            # Render deployment config
│
└── frontend/              # Frontend (Netlify'e deploy edilecek)
    ├── app/
    │   ├── page.js        # Ana sayfa
    │   ├── layout.js      # Layout
    │   └── globals.css    # Stiller
    ├── netlify.toml       # Netlify config
    └── .env.example       # Örnek env dosyası
```

---

## 🚀 Local Development

### 1. Backend'i Başlat

```bash
cd google-maps-contact
npm install
npm run server
```

Backend: http://localhost:3001

### 2. Frontend'i Başlat

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:3000

---

## 🌐 Production Deployment

### Backend → Render.com

1. **GitHub'a Push Et**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Render.com'da Deploy**
   - https://render.com adresine git
   - "New Web Service" oluştur
   - GitHub reposunu bağla
   - Ayarlar:
     - **Root Directory**: `.` (ana klasör)
     - **Build Command**: `npm install`
     - **Start Command**: `npm run server`
   - Environment Variables ekle:
     - `GOOGLE_PLACES_API_KEY`: API key'in
     - `NODE_ENV`: `production`
     - `FRONTEND_URL`: Netlify URL'in (sonra ekleyeceksin)

3. **URL'i Kopyala**
   Render sana bir URL verecek: `https://gmb-scraper-xxx.onrender.com`

### Frontend → Netlify

1. **GitHub'a Push Et** (frontend klasörünü)

2. **Netlify'de Deploy**
   - https://netlify.com adresine git
   - "Add new site" > "Import from Git"
   - GitHub reposunu bağla
   - Ayarlar:
     - **Base directory**: `frontend`
     - **Build command**: `npm run build`
     - **Publish directory**: `frontend/.next`
   - Environment Variables ekle:
     - `NEXT_PUBLIC_API_URL`: Render URL'in (örn: `https://gmb-scraper-xxx.onrender.com/api`)

3. **Domain Ayarla**
   - Site settings > Domain management
   - Kendi domain'ini ekle veya Netlify subdomain kullan

---

## 🔧 Environment Variables

### Backend (.env)
```
GOOGLE_PLACES_API_KEY=your_google_api_key
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-app.netlify.app
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api
```

---

## 💰 Maliyet Optimizasyonları

| Özellik | Açıklama | Tasarruf |
|---------|----------|----------|
| **fields: name,phone** | Sadece gerekli alanlar çekiliyor | ~60% |
| **Cache Sistemi** | Aynı işletme tekrar API'den çekilmiyor | ~20-30% |
| **Mahalle Bazlı Arama** | Daha fazla sonuç, aynı maliyet | +50% veri |

---

## 📊 Özellikler

- ✅ 39 İstanbul ilçesi
- ✅ Mahalle bazlı arama (yüzlerce mahalle)
- ✅ 19+ sektör (analiz.md'den)
- ✅ Özel anahtar kelime araması
- ✅ Excel ve TXT indirme
- ✅ Canlı log takibi
- ✅ Cache sistemi (API maliyeti düşük)
- ✅ Responsive tasarım

---

## 🔑 Google API Key Alma

1. https://console.cloud.google.com adresine git
2. Yeni proje oluştur
3. APIs & Services > Enable APIs
4. "Places API" etkinleştir
5. Credentials > Create Credentials > API Key
6. API Key'i kopyala ve .env dosyasına ekle

---

## 📝 Lisans

MIT License
