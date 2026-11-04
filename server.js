require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const escaneosRoutes = require('./routes/escaneos');
const { db, inicializarBaseDatos } = require('./db');

const app = express();
const PORT = process.env.PORT || 3002;
const ORIGEN_PRODUCCION = 'https://eco-scann-fron.vercel.app';
const PREVIEWS_VERCEL = /^https:\/\/eco-scann-fron-[a-z0-9-]+-luiscajigas-projects\.vercel\.app$/;
const origenesPermitidos = [
  ORIGEN_PRODUCCION,
  ...(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origen) => origen.trim().replace(/\/+$/, ''))
    .filter(Boolean)
];

app.use(cors({
  origin(origen, callback) {
    if (
      !origen ||
      origenesPermitidos.includes(origen) ||
      PREVIEWS_VERCEL.test(origen) ||
      (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origen))
    ) {
      return callback(null, true);
    }
    console.warn(`Origen rechazado por CORS: ${origen}`);
    return callback(null, false);
  }
}));
app.use(express.json({ limit: '5mb' })); // la imagen comprimida viaja como base64

app.get('/api/salud', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ estado: 'ok', servicio: 'ecoscan-backend', baseDatos: 'conectada' });
  } catch (err) {
    console.error(err);
    res.status(503).json({ estado: 'error', servicio: 'ecoscan-backend' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api', escaneosRoutes);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  const mensajes = { 400: 'Solicitud inválida.', 413: 'La imagen es demasiado grande.' };
  const estado = mensajes[err.status] ? err.status : 500;
  res.status(estado).json({ error: mensajes[estado] || 'Error interno del servidor.' });
});

const REINTENTO_BASE_MS = 15000;

function prepararBaseDatos() {
  inicializarBaseDatos()
    .then(() => console.log('Base de datos lista.'))
    .catch((err) => {
      console.error('No se pudo preparar la base de datos:', err.message);
      setTimeout(prepararBaseDatos, REINTENTO_BASE_MS);
    });
}

app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`Backend de EcoScan escuchando en el puerto ${PORT}`);
  prepararBaseDatos();
});
