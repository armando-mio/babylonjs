const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

// ==================== CONFIG ====================
const PORT = process.env.PORT || 3001;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(__dirname, 'roomplan.db');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ==================== DATABASE ====================
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    usdz_filename TEXT,
    usdz_original_name TEXT,
    usdz_size INTEGER DEFAULT 0,
    json_filename TEXT,
    json_original_name TEXT,
    json_size INTEGER DEFAULT 0,
    device_info TEXT,
    notes TEXT
  )
`);

console.log('✅ Database inizializzato:', DB_PATH);

// ==================== MULTER STORAGE ====================
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.usdz', '.json', '.usda', '.usdc', '.obj', '.gltf', '.glb'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo file non supportato: ${ext}`));
    }
  },
});

// ==================== EXPRESS APP ====================
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (web viewer)
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files with proper MIME types
app.use('/uploads', (req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  const mimeTypes = {
    '.usdz': 'model/vnd.usdz+zip',
    '.usda': 'model/vnd.usda',
    '.usdc': 'model/vnd.usdc',
    '.json': 'application/json',
    '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary',
    '.obj': 'text/plain',
  };
  if (mimeTypes[ext]) {
    res.setHeader('Content-Type', mimeTypes[ext]);
  }
  next();
}, express.static(UPLOADS_DIR));

// ==================== API ROUTES ====================

/**
 * POST /api/upload
 * Upload a scanned room model (USDZ + optional JSON)
 * Fields: usdz (file), json (file), name (text), deviceInfo (text), notes (text)
 */
app.post('/api/upload',
  upload.fields([
    { name: 'usdz', maxCount: 1 },
    { name: 'json', maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const files = req.files;
      const usdzFile = files?.usdz?.[0];
      const jsonFile = files?.json?.[0];

      if (!usdzFile && !jsonFile) {
        return res.status(400).json({ error: 'Nessun file ricevuto. Invia almeno un file USDZ o JSON.' });
      }

      const scanId = uuidv4();
      const name = req.body.name || `Scansione ${new Date().toLocaleString('it-IT')}`;
      const deviceInfo = req.body.deviceInfo || null;
      const notes = req.body.notes || null;

      const stmt = db.prepare(`
        INSERT INTO scans (id, name, usdz_filename, usdz_original_name, usdz_size, json_filename, json_original_name, json_size, device_info, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        scanId,
        name,
        usdzFile?.filename || null,
        usdzFile?.originalname || null,
        usdzFile?.size || 0,
        jsonFile?.filename || null,
        jsonFile?.originalname || null,
        jsonFile?.size || 0,
        deviceInfo,
        notes,
      );

      console.log(`📦 Nuova scansione: "${name}" (ID: ${scanId})`);
      if (usdzFile) console.log(`   USDZ: ${usdzFile.filename} (${(usdzFile.size / 1024 / 1024).toFixed(2)} MB)`);
      if (jsonFile) console.log(`   JSON: ${jsonFile.filename} (${(jsonFile.size / 1024).toFixed(1)} KB)`);

      res.json({
        success: true,
        scan: {
          id: scanId,
          name,
          usdzUrl: usdzFile ? `/uploads/${usdzFile.filename}` : null,
          jsonUrl: jsonFile ? `/uploads/${jsonFile.filename}` : null,
        },
      });
    } catch (error) {
      console.error('❌ Errore upload:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/scans
 * List all scans
 */
app.get('/api/scans', (_req, res) => {
  try {
    const scans = db.prepare('SELECT * FROM scans ORDER BY created_at DESC').all();
    res.json({ scans });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/scans/:id
 * Get a single scan
 */
app.get('/api/scans/:id', (req, res) => {
  try {
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id);
    if (!scan) return res.status(404).json({ error: 'Scansione non trovata' });
    res.json({ scan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/scans/:id
 * Delete a scan and its files
 */
app.delete('/api/scans/:id', (req, res) => {
  try {
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id);
    if (!scan) return res.status(404).json({ error: 'Scansione non trovata' });

    // Delete files
    if (scan.usdz_filename) {
      const usdzPath = path.join(UPLOADS_DIR, scan.usdz_filename);
      if (fs.existsSync(usdzPath)) fs.unlinkSync(usdzPath);
    }
    if (scan.json_filename) {
      const jsonPath = path.join(UPLOADS_DIR, scan.json_filename);
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    }

    db.prepare('DELETE FROM scans WHERE id = ?').run(req.params.id);
    console.log(`🗑️  Scansione eliminata: ${scan.name} (${req.params.id})`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/scans/:id/download/usdz
 * Download USDZ file
 */
app.get('/api/scans/:id/download/usdz', (req, res) => {
  try {
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id);
    if (!scan || !scan.usdz_filename) return res.status(404).json({ error: 'File USDZ non trovato' });

    const filePath = path.join(UPLOADS_DIR, scan.usdz_filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File non presente su disco' });

    res.download(filePath, scan.usdz_original_name || `${scan.name}.usdz`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/scans/:id/download/json
 * Download JSON file
 */
app.get('/api/scans/:id/download/json', (req, res) => {
  try {
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id);
    if (!scan || !scan.json_filename) return res.status(404).json({ error: 'File JSON non trovato' });

    const filePath = path.join(UPLOADS_DIR, scan.json_filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File non presente su disco' });

    res.download(filePath, scan.json_original_name || `${scan.name}.json`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check
 */
app.get('/api/health', (_req, res) => {
  const count = db.prepare('SELECT COUNT(*) as total FROM scans').get();
  res.json({ status: 'ok', totalScans: count.total, uptime: process.uptime() });
});

// ==================== ERROR HANDLING ====================
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Errore upload: ${err.message}` });
  }
  console.error('❌ Server error:', err);
  res.status(500).json({ error: err.message });
});

// ==================== START ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║        🏠 RoomPlan Server — Avviato!            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  📡 http://localhost:${PORT}                       ║`);
  console.log(`║  📂 Upload dir: ${UPLOADS_DIR}`);
  console.log(`║  🗄️  Database: ${DB_PATH}`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});
