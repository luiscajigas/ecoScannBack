const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { SECRETO } = require('../middleware/auth');

const router = express.Router();

function firmarToken(usuarioId) {
  return jwt.sign({ usuarioId }, SECRETO, { expiresIn: '7d' });
}

router.post('/registro', async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password son obligatorios.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const resultado = await db.query(
      'INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id, nombre, email, puntos',
      [nombre, email, passwordHash]
    );
    const usuario = resultado.rows[0];

    res.status(201).json({ token: firmarToken(usuario.id), usuario });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al registrar el usuario.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son obligatorios.' });
  }

  let usuario;
  try {
    const resultado = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    usuario = resultado.rows[0];
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
  if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas.' });

  const coincide = await bcrypt.compare(password, usuario.password_hash);
  if (!coincide) return res.status(401).json({ error: 'Credenciales inválidas.' });

  res.json({
    token: firmarToken(usuario.id),
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, puntos: usuario.puntos }
  });
});

module.exports = router;
