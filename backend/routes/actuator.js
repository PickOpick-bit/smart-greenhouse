// routes/actuator.js — Kontrol manual aktuator
const express = require('express');
const router  = express.Router();
const { getControl, updateControl } = require('../db/database');

// GET /actuator — ambil status kontrol sekarang (untuk ESP8266)
router.get('/', async (req, res) => {
  try {
    const control = await getControl();
    const { _id, _type, updatedAt, ...data } = control;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /actuator — update mode atau status aktuator dari dashboard
router.post('/', async (req, res) => {
  try {
    const { mode, kipas, lampu, pompa } = req.body;

    if (mode && !['auto', 'manual'].includes(mode))
      return res.status(400).json({ success: false, message: 'mode harus auto atau manual' });

    const updates = {};
    if (mode  !== undefined) updates.mode  = mode;
    if (kipas !== undefined) updates.kipas = Boolean(kipas);
    if (lampu !== undefined) updates.lampu = Boolean(lampu);
    if (pompa !== undefined) updates.pompa = Boolean(pompa);

    const updated = await updateControl(updates);
    const { _id, _type, updatedAt, ...data } = updated;

    // WebSocket broadcast ke dashboard
    if (req.app.locals.wss) {
      const payload = JSON.stringify({ type: 'control_update', data });
      req.app.locals.wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
    }

    res.json({ success: true, message: 'Kontrol diperbarui', data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
