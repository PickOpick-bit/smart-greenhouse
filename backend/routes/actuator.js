// routes/actuator.js — Full Manual Control
const express = require('express');
const router  = express.Router();
const { getControl, updateControl } = require('../db/database');

// GET /actuator — ambil status kontrol (untuk ESP8266 & dashboard)
router.get('/', async (req, res) => {
  try {
    const control = await getControl();
    const { _id, _type, updatedAt, ...data } = control;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /actuator — update status aktuator dari dashboard
router.post('/', async (req, res) => {
  try {
    const { kipas, lampu, pompa } = req.body;
    const updates = {};
    if (kipas !== undefined) updates.kipas = Boolean(kipas);
    if (lampu !== undefined) updates.lampu = Boolean(lampu);
    if (pompa !== undefined) updates.pompa = Boolean(pompa);

    const updated = await updateControl(updates);
    const { _id, _type, updatedAt, ...data } = updated;

    // WebSocket broadcast
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
