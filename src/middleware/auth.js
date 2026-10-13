function requireAuth(req, res, next) {
  if (!req.session?.userId)
    return req.path.startsWith('/api/') ? res.status(401).json({ error: 'Not authenticated.' }) : res.redirect('/login');
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated.' });
    if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'Insufficient permissions.' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
