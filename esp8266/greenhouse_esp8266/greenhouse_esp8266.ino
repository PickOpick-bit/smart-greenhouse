/*
 * ============================================================
 *  Smart Greenhouse — ESP8266 (WeMos D1 R2) Firmware
 *  Soil & LDR: Digital (BASAH/KERING, TERANG/GELAP)
 * ============================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ── PIN MAPPING ──────────────────────────────────────────────
#define DHT_PIN      D4   // DHT22
#define DHT_TYPE     DHT22
#define SOIL_PIN     D3   // Soil Moisture (DOUT)
#define LDR_PIN      D2   // LDR (DOUT)
#define PIN_KIPAS    D5   // Relay Kipas
#define PIN_LAMPU    D6   // Relay Lampu
#define PIN_POMPA    D7   // Relay Pompa

// ── WIFI & SERVER ────────────────────────────────────────────
const char* WIFI_SSID   = "MfDoom";
const char* WIFI_PASS   = "1sampai8";
const char* SERVER_IP   = "10.116.147.157";
const int   SERVER_PORT = 3000;

String urlPostData;
String urlGetConfig;

// ── INTERVAL ─────────────────────────────────────────────────
const unsigned long SEND_INTERVAL   = 10000;
const unsigned long CONFIG_INTERVAL = 30000;
unsigned long lastSend   = 0;
unsigned long lastConfig = 0;

// ── CONFIG DEFAULT ───────────────────────────────────────────
float suhuMax       = 30.0;
float kelembapanMax = 85.0;

// ── STRUCT SENSOR ────────────────────────────────────────────
struct GHSensor {
  float suhu;
  float kelembapanUdara;
  String kondisiTanah;   // "BASAH" atau "KERING"
  String kondisiCahaya;  // "TERANG" atau "GELAP"
  bool  valid;
};

DHT dht(DHT_PIN, DHT_TYPE);

// ── SETUP ────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n🌿 Smart Greenhouse ESP8266 Starting...");

  pinMode(SOIL_PIN,  INPUT);
  pinMode(LDR_PIN,   INPUT);
  pinMode(PIN_KIPAS, OUTPUT);
  pinMode(PIN_LAMPU, OUTPUT);
  pinMode(PIN_POMPA, OUTPUT);

  // Relay active LOW: HIGH = OFF saat startup
  digitalWrite(PIN_KIPAS, HIGH);
  digitalWrite(PIN_LAMPU, HIGH);
  digitalWrite(PIN_POMPA, HIGH);

  dht.begin();
  connectWiFi();

  urlPostData  = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/data";
  urlGetConfig = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/config";

  Serial.println("POST: " + urlPostData);
  Serial.println("GET : " + urlGetConfig);
  Serial.println("✅ Setup selesai!");
}

// ── LOOP ─────────────────────────────────────────────────────
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Terputus! Menghubungkan ulang...");
    connectWiFi();
  }

  unsigned long now = millis();

  if (now - lastConfig >= CONFIG_INTERVAL || lastConfig == 0) {
    fetchConfig();
    lastConfig = now;
  }

  if (now - lastSend >= SEND_INTERVAL || lastSend == 0) {
    GHSensor sensor = readSensors();
    if (sensor.valid) {
      applyActuators(sensor);
      sendData(sensor);
    } else {
      Serial.println("[Sensor] Pembacaan gagal, skip...");
    }
    lastSend = now;
  }
}

// ── BACA SENSOR ──────────────────────────────────────────────
GHSensor readSensors() {
  GHSensor s;
  s.valid = false;

  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    Serial.println("[DHT22] Gagal membaca!");
    return s;
  }

  // Soil: 0 = BASAH, 1 = KERING
  int soilRaw = digitalRead(SOIL_PIN);
  s.kondisiTanah = (soilRaw == 0) ? "BASAH" : "KERING";

  // LDR: 0 = TERANG, 1 = GELAP
  int ldrRaw = digitalRead(LDR_PIN);
  s.kondisiCahaya = (ldrRaw == 0) ? "TERANG" : "GELAP";

  s.suhu           = t;
  s.kelembapanUdara = h;
  s.valid          = true;

  Serial.printf("[Sensor] Suhu:%.1fC | Humid:%.1f%% | Tanah:%s | Cahaya:%s\n",
    t, h, s.kondisiTanah.c_str(), s.kondisiCahaya.c_str());

  return s;
}

// ── LOGIKA AKTUATOR ──────────────────────────────────────────
void applyActuators(GHSensor& s) {
  // Kipas: ON jika suhu tinggi atau kelembapan udara tinggi
  bool kipas = (s.suhu > suhuMax) || (s.kelembapanUdara > kelembapanMax);

  // Pompa: ON jika tanah KERING
  bool pompa = (s.kondisiTanah == "KERING");

  // Lampu: ON jika cahaya GELAP
  bool lampu = (s.kondisiCahaya == "GELAP");

  digitalWrite(PIN_KIPAS, kipas ? LOW : HIGH);
  digitalWrite(PIN_POMPA, pompa ? LOW : HIGH);
  digitalWrite(PIN_LAMPU, lampu ? LOW : HIGH);

  Serial.printf("[Aktuator] Kipas:%s | Pompa:%s | Lampu:%s\n",
    kipas ? "ON" : "OFF",
    pompa ? "ON" : "OFF",
    lampu ? "ON" : "OFF");
}

// ── KIRIM DATA KE SERVER ──────────────────────────────────────
void sendData(GHSensor& s) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;
  http.begin(client, urlPostData);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["suhu"]             = s.suhu;
  doc["kelembapan_udara"] = s.kelembapanUdara;
  doc["kondisi_tanah"]    = s.kondisiTanah;
  doc["kondisi_cahaya"]   = s.kondisiCahaya;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code == HTTP_CODE_OK) {
    Serial.println("[HTTP] Terkirim ✓ " + http.getString());
  } else {
    Serial.printf("[HTTP] Gagal, kode: %d\n", code);
  }
  http.end();
}

// ── AMBIL CONFIG ──────────────────────────────────────────────
void fetchConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;
  http.begin(client, urlGetConfig);

  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    String payload = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err && doc["success"]) {
      JsonObject d = doc["data"];
      if (d.containsKey("suhuMax"))       suhuMax       = d["suhuMax"];
      if (d.containsKey("kelembapanMax")) kelembapanMax = d["kelembapanMax"];

      Serial.printf("[Config] suhuMax:%.1f kelembapanMax:%.1f\n",
        suhuMax, kelembapanMax);
    }
  } else {
    Serial.printf("[Config] GET gagal, kode: %d\n", code);
  }
  http.end();
}

// ── KONEKSI WIFI ──────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("[WiFi] Menghubungkan ke %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 20) {
    delay(500);
    Serial.print(".");
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Terhubung! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Gagal! Coba lagi...");
    delay(3000);
  }
}
