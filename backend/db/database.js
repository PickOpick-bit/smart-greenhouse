// db/database.js — MongoDB + Actuator Control
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME     = 'greenhouse';

const DEFAULT_CONFIG = {
  suhuMax: 30, soilMin: 40, cahayaMin: 300,
  kelembapanMin: 60, kelembapanMax: 85
};

const DEFAULT_CONTROL = {
  _type: 'control',
  mode: 'auto',  // 'auto' atau 'manual'
  kipas: false,
  lampu: false,
  pompa: false,
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

// ── CONFIG ───────────────────────────────────────────────────
async function getConfig() {
  const database = await getDB();
  let doc = await database.collection('config').findOne({ _type: 'config' });
  if (!doc) {
    const newDoc = { _type: 'config', ...DEFAULT_CONFIG, updatedAt: new Date() };
    await database.collection('config').insertOne(newDoc);
    doc = await database.collection('config').findOne({ _type: 'config' });
  }
  return doc;
}

async function updateConfig(updates) {
  const database = await getDB();
  const allowed  = ['suhuMax', 'soilMin', 'cahayaMin', 'kelembapanMin', 'kelembapanMax'];
  const filtered = { updatedAt: new Date() };
  for (const k of allowed) if (updates[k] !== undefined) filtered[k] = updates[k];
  await database.collection('config').updateOne(
    { _type: 'config' },
    { $set: filtered },
    { upsert: true }
  );
  return getConfig();
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
  const allowed  = ['mode', 'kipas', 'lampu', 'pompa'];
  const filtered = { updatedAt: new Date() };
  for (const k of allowed) if (updates[k] !== undefined) filtered[k] = updates[k];
  await database.collection('control').updateOne(
    { _type: 'control' },
    { $set: filtered },
    { upsert: true }
  );
  return getControl();
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
  const doc = await database.collection('sensor_data')
    .findOne({}, { sort: { timestamp: -1 } });
  return doc || null;
}

async function getSensorHistory(limit = 50) {
  const database = await getDB();
  const docs = await database.collection('sensor_data')
    .find({}).sort({ timestamp: -1 }).limit(Math.min(limit, 500)).toArray();
  return docs.reverse();
}

module.exports = {
  getConfig, updateConfig,
  getControl, updateControl,
  insertSensorData, getLatestSensorData, getSensorHistory
};
