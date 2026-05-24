# 🌿 Smart Greenhouse IoT — Sistem Monitoring & Parameter

**Stack:** Node.js (Express) + SQLite + WebSocket | Vanilla JS Dashboard | ESP8266

---

## 📁 Struktur Project

```
smart-greenhouse/
├── backend/
│   ├── server.js              # Entry point Express + WebSocket
│   ├── package.json
│   ├── greenhouse.db          # SQLite (auto-dibuat saat pertama jalan)
│   ├── db/
│   │   └── database.js        # Schema & inisialisasi DB
│   └── routes/
│       ├── config.js          # GET/POST /config
│       └── data.js            # GET/POST /data
├── frontend/
│   ├── index.html             # Dashboard utama
│   ├── css/
│   │   └── style.css          # Tema dark industrial
│   └── js/
│       └── app.js             # Logic: WebSocket, Chart, API
├── esp8266/
│   └── greenhouse_esp8266.ino # Firmware Arduino ESP8266
└── README.md
```

---

## 🚀 Cara Menjalankan Backend

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Jalankan Server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server akan berjalan di: **http://localhost:3000**
Dashboard bisa diakses langsung di URL tersebut.

---

## 🖥️ Cara Akses Dashboard

Buka browser dan masuk ke:
```
http://localhost:3000
```

Atau dari device lain di jaringan yang sama:
```
http://[IP_KOMPUTER_SERVER]:3000
```

---

## 📡 API Documentation

### BASE URL: `http://[SERVER_IP]:3000`

---

### `GET /config`
Ambil semua parameter konfigurasi (digunakan ESP8266)

**Response:**
```json
{
  "success": true,
  "data": {
    "suhuMax": 30,
    "soilMin": 40,
    "cahayaMin": 300,
    "kelembapanMin": 60,
    "kelembapanMax": 85
  },
  "updated_at": "2024-01-15 08:30:00"
}
```

---

### `POST /config`
Update parameter dari dashboard user

**Request Body:**
```json
{
  "suhuMax": 32,
  "soilMin": 35,
  "cahayaMin": 250
}
```

**Response:**
```json
{
  "success": true,
  "message": "Konfigurasi berhasil diperbarui",
  "data": {
    "suhuMax": 32,
    "soilMin": 35,
    "cahayaMin": 250,
    "kelembapanMin": 60,
    "kelembapanMax": 85
  }
}
```

---

### `POST /data`
Terima data sensor dari ESP8266. Backend otomatis menghitung status aktuator.

**Request Body (dari ESP8266):**
```json
{
  "suhu": 29.5,
  "kelembapan_udara": 72.3,
  "kelembapan_tanah": 38.1,
  "intensitas_cahaya": 410.0
}
```

**Response (ESP8266 harus patuhi ini untuk kontrol aktuator):**
```json
{
  "success": true,
  "message": "Data diterima",
  "aktuator": {
    "kipas": "OFF",
    "pompa": "ON",
    "lampu": "OFF"
  }
}
```

---

### `GET /data`
Ambil data sensor (latest + historis)

**Query params:** `?limit=50` (max 500)

**Response:**
```json
{
  "success": true,
  "latest": {
    "id": 142,
    "suhu": 29.5,
    "kelembapan_udara": 72.3,
    "kelembapan_tanah": 38.1,
    "intensitas_cahaya": 410.0,
    "status_kipas": 0,
    "status_lampu": 0,
    "status_pompa": 1,
    "timestamp": "2024-01-15 08:35:10"
  },
  "history": [ /* array 50 record terbaru */ ],
  "count": 50
}
```

---

### `GET /data/latest`
Hanya data terbaru (polling ringan)

### `GET /health`
Status server

---

## 🔌 Setup ESP8266 (WeMos D1 R2)

### Library yang Dibutuhkan (Arduino IDE)
Install via **Tools → Manage Libraries:**
1. `DHT sensor library` by Adafruit
2. `ArduinoJson` by Benoit Blanchon (versi 6+)
3. `ESP8266WiFi` (sudah built-in di ESP8266 Arduino core)

### Konfigurasi Firmware
Edit file `esp8266/greenhouse_esp8266.ino`:

```cpp
const char* WIFI_SSID = "NAMA_WIFI_KAMU";
const char* WIFI_PASS = "PASSWORD_WIFI_KAMU";
const char* SERVER_IP = "192.168.1.100";  // IP komputer server
const int   SERVER_PORT = 3000;
```

### Wiring Pin

| Komponen         | Pin WeMos D1 R2 |
|------------------|-----------------|
| DHT22 Data       | D4 (GPIO2)      |
| Soil Moisture    | A0              |
| LDR              | A0 (+ multiplexer untuk 2 sensor) |
| Relay Kipas      | D5 (GPIO14)     |
| Relay Lampu      | D6 (GPIO12)     |
| Relay Pompa Air  | D7 (GPIO13)     |

> ⚠️ **Catatan A0:** WeMos D1 R2 hanya punya 1 pin ADC. Gunakan CD4051 8-channel multiplexer jika butuh 2+ sensor analog.

---

## ⚙️ Logika Otomatis Aktuator

| Aktuator  | Kondisi ON                                    |
|-----------|-----------------------------------------------|
| Kipas     | `suhu > suhuMax` ATAU `kelembapan > kelembapanMax` |
| Pompa Air | `kelembapan_tanah < soilMin`                  |
| Lampu     | `intensitas_cahaya < cahayaMin`               |

Logika ini berjalan **di ESP8266** (firmware) DAN dikonfirmasi **di server** (response POST /data). Web hanya menampilkan status, **tidak ada kontrol manual ON/OFF**.

---

## 💾 Database Schema (SQLite)

```sql
-- Data sensor historis
CREATE TABLE sensor_data (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  suhu              REAL,
  kelembapan_udara  REAL,
  kelembapan_tanah  REAL,
  intensitas_cahaya REAL,
  status_kipas      INTEGER,
  status_lampu      INTEGER,
  status_pompa      INTEGER,
  timestamp         DATETIME DEFAULT (datetime('now','localtime'))
);

-- Parameter konfigurasi
CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      REAL,
  updated_at DATETIME
);
```

---

## 🌐 WebSocket

Server broadcast ke semua client web setiap kali ESP8266 mengirim data baru:

```json
{
  "type": "sensor_update",
  "data": {
    "suhu": 29.5,
    "kelembapan_udara": 72.3,
    "kelembapan_tanah": 38.1,
    "intensitas_cahaya": 410.0,
    "kipas": 0,
    "pompa": 1,
    "lampu": 0,
    "timestamp": "2024-01-15T08:35:10.000Z"
  }
}
```

Dashboard otomatis update tanpa refresh.

---

## 🔒 CORS

Server mengizinkan semua origin (`*`). Untuk produksi, batasi ke IP tertentu:

```js
// server.js
app.use(cors({ origin: 'http://192.168.1.x' }));
```

---

## 🧪 Testing API dengan curl

```bash
# Kirim data sensor (simulasi ESP8266)
curl -X POST http://localhost:3000/data \
  -H "Content-Type: application/json" \
  -d '{"suhu":31,"kelembapan_udara":80,"kelembapan_tanah":35,"intensitas_cahaya":200}'

# Ambil config
curl http://localhost:3000/config

# Update config
curl -X POST http://localhost:3000/config \
  -H "Content-Type: application/json" \
  -d '{"suhuMax":32,"soilMin":35}'

# Ambil data historis
curl "http://localhost:3000/data?limit=10"
```
