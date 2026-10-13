const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyDecision } = require('../services/email');
const { pushCorrectionToHR } = require('../services/sync');

const HOD_ROLES = ['HOD', 'HR', 'ADMIN'];

const crWithUser = () =>
  db('correction_requests as cr')
    .join('users as u', 'u.id', 'cr.user_id')
    .join('attendance as a', 'a.id', 'cr.attendance_id')
    .select(
      db.raw('cr.id                as id'),
      db.raw('cr.user_id           as user_id'),
      db.raw('cr.attendance_id     as attendance_id'),
      db.raw('cr.date              as date'),
      db.raw('cr.field_missing     as field_missing'),
      db.raw('cr.proposed_time     as proposed_time'),
      db.raw('cr.justification     as justification'),
      db.raw('cr.evidence          as evidence'),
      db.raw('cr.status            as status'),
      db.raw('cr.hod_id            as hod_id'),
      db.raw('cr.hod_remarks       as hod_remarks'),
      db.raw('cr.decided_at        as decided_at'),
      db.raw('cr.hr_synced         as hr_synced'),
      db.raw('cr.hr_sync_status    as hr_sync_status'),
      db.raw('cr.hr_sync_error     as hr_sync_error'),
      db.raw('cr.hr_synced_at      as hr_synced_at'),
      db.raw('cr.created_at        as created_at'),
      db.raw('cr.updated_at        as updated_at'),
      db.raw('u.name               as employee_name'),
      db.raw('u.staff_id           as staff_id'),
      db.raw('u.department         as department'),
      db.raw('u.email              as email'),
      db.raw('u.hod_id             as employee_hod_id'),
      db.raw('a.hr_record_id       as hr_record_id'),
    );

// Pending approvals for this HOD's team
router.get('/api/hod/corrections/pending', requireAuth, requireRole(...HOD_ROLES), async (req, res) => {
  try {
    let q = crWithUser().where('cr.status', 'PENDING');
    if (req.session.role === 'HOD') q = q.where('u.hod_id', req.session.userId);
    const rows = await q.orderBy('cr.created_at', 'asc');
    // Debug: log first row keys so we can see what the DB actually returns
    if (rows.length > 0) console.log('[DEBUG] pending row keys:', Object.keys(rows[0]));
    res.json(rows);
  } catch (e) { console.error('[HOD pending error]', e); res.status(500).json({ error: 'Server error.' }); }
});

