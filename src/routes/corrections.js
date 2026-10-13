const router = require('express').Router();
const db     = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notifyHODApproval } = require('../services/email');

// Submit a correction request
router.post('/api/corrections', requireAuth, async (req, res) => {
  try {
    const { date, fieldMissing, proposedTime, justification, evidence } = req.body;
    if (!date || !fieldMissing || !proposedTime || !justification)
      return res.status(400).json({ error: 'All required fields must be filled.' });
    // Accept both camelCase (from frontend) and snake_case — normalise to snake_case for DB
    const normField = fieldMissing === 'clockIn' ? 'clock_in'
                    : fieldMissing === 'clockOut' ? 'clock_out'
                    : fieldMissing;
    if (!['clock_in', 'clock_out'].includes(normField))
      return res.status(400).json({ error: 'Invalid field. Must be clock_in or clock_out.' });

    // Block duplicate pending
    const dup = await db('correction_requests')
      .where({ user_id: req.session.userId, date, field_missing: normField, status: 'PENDING' }).first();
    if (dup) return res.status(409).json({ error: 'A pending request already exists for this date and field.' });

    // Get attendance row (must exist — it was imported from HR)
    const att = await db('attendance').where({ user_id: req.session.userId, date }).first();
    if (!att) return res.status(404).json({ error: 'No attendance record found for this date. It may not have been synced from the HR system yet.' });

    const [cr] = await db('correction_requests').insert({
      user_id:       req.session.userId,
      attendance_id: att.id,
      date,
      field_missing: normField,
      proposed_time: proposedTime,
      justification,
      evidence:      evidence || null,
    }).returning('*');

    // Notify HOD
    const user = await db('users').where({ id: req.session.userId }).first();
    const hod  = user.hod_id ? await db('users').where({ id: user.hod_id }).first() : null;

    if (hod) {
      await db('notifications').insert({
        user_id: hod.id, type: 'approval_needed',
        title:   `Correction request — ${user.name}`,
        message: `${user.name} (${user.staff_id}) submitted a correction for ${date} (${normField.replace('_',' ')}). Proposed time: ${proposedTime}.`,
        ref_id:  cr.id,
      });
      notifyHODApproval({ ...cr, employee_name: user.name, staff_id: user.staff_id }, hod)
        .catch(e => console.error('Email error:', e.message));
    }

    // In-app + email confirmation → employee
    await db('notifications').insert({
      user_id: req.session.userId, type: 'request_submitted',
      title:   'Correction request submitted',
      message: `Your request for ${date} (${normField.replace('_',' ')}) has been sent to your HOD for approval. Proposed time: ${proposedTime}.`,
      ref_id:  cr.id,
    });
    const { notifySubmissionConfirm } = require('../services/email');
    notifySubmissionConfirm(user, { ...cr, field_missing: normField, proposed_time: proposedTime }, hod)
      .catch(e => console.error('Email error:', e.message));

    await db('audit_logs').insert({ actor_id: req.session.userId, action: 'SUBMIT_CORRECTION', target: `cr:${cr.id}`, detail: `${date} ${normField} → ${proposedTime}`, ip: req.ip });
    res.status(201).json({ ok: true, id: cr.id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// My correction history
router.get('/api/corrections', requireAuth, async (req, res) => {
  try {
    const rows = await db('correction_requests as cr')
      .leftJoin('users as h', 'h.id', 'cr.hod_id')
      .select('cr.*', 'h.name as hod_name')
      .where('cr.user_id', req.session.userId)
      .orderBy('cr.created_at', 'desc');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
