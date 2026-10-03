const jwt = require('jsonwebtoken');

const SECRETO = process.env.JWT_SECRET;

if (!SECRETO || SECRETO.length < 32) {
  throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 caracteres.');
}

function requiereAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'No autenticado. Falta el token.' });

  try {
    const payload = jwt.verify(token, SECRETO);
    req.usuarioId = payload.usuarioId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

module.exports = { requiereAuth, SECRETO };
