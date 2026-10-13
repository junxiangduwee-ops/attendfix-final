const router  = require('express').Router();
const multer  = require('multer');
const { parse } = require('csv-parse/sync');
const db      = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pullFromHR, detectMissing, syncEmployees, retryFailedPushes } = require('../services/sync');

const upload   = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const HR_ROLES = ['HR', 'ADMIN'];

// Manual: trigger HR attendance pull for a specific date
router.post('/api/hr/pull', requireAuth, requireRole(...HR_ROLES), async (req, res) => {
  try {
    const { date } = req.body;
    const target = date || new Date().toISOString().slice(0, 10);
    const result = await pullFromHR(target);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Manual: trigger missing-record detection
router.post('/api/hr/detect-missing', requireAuth, requireRole(...HR_ROLES), async (req, res) => {
  try {
    const { date } = req.body;
    const target = date || new Date().toISOString().slice(0, 10);
    const result = await detectMissing(target);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Manual: sync employee roster
router.post('/api/hr/sync-employees', requireAuth, requireRole(...HR_ROLES), async (req, res) => {
  try {
    const result = await syncEmployees();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Manual: retry failed HR push-backs
router.post('/api/hr/retry-pushes', requireAuth, requireRole(...HR_ROLES), async (req, res) => {
  try {
    await retryFailedPushes();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CSV upload (fallback when HR system not connected)
router.post('/api/hr/import/csv', requireAuth, requireRole(...HR_ROLES), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const rows = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
    const pad  = t => (t && t.length === 5) ? `${t}:00` : t;
    let imported = 0; const errors = [];

    for (const r of rows) {
      try {
        const staffId  = r.staff_id || r.staffId;
        const date     = r.date;
        const clockIn  = pad(r.clock_in  || r.clockIn  || null);
        const clockOut = pad(r.clock_out || r.clockOut || null);
        if (!staffId || !date) throw new Error('staff_id and date are required');

        const user = await db('users').where({ staff_id: staffId }).first();
        if (!user) throw new Error(`Staff ID ${staffId} not found`);

        await db('attendance')
          .insert({ user_id: user.id, date, clock_in: clockIn, clock_out: clockOut, source: 'HR_SYSTEM', synced_at: new Date() })
          .onConflict(['user_id', 'date'])
          .merge({ clock_in: clockIn, clock_out: clockOut, synced_at: new Date(), updated_at: new Date() });

        imported++;
      } catch (err) { errors.push({ row: r, error: err.message }); }
    }

    await db('audit_logs').insert({ actor_id: req.session.userId, action: 'CSV_IMPORT', detail: `Imported:${imported} Errors:${errors.length}`, ip: req.ip });
    await db('hr_sync_log').insert({ direction: 'pull', status: errors.length ? 'partial' : 'ok', records_affected: imported, detail: `CSV upload by user ${req.session.userId}` });
    res.json({ imported, skipped: errors.length, errors });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// CSV template download
router.get('/api/hr/import/template', requireAuth, requireRole(...HR_ROLES), (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance_template.csv"');
  res.send('staff_id,date,clock_in,clock_out\nE-04291,2026-10-13,09:00,18:00\nE-04287,2026-10-13,08:55,17:45\n');
});

// Sync log
router.get('/api/hr/sync-log', requireAuth, requireRole(...HR_ROLES), async (req, res) => {
  try {
    const rows = await db('hr_sync_log').orderBy('created_at','desc').limit(100);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
