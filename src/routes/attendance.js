const router = require('express').Router();
const db     = require('../db');
const { requireAuth } = require('../middleware/auth');

// Attendance log with pagination
router.get('/api/attendance', requireAuth, async (req, res) => {
  try {
    const { from, to, page = 1, limit = 31 } = req.query;
    let q = db('attendance').where({ user_id: req.session.userId });
    if (from) q = q.where('date', '>=', from);
    if (to)   q = q.where('date', '<=', to);
    const [{ count }] = await q.clone().count('id as count');
    const records = await q.orderBy('date', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    res.json({ records, total: parseInt(count), page: parseInt(page) });
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

// Missing records (no clock_in or clock_out) — last 30 days
router.get('/api/attendance/missing', requireAuth, async (req, res) => {
  try {
    const today  = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const from30 = cutoff.toISOString().slice(0, 10);

    const records = await db('attendance')
      .where({ user_id: req.session.userId })
      .where('date', '>=', from30)
      .where('date', '<', today)
      .where(function () { this.whereNull('clock_in').orWhereNull('clock_out'); })
      .orderBy('date', 'desc');

    // Attach any existing correction request status
    const enriched = await Promise.all(records.map(async r => {
      const cr = await db('correction_requests')
        .where({ attendance_id: r.id })
        .whereIn('status', ['PENDING', 'APPROVED'])
        .orderBy('created_at', 'desc')
        .first();
      return { ...r, req_id: cr?.id || null, req_status: cr?.status || null };
    }));

    res.json(enriched);
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

// Dashboard stats
router.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const uid   = req.session.userId;
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    const [[complete], [missing], [pending]] = await Promise.all([
      db('attendance').where({ user_id: uid }).whereNotNull('clock_in').whereNotNull('clock_out').whereLike('date', `${month}%`).count('id as c'),
      db('attendance').where({ user_id: uid }).where('date', '<', today).where(function () { this.whereNull('clock_in').orWhereNull('clock_out'); }).count('id as c'),
      db('correction_requests').where({ user_id: uid, status: 'PENDING' }).count('id as c'),
    ]);

    res.json({ complete: parseInt(complete.c), missing: parseInt(missing.c), pendingReqs: parseInt(pending.c) });
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
