const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Abilita CORS per le richieste dall'app
app.use(cors());
app.use(express.json());

// Directory per i file caricati
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {recursive: true});
}

// Configurazione multer per il salvataggio dei file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Crea sottocartella per ogni scansione basata su timestamp
    const scanName = req.body.scanName || `scan_${Date.now()}`;
    const scanDir = path.join(UPLOADS_DIR, scanName);
    if (!fs.existsSync(scanDir)) {
      fs.mkdirSync(scanDir, {recursive: true});
    }
    cb(null, scanDir);
  },
  filename: (req, file, cb) => {
    // Mantieni il nome originale del file
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

// ========== API ENDPOINTS ==========

// Upload dei file di scansione
app.post(
  '/api/upload',
  upload.fields([
    {name: 'usdzFile', maxCount: 1},
    {name: 'jsonFile', maxCount: 1},
  ]),
  (req, res) => {
    try {
      const scanName = req.body.scanName || `scan_${Date.now()}`;
      const files = req.files;
      const uploadedFiles = [];

      if (files.usdzFile && files.usdzFile[0]) {
        uploadedFiles.push({
          name: files.usdzFile[0].originalname,
          size: files.usdzFile[0].size,
          type: 'usdz',
          path: files.usdzFile[0].path,
        });
      }

      if (files.jsonFile && files.jsonFile[0]) {
        uploadedFiles.push({
          name: files.jsonFile[0].originalname,
          size: files.jsonFile[0].size,
          type: 'json',
          path: files.jsonFile[0].path,
        });
      }

      // Salva metadati
      const metadata = {
        scanName,
        timestamp: new Date().toISOString(),
        files: uploadedFiles.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type,
        })),
      };

      const metadataPath = path.join(UPLOADS_DIR, scanName, 'metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      console.log(`✅ Scansione "${scanName}" ricevuta con ${uploadedFiles.length} file`);

      res.json({
        success: true,
        message: 'File caricati con successo',
        scanName,
        files: uploadedFiles.map(f => ({name: f.name, size: f.size, type: f.type})),
      });
    } catch (error) {
      console.error('❌ Errore upload:', error);
      res.status(500).json({
        success: false,
        message: `Errore durante l'upload: ${error.message}`,
      });
    }
  },
);

// Lista tutte le scansioni
app.get('/api/scans', (req, res) => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      return res.json({scans: []});
    }

    const scanDirs = fs.readdirSync(UPLOADS_DIR).filter(name => {
      const dirPath = path.join(UPLOADS_DIR, name);
      return fs.statSync(dirPath).isDirectory();
    });

    const scans = scanDirs
      .map(dirName => {
        const dirPath = path.join(UPLOADS_DIR, dirName);
        const metadataPath = path.join(dirPath, 'metadata.json');

        let metadata = null;
        if (fs.existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          } catch (e) {
            // Ignora errori di parsing
          }
        }

        // Lista file nella directory
        const files = fs.readdirSync(dirPath).filter(f => f !== 'metadata.json');
        const fileDetails = files.map(f => {
          const filePath = path.join(dirPath, f);
          const stats = fs.statSync(filePath);
          return {
            name: f,
            size: stats.size,
            type: path.extname(f).replace('.', ''),
            createdAt: stats.birthtime.toISOString(),
          };
        });

        return {
          scanName: dirName,
          timestamp: metadata?.timestamp || fs.statSync(dirPath).birthtime.toISOString(),
          files: fileDetails,
        };
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({scans});
  } catch (error) {
    console.error('❌ Errore lista scansioni:', error);
    res.status(500).json({
      success: false,
      message: `Errore: ${error.message}`,
    });
  }
});

// Scarica un singolo file
app.get('/api/scans/:scanName/:fileName', (req, res) => {
  try {
    const {scanName, fileName} = req.params;
    const filePath = path.join(UPLOADS_DIR, scanName, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({success: false, message: 'File non trovato'});
    }

    res.download(filePath);
  } catch (error) {
    res.status(500).json({success: false, message: error.message});
  }
});

// Elimina una scansione
app.delete('/api/scans/:scanName', (req, res) => {
  try {
    const {scanName} = req.params;
    const dirPath = path.join(UPLOADS_DIR, scanName);

    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({success: false, message: 'Scansione non trovata'});
    }

    fs.rmSync(dirPath, {recursive: true, force: true});
    console.log(`🗑️ Scansione "${scanName}" eliminata`);

    res.json({success: true, message: 'Scansione eliminata'});
  } catch (error) {
    res.status(500).json({success: false, message: error.message});
  }
});

