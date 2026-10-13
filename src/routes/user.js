const router = require('express').Router();
const db     = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await db('users').select('id','name','email','staff_id','department','role').where({ id: req.session.userId }).first();
    if (!user) return res.status(404).json({ error: 'Not found.' });
    // Only count notifications that need the user's attention
    // Exclude confirmations (request_submitted, decision_logged) which are just receipts
    const [{ count }] = await db('notifications')
      .where({ user_id: req.session.userId, is_read: false })
      .whereIn('type', ['missing_record', 'request_rejected', 'approval_needed', 'team_missing_record'])
      .count('id as count');
    res.json({ ...user, unreadCount: parseInt(count) });
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

router.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const rows = await db('notifications').where({ user_id: req.session.userId }).orderBy('created_at','desc').limit(25);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await db('notifications').where({ user_id: req.session.userId }).update({ is_read: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error.' }); }
});
module.exports = router;