// All requests with filters (history)
router.get('/api/hod/corrections/all', requireAuth, requireRole(...HOD_ROLES), async (req, res) => {
  try {
    const { status, from, to, page = 1, limit = 50 } = req.query;
    let q = crWithUser().leftJoin('users as h', 'h.id', 'cr.hod_id').select('h.name as hod_name');
    if (req.session.role === 'HOD') q = q.where('u.hod_id', req.session.userId);
    if (status) q = q.where('cr.status', status.toUpperCase());
    if (from)   q = q.where('cr.date', '>=', from);
    if (to)     q = q.where('cr.date', '<=', to);
    const [{ count }] = await q.clone().clearSelect().count('cr.id as count');
    const rows = await q.orderBy('cr.created_at', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    res.json({ rows, total: parseInt(count), page: parseInt(page) });
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

// Approve
router.post('/api/hod/corrections/:id/approve', requireAuth, requireRole(...HOD_ROLES), async (req, res) => {
  try {
    const cr = await crWithUser().where('cr.id', parseInt(req.params.id)).first();
    if (!cr)                     return res.status(404).json({ error: 'Request not found.' });
    if (cr.status !== 'PENDING') return res.status(409).json({ error: 'Already decided.' });
    if (req.session.role === 'HOD' && cr.employee_hod_id !== req.session.userId)
      return res.status(403).json({ error: 'Not your employee.' });

    const field = cr.field_missing === 'clock_in' ? 'clock_in' : 'clock_out';

    // Atomic: approve + auto-fill local attendance
    await db.transaction(async trx => {
      await trx('correction_requests').where({ id: cr.id }).update({
        status: 'APPROVED', hod_id: req.session.userId,
        decided_at: new Date(), updated_at: new Date(),
      });
      await trx('attendance').where({ id: cr.attendance_id }).update({
        [field]: cr.proposed_time, source: 'CORRECTED', updated_at: new Date(),
      });
    });

    // Push correction to HR system asynchronously
    // (don't block the response — retry job handles failures)
    pushCorrectionToHR(cr.id).catch(e => console.error('[HOD] HR push error:', e.message));

    // In-app notification → employee
    await db('notifications').insert({
      user_id: cr.user_id, type: 'request_approved',
      title:   'Correction approved ✓',
      message: `Your ${cr.field_missing.replace('_',' ')} correction for ${cr.date} was approved. The record has been updated to ${cr.proposed_time} and submitted to the HR system.`,
      ref_id:  cr.id,
    });

    // In-app confirmation → HOD (so it appears in their notification log)
    await db('notifications').insert({
      user_id: req.session.userId, type: 'decision_logged',
      title:   `Correction approved — ${cr.employee_name}`,
      message: `You approved ${cr.employee_name}'s ${cr.field_missing.replace('_',' ')} correction for ${cr.date}. Record updated to ${cr.proposed_time}.`,
      ref_id:  cr.id,
    });

    await db('audit_logs').insert({ actor_id: req.session.userId, action: 'APPROVE_CORRECTION', target: `cr:${cr.id}`, detail: `${cr.employee_name} · ${cr.date} · ${cr.field_missing} → ${cr.proposed_time}`, ip: req.ip });

    const employee = await db('users').where({ id: cr.user_id }).first();
    notifyDecision(employee, cr, true).catch(e => console.error('Email:', e.message));

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// Reject
router.post('/api/hod/corrections/:id/reject', requireAuth, requireRole(...HOD_ROLES), async (req, res) => {
  try {
    const { hodRemarks } = req.body;
    if (!hodRemarks) return res.status(400).json({ error: 'Remarks required when rejecting.' });

    const cr = await crWithUser().where('cr.id', parseInt(req.params.id)).first();
    if (!cr)                     return res.status(404).json({ error: 'Request not found.' });
    if (cr.status !== 'PENDING') return res.status(409).json({ error: 'Already decided.' });
    if (req.session.role === 'HOD' && cr.employee_hod_id !== req.session.userId)
      return res.status(403).json({ error: 'Not your employee.' });

    await db('correction_requests').where({ id: cr.id }).update({
      status: 'REJECTED', hod_id: req.session.userId,
      hod_remarks: hodRemarks, decided_at: new Date(), updated_at: new Date(),
    });

    // In-app notification → employee
    await db('notifications').insert({
      user_id: cr.user_id, type: 'request_rejected',
      title:   'Correction rejected',
      message: `Your ${cr.field_missing.replace('_',' ')} correction for ${cr.date} was rejected. Reason: ${hodRemarks}`,
      ref_id:  cr.id,
    });

    // In-app confirmation → HOD
    await db('notifications').insert({
      user_id: req.session.userId, type: 'decision_logged',
      title:   `Correction rejected — ${cr.employee_name}`,
      message: `You rejected ${cr.employee_name}'s ${cr.field_missing.replace('_',' ')} correction for ${cr.date}. They have been notified and may resubmit.`,
      ref_id:  cr.id,
    });

    await db('audit_logs').insert({ actor_id: req.session.userId, action: 'REJECT_CORRECTION', target: `cr:${cr.id}`, detail: `${cr.employee_name} · ${cr.date}`, ip: req.ip });

    const employee = await db('users').where({ id: cr.user_id }).first();
    notifyDecision(employee, { ...cr, hod_remarks: hodRemarks }, false).catch(e => console.error('Email:', e.message));

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// Team attendance grid
router.get('/api/hod/team/attendance', requireAuth, requireRole(...HOD_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = db('attendance as a')
      .join('users as u', 'u.id', 'a.user_id')
      .select('a.*', 'u.name', 'u.staff_id')
      .where('u.hod_id', req.session.userId)
      .where('u.is_active', true);
    if (from) q = q.where('a.date', '>=', from);
    if (to)   q = q.where('a.date', '<=', to);
    res.json(await q.orderBy(['u.name', 'a.date']));
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

// HOD dashboard stats
router.get('/api/hod/stats', requireAuth, requireRole(...HOD_ROLES), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [[p], [t], [m], [hr]] = await Promise.all([
      db('correction_requests as cr').join('users as u','u.id','cr.user_id').where('u.hod_id', req.session.userId).where('cr.status','PENDING').count('cr.id as c'),
      db('users').where({ hod_id: req.session.userId, is_active: true }).count('id as c'),
      db('attendance as a').join('users as u','u.id','a.user_id').where('u.hod_id', req.session.userId).where('a.date','<',today).where(function(){ this.whereNull('a.clock_in').orWhereNull('a.clock_out'); }).count('a.id as c'),
      db('correction_requests as cr').join('users as u','u.id','cr.user_id').where('u.hod_id', req.session.userId).where({ 'cr.status': 'APPROVED', 'cr.hr_synced': false }).count('cr.id as c'),
    ]);
    res.json({ pending: parseInt(p.c), teamSize: parseInt(t.c), missingCount: parseInt(m.c), hrPendingSync: parseInt(hr.c) });
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

// HR sync log (visible to HR/Admin)
router.get('/api/hod/sync-log', requireAuth, requireRole('HR','ADMIN'), async (req, res) => {
  try {
    const rows = await db('hr_sync_log').orderBy('created_at','desc').limit(50);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