// ========== PAGINA WEB ==========
app.get('/', (req, res) => {
  res.send(getHtmlPage());
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getHtmlPage() {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoomPlan Scanner - Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #fafafa;
      min-height: 100vh;
    }
    .header {
      background: #18181b;
      border-bottom: 1px solid #27272a;
      padding: 24px 32px;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .header p {
      color: #a1a1aa;
      font-size: 14px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 20px;
    }
    .stat-card .label {
      color: #a1a1aa;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .stat-card .value {
      font-size: 32px;
      font-weight: 800;
      color: #3b82f6;
    }
    .table-container {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      overflow: hidden;
    }
    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #27272a;
    }
    .table-header h2 {
      font-size: 18px;
      font-weight: 700;
    }
    .refresh-btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: background 0.2s;
    }
    .refresh-btn:hover { background: #2563eb; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      padding: 12px 24px;
      color: #a1a1aa;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1px solid #27272a;
      background: rgba(0,0,0,0.2);
    }
    td {
      padding: 16px 24px;
      border-bottom: 1px solid rgba(39, 39, 42, 0.5);
      font-size: 14px;
    }
    tr:hover td { background: rgba(59, 130, 246, 0.05); }
    .scan-name {
      font-weight: 600;
      color: #fff;
    }
    .file-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      margin-right: 6px;
    }
    .badge-usdz {
      background: rgba(168, 85, 247, 0.15);
      color: #a855f7;
      border: 1px solid rgba(168, 85, 247, 0.3);
    }
    .badge-json {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .timestamp {
      color: #71717a;
      font-size: 13px;
    }
    .file-size {
      color: #a1a1aa;
      font-size: 13px;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .download-btn {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
      border: 1px solid rgba(59, 130, 246, 0.3);
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.2s;
    }
    .download-btn:hover {
      background: rgba(59, 130, 246, 0.2);
    }
    .delete-btn {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: background 0.2s;
    }
    .delete-btn:hover {
      background: rgba(239, 68, 68, 0.2);
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #71717a;
    }
    .empty-state .icon { font-size: 48px; margin-bottom: 16px; }
    .empty-state p { font-size: 16px; }
    .loading {
      text-align: center;
      padding: 40px;
      color: #a1a1aa;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📐 RoomPlan Scanner</h1>
    <p>Dashboard per la gestione delle scansioni delle stanze</p>
  </div>
  <div class="container">
    <div class="stats" id="stats">
      <div class="stat-card">
        <div class="label">Scansioni totali</div>
        <div class="value" id="totalScans">-</div>
      </div>
      <div class="stat-card">
        <div class="label">File totali</div>
        <div class="value" id="totalFiles">-</div>
      </div>
      <div class="stat-card">
        <div class="label">Dimensione totale</div>
        <div class="value" id="totalSize" style="font-size: 24px;">-</div>
      </div>
    </div>

    <div class="table-container">
      <div class="table-header">
        <h2>Scansioni Ricevute</h2>
        <button class="refresh-btn" onclick="loadScans()">↻ Aggiorna</button>
      </div>
      <div id="tableContent">
        <div class="loading">Caricamento...</div>
      </div>
    </div>
  </div>

  <script>
    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(isoString) {
      const d = new Date(isoString);
      return d.toLocaleDateString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }

    async function loadScans() {
      try {
        const res = await fetch('/api/scans');
        const data = await res.json();
        const scans = data.scans || [];

        // Aggiorna statistiche
        document.getElementById('totalScans').textContent = scans.length;
        const allFiles = scans.reduce((acc, s) => acc.concat(s.files), []);
        document.getElementById('totalFiles').textContent = allFiles.length;
        const totalBytes = allFiles.reduce((acc, f) => acc + f.size, 0);
        document.getElementById('totalSize').textContent = formatBytes(totalBytes);

        // Genera tabella
        if (scans.length === 0) {
          document.getElementById('tableContent').innerHTML = \`
            <div class="empty-state">
              <div class="icon">📭</div>
              <p>Nessuna scansione ricevuta</p>
              <p style="font-size: 13px; margin-top: 8px;">Avvia una scansione dall'app per iniziare</p>
            </div>
          \`;
          return;
        }

        let html = '<table><thead><tr>';
        html += '<th>Nome Scansione</th>';
        html += '<th>Data</th>';
        html += '<th>File</th>';
        html += '<th>Dimensione</th>';
        html += '<th>Azioni</th>';
        html += '</tr></thead><tbody>';

        for (const scan of scans) {
          const totalSize = scan.files.reduce((acc, f) => acc + f.size, 0);
          const fileBadges = scan.files.map(f => {
            const cls = f.type === 'json' ? 'badge-json' : 'badge-usdz';
            return '<span class="file-badge ' + cls + '">' + f.type + '</span>';
          }).join('');

          const downloadBtns = scan.files.map(f => 
            '<a class="download-btn" href="/api/scans/' + scan.scanName + '/' + f.name + '" download>⬇ ' + f.name + '</a>'
          ).join('');

          html += '<tr>';
          html += '<td class="scan-name">' + scan.scanName + '</td>';
          html += '<td class="timestamp">' + formatDate(scan.timestamp) + '</td>';
          html += '<td>' + fileBadges + '</td>';
          html += '<td class="file-size">' + formatBytes(totalSize) + '</td>';
          html += '<td class="actions">' + downloadBtns + 
            '<button class="delete-btn" onclick="deleteScan(\\'' + scan.scanName + '\\')">🗑️</button></td>';
          html += '</tr>';
        }

        html += '</tbody></table>';
        document.getElementById('tableContent').innerHTML = html;
      } catch (error) {
        document.getElementById('tableContent').innerHTML = 
          '<div class="empty-state"><div class="icon">❌</div><p>Errore nel caricamento: ' + error.message + '</p></div>';
      }
    }

    async function deleteScan(scanName) {
      if (!confirm('Sei sicuro di voler eliminare la scansione "' + scanName + '"?')) return;
      try {
        await fetch('/api/scans/' + scanName, { method: 'DELETE' });
        loadScans();
      } catch (error) {
        alert('Errore: ' + error.message);
      }
    }

    // Carica le scansioni al caricamento della pagina
    loadScans();
    // Auto-refresh ogni 10 secondi
    setInterval(loadScans, 10000);
  </script>
</body>
</html>`;
}

// ========== AVVIO SERVER ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     📐 RoomPlan Scanner Server                  ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  🌐 Dashboard: http://localhost:${PORT}              ║`);
  console.log(`║  📡 API:       http://localhost:${PORT}/api           ║`);
  console.log('║                                                  ║');
  console.log('║  Endpoints:                                      ║');
  console.log('║    POST /api/upload    - Upload scansione        ║');
  console.log('║    GET  /api/scans     - Lista scansioni         ║');
  console.log('║    GET  /api/scans/:n/:f - Download file         ║');
  console.log('║    DELETE /api/scans/:n  - Elimina scansione     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});
