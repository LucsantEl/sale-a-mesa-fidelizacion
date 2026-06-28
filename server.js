const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Pool } = require('pg');
const { PDFDocument } = require('pdf-lib');

const PLANTILLA_PATH = path.join(__dirname, 'assets', 'plantilla.pdf');
const QR_SIZE = 540;
const QR_X = (1080 - QR_SIZE) / 2;
const QR_Y = (1920 - QR_SIZE) / 2;

const VISITS_FOR_PRIZE = 10;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'saleamesa2026';
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      celular TEXT NOT NULL,
      visitas INTEGER NOT NULL DEFAULT 0,
      premios_canjeados INTEGER NOT NULL DEFAULT 0,
      creado TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS visitas_log (
      id SERIAL PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      fecha TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function requireStaff(req, res, next) {
  if (req.body.password !== STAFF_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña de staff incorrecta' });
  }
  next();
}

// Registrar nuevo cliente
app.post('/api/clientes', async (req, res) => {
  const { nombre, celular } = req.body;
  if (!nombre || !celular) return res.status(400).json({ error: 'Falta nombre o celular' });

  const existing = await pool.query('SELECT id FROM clientes WHERE celular = $1', [celular]);
  if (existing.rows.length > 0) {
    return res.json({ id: existing.rows[0].id, existente: true });
  }

  const id = crypto.randomBytes(6).toString('hex');
  await pool.query('INSERT INTO clientes (id, nombre, celular) VALUES ($1, $2, $3)', [id, nombre, celular]);
  res.json({ id, existente: false });
});

// Datos de un cliente
app.get('/api/clientes/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
  const cliente = result.rows[0];
  const enCiclo = cliente.visitas % VISITS_FOR_PRIZE;
  res.json({
    ...cliente,
    visitasParaPremio: VISITS_FOR_PRIZE,
    visitasRestantes: Math.max(0, VISITS_FOR_PRIZE - enCiclo)
  });
});

// Generar imagen QR para un cliente
app.get('/api/clientes/:id/qr', async (req, res) => {
  const url = `${baseUrl(req)}/cliente/${req.params.id}`;
  const png = await QRCode.toBuffer(url, { width: 300, margin: 2 });
  res.type('png').send(png);
});

// Generar tarjeta PDF
app.get('/api/clientes/:id/tarjeta-pdf', async (req, res) => {
  const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
  const cliente = result.rows[0];

  const url = `${baseUrl(req)}/cliente/${cliente.id}`;
  const qrPng = await QRCode.toBuffer(url, { width: QR_SIZE, margin: 1 });

  const plantillaBytes = fs.readFileSync(PLANTILLA_PATH);
  const plantillaDoc = await PDFDocument.load(plantillaBytes);
  const outDoc = await PDFDocument.create();
  const [plantillaPage] = await outDoc.embedPdf(plantillaDoc, [0]);

  const page = outDoc.addPage([plantillaPage.width, plantillaPage.height]);
  page.drawPage(plantillaPage);

  const qrImage = await outDoc.embedPng(qrPng);
  page.drawImage(qrImage, { x: QR_X, y: QR_Y, width: QR_SIZE, height: QR_SIZE });

  const pdfBytes = await outDoc.save();
  res.type('application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="tarjeta-sale-a-mesa.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

// Staff: sumar una visita
app.post('/api/visitas/:id', requireStaff, async (req, res) => {
  const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

  await pool.query('UPDATE clientes SET visitas = visitas + 1 WHERE id = $1', [req.params.id]);
  await pool.query('INSERT INTO visitas_log (cliente_id) VALUES ($1)', [req.params.id]);

  const actualizado = (await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id])).rows[0];
  const ganoPremio = actualizado.visitas % VISITS_FOR_PRIZE === 0;
  res.json({ ...actualizado, ganoPremio, visitasParaPremio: VISITS_FOR_PRIZE });
});

// Staff: canjear premio
app.post('/api/canjear/:id', requireStaff, async (req, res) => {
  const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

  await pool.query('UPDATE clientes SET premios_canjeados = premios_canjeados + 1 WHERE id = $1', [req.params.id]);
  const actualizado = (await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id])).rows[0];
  res.json(actualizado);
});

// Staff: estadísticas generales
app.post('/api/stats', requireStaff, async (req, res) => {
  const totalClientes = parseInt((await pool.query('SELECT COUNT(*) as n FROM clientes')).rows[0].n);
  const totalVisitas = parseInt((await pool.query('SELECT COALESCE(SUM(visitas),0) as n FROM clientes')).rows[0].n);
  const totalPremios = parseInt((await pool.query('SELECT COALESCE(SUM(premios_canjeados),0) as n FROM clientes')).rows[0].n);
  const recientes = (await pool.query(
    'SELECT nombre, celular, visitas, premios_canjeados, creado FROM clientes ORDER BY creado DESC LIMIT 10'
  )).rows;
  res.json({ totalClientes, totalVisitas, totalPremios, recientes });
});

app.get('/cliente/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Sale a Mesa fidelización corriendo en puerto ${PORT}`));
}).catch(err => {
  console.error('Error conectando a la base de datos:', err);
  process.exit(1);
});
