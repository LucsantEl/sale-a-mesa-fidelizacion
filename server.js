const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Database = require('better-sqlite3');
const { PDFDocument } = require('pdf-lib');

const PLANTILLA_PATH = path.join(__dirname, 'assets', 'plantilla.pdf');
// Posición del QR sobre la plantilla (1080x1920), centrado, ~50% del ancho.
const QR_SIZE = 540;
const QR_X = (1080 - QR_SIZE) / 2;
const QR_Y = (1920 - QR_SIZE) / 2;

const VISITS_FOR_PRIZE = 10;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'saleamesa2026';
const PORT = process.env.PORT || 3000;

const db = new Database(path.join(__dirname, 'fidelizacion.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    celular TEXT NOT NULL,
    visitas INTEGER NOT NULL DEFAULT 0,
    premios_canjeados INTEGER NOT NULL DEFAULT 0,
    creado TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS visitas_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id TEXT NOT NULL,
    fecha TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// Registrar nuevo cliente
app.post('/api/clientes', (req, res) => {
  const { nombre, celular } = req.body;
  if (!nombre || !celular) return res.status(400).json({ error: 'Falta nombre o celular' });

  const existing = db.prepare('SELECT id FROM clientes WHERE celular = ?').get(celular);
  if (existing) {
    return res.json({ id: existing.id, existente: true });
  }

  const id = crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO clientes (id, nombre, celular) VALUES (?, ?, ?)').run(id, nombre, celular);
  res.json({ id, existente: false });
});

// Datos de un cliente (página pública que abre el QR)
app.get('/api/clientes/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({
    ...cliente,
    visitasParaPremio: VISITS_FOR_PRIZE,
    visitasRestantes: Math.max(0, VISITS_FOR_PRIZE - (cliente.visitas % VISITS_FOR_PRIZE || (cliente.visitas > 0 && cliente.visitas % VISITS_FOR_PRIZE === 0 ? VISITS_FOR_PRIZE : 0)))
  });
});

// Generar imagen QR para un cliente
app.get('/api/clientes/:id/qr', async (req, res) => {
  const url = `${baseUrl(req)}/cliente/${req.params.id}`;
  const png = await QRCode.toBuffer(url, { width: 300, margin: 2 });
  res.type('png').send(png);
});

// Generar la tarjeta en PDF (plantilla + QR del cliente incrustado)
app.get('/api/clientes/:id/tarjeta-pdf', async (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

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

function requireStaff(req, res, next) {
  if (req.body.password !== STAFF_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña de staff incorrecta' });
  }
  next();
}

// Staff: sumar una visita
app.post('/api/visitas/:id', requireStaff, (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  db.prepare('UPDATE clientes SET visitas = visitas + 1 WHERE id = ?').run(cliente.id);
  db.prepare('INSERT INTO visitas_log (cliente_id) VALUES (?)').run(cliente.id);

  const actualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cliente.id);
  const ganoPremio = actualizado.visitas % VISITS_FOR_PRIZE === 0;
  res.json({ ...actualizado, ganoPremio, visitasParaPremio: VISITS_FOR_PRIZE });
});

// Staff: canjear premio (resetea el contador de ese ciclo)
app.post('/api/canjear/:id', requireStaff, (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  db.prepare('UPDATE clientes SET premios_canjeados = premios_canjeados + 1 WHERE id = ?').run(cliente.id);
  const actualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cliente.id);
  res.json(actualizado);
});

app.get('/cliente/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

app.listen(PORT, () => console.log(`Sale a Mesa fidelización corriendo en puerto ${PORT}`));
