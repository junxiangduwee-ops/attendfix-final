const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const path   = require('path');

router.get('/login', (req, res) => {
  if (req.session?.userId) return res.redirect('/dashboard');
  res.sendFile('login.html', { root: path.join(__dirname, '../../public') });
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    const user = await db('users').where({ email: email.trim().toLowerCase() }).first();
    if (!user || !user.is_active || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid credentials.' });
    req.session.userId = user.id;
    req.session.role   = user.role;
    req.session.name   = user.name;
    await db('audit_logs').insert({ actor_id: user.id, action: 'LOGIN', ip: req.ip });
    res.json({ ok: true, role: user.role, name: user.name });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

router.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
router.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
module.exports = router;
