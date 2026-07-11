// db/database.js — MongoDB, Full Manual Control
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME     = 'greenhouse';

const DEFAULT_CONTROL = {
  _type:     'control',
  kipas:     false,
  lampu:     false,
  pompa:     false,
  updatedAt: new Date()
};

let client = null;
let db     = null;

async function connect() {
  if (db) return db;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('[MongoDB] Terhubung ke Atlas ✅');
  return db;
}

async function getDB() {
  if (!db) await connect();
  return db;
}

// ── ACTUATOR CONTROL ─────────────────────────────────────────
async function getControl() {
  const database = await getDB();
  let doc = await database.collection('control').findOne({ _type: 'control' });
  if (!doc) {
    await database.collection('control').insertOne({ ...DEFAULT_CONTROL });
    doc = await database.collection('control').findOne({ _type: 'control' });
  }
  return doc;
}

async function updateControl(updates) {
  const database = await getDB();
  const allowed  = ['kipas', 'lampu', 'pompa'];
  const filtered = { updatedAt: new Date() };
  for (const k of allowed) if (updates[k] !== undefined) filtered[k] = Boolean(updates[k]);
  await database.collection('control').updateOne(
    { _type: 'control' },
    { $set: filtered },
    { upsert: true }
  );
  return getControl();
}

// ── ESP8266 HEARTBEAT ─────────────────────────────────────────
async function updateEspHeartbeat() {
  const database = await getDB();
  await database.collection('esp_status').updateOne(
    { _type: 'esp_status' },
    { $set: { _type: 'esp_status', lastSeen: new Date(), online: true } },
    { upsert: true }
  );
}

async function getEspStatus() {
  const database = await getDB();
  const doc = await database.collection('esp_status').findOne({ _type: 'esp_status' });
  if (!doc) return { online: false, lastSeen: null };
  // ESP dianggap offline jika tidak ada heartbeat > 30 detik
  const diffMs = Date.now() - new Date(doc.lastSeen).getTime();
  return {
    online:   diffMs < 30000,
    lastSeen: doc.lastSeen
  };
}

// ── SENSOR DATA ──────────────────────────────────────────────
async function insertSensorData(data) {
  const database = await getDB();
  const doc      = { ...data, timestamp: new Date() };
  const result   = await database.collection('sensor_data').insertOne(doc);

  const count = await database.collection('sensor_data').countDocuments();
  if (count > 1000) {
    const oldest = await database.collection('sensor_data')
      .find({}).sort({ timestamp: 1 }).limit(count - 1000).toArray();
    const ids = oldest.map(d => d._id);
    await database.collection('sensor_data').deleteMany({ _id: { $in: ids } });
  }
  return { ...doc, _id: result.insertedId };
}

async function getLatestSensorData() {
  const database = await getDB();
  return await database.collection('sensor_data').findOne({}, { sort: { timestamp: -1 } }) || null;
}

async function getSensorHistory(limit = 50) {
  const database = await getDB();
  const docs = await database.collection('sensor_data')
    .find({}).sort({ timestamp: -1 }).limit(Math.min(limit, 500)).toArray();
  return docs.reverse();
}

module.exports = {
  getControl, updateControl,
  updateEspHeartbeat, getEspStatus,
  insertSensorData, getLatestSensorData, getSensorHistory
};
