const router  = require('express').Router();
const multer  = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX    = require('xlsx');
const db      = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pullFromHR, detectMissing, syncEmployees, retryFailedPushes } = require('../services/sync');

const upload   = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const HR_ROLES = ['HR', 'ADMIN'];

// Parse rows from either CSV or Excel buffer — returns array of plain objects
function parseFile(buffer, mimetype, originalname) {
  const ext = (originalname || '').split('.').pop().toLowerCase();
  const isExcel = ext === 'xlsx' || ext === 'xls' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel';

  if (isExcel) {
    const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]]; // first sheet
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return rows;
  }

  // CSV fallback
  return parse(buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
}

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

    let rows;
    try {
      rows = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    } catch (e) {
      return res.status(400).json({ error: `Could not read file: ${e.message}` });
    }

    if (!rows.length) return res.status(400).json({ error: 'File is empty or has no data rows.' });

    // Normalise a time value from various formats → HH:MM:SS or null
    function normaliseTime(val) {
      if (!val && val !== 0) return null;
      // Excel serial time (fraction of a day)
      if (typeof val === 'number') {
        const totalSecs = Math.round(val * 86400);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      }
      const str = String(val).trim();
      if (!str) return null;
      // HH:MM → HH:MM:00
      if (/^\d{1,2}:\d{2}$/.test(str)) return `${str}:00`;
      // HH:MM:SS already
      if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) return str;
      return str;
    }

    // Normalise a date value → YYYY-MM-DD or null
    function normaliseDate(val) {
      if (!val) return null;
      // JS Date from xlsx cellDates
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      const str = String(val).trim();
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      // DD/MM/YYYY
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
        const [d, m, y] = str.split('/');
        return `${y}-${m}-${d}`;
      }
      // Try native parse
      const d = new Date(str);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
      return null;
    }

    let imported = 0;
    const errors = [];

    for (const r of rows) {
      try {
        const staffId  = String(r.staff_id || r.staffId || r['Staff ID'] || r['StaffID'] || '').trim();
        const date     = normaliseDate(r.date || r.Date || r['Attendance Date']);
        const clockIn  = normaliseTime(r.clock_in  || r.clockIn  || r['Clock In']  || r['Time In']  || null);
        const clockOut = normaliseTime(r.clock_out || r.clockOut || r['Clock Out'] || r['Time Out'] || null);

        if (!staffId) throw new Error('staff_id is missing');
        if (!date)    throw new Error('date is missing or unrecognised format');

        const user = await db('users').where({ staff_id: staffId }).first();
        if (!user) throw new Error(`Staff ID "${staffId}" not found in system`);

        await db('attendance')
          .insert({ user_id: user.id, date, clock_in: clockIn, clock_out: clockOut, source: 'HR_SYSTEM', synced_at: new Date() })
          .onConflict(['user_id', 'date'])
          .merge({ clock_in: clockIn, clock_out: clockOut, synced_at: new Date(), updated_at: new Date() });

        imported++;
      } catch (err) { errors.push({ row: r, error: err.message }); }
    }

    const fileType = (req.file.originalname || '').endsWith('.xlsx') || (req.file.originalname || '').endsWith('.xls') ? 'EXCEL' : 'CSV';
    await db('audit_logs').insert({ actor_id: req.session.userId, action: `${fileType}_IMPORT`, detail: `Imported:${imported} Errors:${errors.length}`, ip: req.ip });
    await db('hr_sync_log').insert({ direction: 'pull', status: errors.length ? 'partial' : 'ok', records_affected: imported, detail: `${fileType} upload by user ${req.session.userId}` });
    res.json({ imported, skipped: errors.length, errors });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// CSV template download (no auth needed — it's just a blank template)
router.get('/api/hr/import/template', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance_template.csv"');
  res.send('staff_id,date,clock_in,clock_out\nE-04291,2026-10-13,09:00,18:00\nE-04287,2026-10-13,08:55,17:45\n');
});

// Excel template download (no auth needed — it's just a blank template)
router.get('/api/hr/import/template/excel', (req, res) => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Data template
  const data = [
    ['staff_id',  'date',        'clock_in', 'clock_out'],
    ['E-04291',   '2026-10-13',  '09:00',    '18:00'   ],
    ['E-04287',   '2026-10-13',  '08:55',    '17:45'   ],
    ['E-04291',   '2026-10-14',  '08:30',    ''        ],  // missing clock_out example
    ['E-04287',   '2026-10-14',  '',         '17:30'   ],  // missing clock_in example
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  // Sheet 2: Instructions
  const instructions = [
    ['AttendFix — Attendance Import Template'],
    [''],
    ['COLUMN', 'FORMAT', 'REQUIRED', 'EXAMPLE'],
    ['staff_id',  'Text — must match staff ID in system',    'Yes', 'E-04291'    ],
    ['date',      'YYYY-MM-DD',                              'Yes', '2026-10-13' ],
    ['clock_in',  'HH:MM or HH:MM:SS — leave blank if missing', 'No', '09:00'  ],
    ['clock_out', 'HH:MM or HH:MM:SS — leave blank if missing', 'No', '18:00'  ],
    [''],
    ['NOTES'],
    ['- One row per employee per day'],
    ['- Leave clock_in or clock_out blank to mark as missing (will trigger correction flow)'],
    ['- If a record already exists for that employee+date, it will be overwritten'],
    ['- Maximum file size: 10 MB'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr['!cols'] = [{ wch: 20 }, { wch: 45 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance_template.xlsx"');
  res.send(buf);
});

// Sync log
router.get('/api/hr/sync-log', requireAuth, requireRole(...HR_ROLES), async (req, res) => {
  try {
    const rows = await db('hr_sync_log').orderBy('created_at','desc').limit(100);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
