const express = require('express');
const router  = express.Router();
const { getConfig, updateConfig } = require('../db/database');

router.get('/', async (req, res) => {
  try {
    const cfg = await getConfig();
    const { _id, _type, updatedAt, ...data } = cfg;
    res.json({ success: true, data, updated_at: updatedAt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const allowed = ['suhuMax', 'soilMin', 'cahayaMin', 'kelembapanMin', 'kelembapanMax'];
    const body = req.body;
    for (const key of Object.keys(body)) {
      if (!allowed.includes(key)) return res.status(400).json({ success: false, message: `Parameter tidak dikenal: ${key}` });
      if (typeof body[key] !== 'number') return res.status(400).json({ success: false, message: `${key} harus berupa angka` });
    }
    const updated = await updateConfig(body);
    const { _id, _type, updatedAt, ...data } = updated;
    res.json({ success: true, message: 'Konfigurasi berhasil diperbarui', data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
