const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const { NodeIO } = require('@gltf-transform/core');

// Trasforma exec in una Promise per usare async/await
const execPromise = util.promisify(exec);

const app = express();

// ================= CONSTANTS =================
const PORT = 3001;
const UPLOADS_FOLDER_NAME = 'uploads';
const HARDCODED_FOLDER_NAME = 'hardcoded_models';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

app.use(cors());
app.use(express.json());

// Directory per i file caricati
const UPLOADS_DIR = path.join(__dirname, UPLOADS_FOLDER_NAME);
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {recursive: true});
}

// Directory per i modelli hardcoded globali
const HARDCODED_DIR = path.join(__dirname, HARDCODED_FOLDER_NAME);
if (!fs.existsSync(HARDCODED_DIR)) {
  fs.mkdirSync(HARDCODED_DIR, {recursive: true});
}

// Configurazione multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const scanName = req.body.scanName || `scan_${Date.now()}`;
    const scanDir = path.join(UPLOADS_DIR, scanName);
    if (!fs.existsSync(scanDir)) {
      fs.mkdirSync(scanDir, {recursive: true});
    }
    cb(null, scanDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Multer separato per import modelli
const modelImportStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = path.join(UPLOADS_DIR, '_tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});
const modelUpload = multer({ storage: modelImportStorage, limits: { fileSize: MAX_FILE_SIZE } });

// ========== PIPELINE USDZ -> GLB ==========
async function convertAndIntegrate(usdzPath, jsonPath, outputGlbPath, scanDir) {
  let logContent = "=========================================\n";
  logContent += "   DEBUG LOG - CONVERSIONE ROOMPLAN      \n";
  logContent += "=========================================\n\n";

  try {
    console.log(`\n[START] Avvio pipeline per: ${path.basename(usdzPath)}`);
    
    // 1. ESTRAZIONE IN TESTO CHIARO (USDA)
    const usdaPath = path.join(scanDir, 'debug_scene.usda');
    logContent += `[STEP 1] Analisi struttura USDZ\n`;
    try {
      await execPromise(`usdcat "${usdzPath}" -o "${usdaPath}"`);
      logContent += `SUCCESS: File USDA generato.\n\n`;
      console.log('[OK] [1/4] File di testo USD (USDA) generato.');
    } catch (err) {
      logContent += `WARNING: usdcat ha fallito. Errore: ${err.message}\n\n`;
      console.log('[WARN] [1/4] Impossibile generare USDA.');
    }

    // 2. CONVERSIONE USDZ -> GLB
    const tempGlbPath = outputGlbPath.replace('.glb', '_temp.glb');
    logContent += `[STEP 2] Conversione in GLB\n`;
    try {
      console.log('[EXEC] [2/4] Avvio motore usd2gltf...');
      const { stdout, stderr } = await execPromise(`usd2gltf -i "${usdzPath}" -o "${tempGlbPath}" -f`);
      logContent += `STDOUT:\n${stdout}\nSTDERR:\n${stderr}\n`;
      console.log('[OK] [2/4] Conversione 3D completata.');
    } catch (err) {
      logContent += `FATAL ERROR:\n${err.message}\n\n`;
      throw new Error("Errore critico in usd2gltf.");
    }

    // 3. INIEZIONE JSON METADATA
    logContent += `[STEP 3] Iniezione Metadati\n`;
    if (jsonPath && fs.existsSync(jsonPath)) {
      console.log('[EXEC] [3/4] Iniezione metadati JSON...');
      const io = new NodeIO();
      const document = await io.read(tempGlbPath);
      const metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      document.getRoot().setExtras(metadata);
      await io.write(outputGlbPath, document);
      fs.unlinkSync(tempGlbPath);
      console.log('[OK] [3/4] Metadati inseriti.');
    } else {
      fs.renameSync(tempGlbPath, outputGlbPath);
      console.log('[SKIP] [3/4] GLB salvato senza metadati.');
    }

    console.log(`[DONE] [4/4] File GLB pronto: ${outputGlbPath}\n`);

  } catch (error) {
    console.error('[ERROR] Errore critico:', error);
    logContent += `\n!!! ERRORE GLOBALE !!!\n${error.message}\n`;
  } finally {
    fs.writeFileSync(path.join(scanDir, 'debug.log'), logContent);
  }
}

// ========== API ENDPOINTS ==========

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

      let usdzPath = null;
      let jsonPath = null;

      if (files.usdzFile && files.usdzFile[0]) {
        usdzPath = files.usdzFile[0].path;
        uploadedFiles.push({ name: files.usdzFile[0].originalname, size: files.usdzFile[0].size, type: 'usdz' });
      }

      if (files.jsonFile && files.jsonFile[0]) {
        jsonPath = files.jsonFile[0].path;
        uploadedFiles.push({ name: files.jsonFile[0].originalname, size: files.jsonFile[0].size, type: 'json' });
      }

      const metadata = { scanName, timestamp: new Date().toISOString(), files: uploadedFiles, deviceId: req.body.deviceId || null };
      const scanDir = path.join(UPLOADS_DIR, scanName);
      fs.writeFileSync(path.join(scanDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

      console.log(`[IN] Scansione "${scanName}" ricevuta.`);

      if (usdzPath) {
        const glbFileName = files.usdzFile[0].originalname.replace('.usdz', '.glb');
        const glbPath = path.join(scanDir, glbFileName);
        convertAndIntegrate(usdzPath, jsonPath, glbPath, scanDir);
      }

      res.json({ success: true, message: 'Upload avviato.', scanName });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

app.get('/api/scans', (req, res) => {
  try {
    const scans = [];

    // 1. Modelli caricati/scansionati dagli utenti
    if (fs.existsSync(UPLOADS_DIR)) {
      const scanDirs = fs.readdirSync(UPLOADS_DIR).filter(name =>
        name !== '_tmp' && fs.statSync(path.join(UPLOADS_DIR, name)).isDirectory()
      );

      scanDirs.forEach(dirName => {
        const dirPath = path.join(UPLOADS_DIR, dirName);
        let metadata = null;
        if (fs.existsSync(path.join(dirPath, 'metadata.json'))) {
          try { metadata = JSON.parse(fs.readFileSync(path.join(dirPath, 'metadata.json'), 'utf-8')); } catch (e) {}
        }

        const files = fs.readdirSync(dirPath).filter(f => f !== 'metadata.json');
        const fileDetails = files.map(f => {
          const stats = fs.statSync(path.join(dirPath, f));
          let type = path.extname(f).replace('.', '');
          if(f === 'debug.log') type = 'log';
          return { name: f, size: stats.size, type: type, createdAt: stats.birthtime.toISOString() };
        });

        scans.push({
          scanName: dirName,
          timestamp: metadata?.timestamp || fs.statSync(dirPath).birthtime.toISOString(),
          displayName: metadata?.displayName || null,
          description: metadata?.description || null,
          source: metadata?.source || 'scan',
          deviceId: metadata?.deviceId || 'SCONOSCIUTO',
          files: fileDetails,
          isHardcoded: false
        });
      });
    }

    // 2. Modelli globali (Hardcoded)
    if (fs.existsSync(HARDCODED_DIR)) {
      const hardcodedFiles = fs.readdirSync(HARDCODED_DIR).filter(f => f.toLowerCase().endsWith('.glb'));
      hardcodedFiles.forEach(fileName => {
        const filePath = path.join(HARDCODED_DIR, fileName);
        const stats = fs.statSync(filePath);
        scans.push({
          scanName: fileName, // il nome del file fa da ID
          timestamp: stats.birthtime.toISOString(),
          displayName: fileName,
          source: 'hardcoded',
          deviceId: 'HARDCODED',
          files: [{ name: fileName, size: stats.size, type: 'glb', createdAt: stats.birthtime.toISOString() }],
          isHardcoded: true
        });
      });
    }

    // Ordina tutti globalmente per data
    const sortedScans = scans.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({scans: sortedScans});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Download Modelli Utente
app.get('/api/scans/:scanName/:fileName', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.scanName, req.params.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({success: false, message: 'File non trovato'});
  res.download(filePath);
});

// Eliminazione Modelli Utente
app.delete('/api/scans/:scanName', (req, res) => {
  const dirPath = path.join(UPLOADS_DIR, req.params.scanName);
  if (!fs.existsSync(dirPath)) return res.status(404).json({success: false, message: 'Scansione non trovata'});
  fs.rmSync(dirPath, {recursive: true, force: true});
  res.json({success: true, message: 'Scansione eliminata'});
});

// Aggiornamento Metadati
app.patch('/api/scans/:scanName', (req, res) => {
  const dirPath = path.join(UPLOADS_DIR, req.params.scanName);
  if (!fs.existsSync(dirPath)) return res.status(404).json({success: false, message: 'Scansione non trovata'});

  const metaPath = path.join(dirPath, 'metadata.json');
  let metadata = {};
  if (fs.existsSync(metaPath)) {
    try { metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch (e) {}
  }

  if (req.body.displayName !== undefined) metadata.displayName = req.body.displayName;
  if (req.body.description !== undefined) metadata.description = req.body.description;

  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  res.json({success: true, message: 'Aggiornato'});
});

// Download Modelli Hardcoded
app.get('/api/hardcoded/:fileName', (req, res) => {
  const filePath = path.join(HARDCODED_DIR, req.params.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({success: false, message: 'File non trovato'});
  res.download(filePath);
});


// ========== UPLOAD MODELLO IMPORTATO ==========
app.post('/api/upload-model', modelUpload.single('modelFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({success: false, message: 'Nessun file ricevuto'});
    
    const modelName = req.body.modelName || `model_${Date.now()}`;
    const scanDir = path.join(UPLOADS_DIR, modelName);
    if (!fs.existsSync(scanDir)) fs.mkdirSync(scanDir, {recursive: true});

    const fileName = req.file.originalname;
    const isUsdz = fileName.toLowerCase().endsWith('.usdz');
    const isGlb = fileName.toLowerCase().endsWith('.glb');

    const tempPath = req.file.path;
    const finalPath = path.join(scanDir, fileName);
    fs.renameSync(tempPath, finalPath);

    console.log(`[IN] Modello importato "${modelName}": ${fileName}`);

    if (isUsdz) {
      const glbFileName = fileName.replace(/\.usdz$/i, '.glb');
      const glbPath = path.join(scanDir, glbFileName);

      const metadata = {
        scanName: modelName,
        timestamp: new Date().toISOString(),
        files: [{name: fileName, size: req.file.size, type: 'usdz'}],
        source: 'imported',
        deviceId: req.body.deviceId || null,
      };

      try {
        console.log(`[EXEC] Conversione importato USDZ -> GLB`);
        await execPromise(`usd2gltf -i "${finalPath}" -o "${glbPath}" -f`);
        if (fs.existsSync(glbPath)) {
          metadata.files.push({name: glbFileName, size: fs.statSync(glbPath).size, type: 'glb'});
        }
      } catch (convErr) {
        console.log(`[WARN] Conversione fallita: ${convErr.message}`);
      }

      fs.writeFileSync(path.join(scanDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

      res.json({
        success: true,
        glbReady: fs.existsSync(glbPath),
        modelName,
        url: fs.existsSync(glbPath) ? `/api/scans/${modelName}/${glbFileName}` : null,
      });
    } else {
      const metadata = {
        scanName: modelName,
        timestamp: new Date().toISOString(),
        files: [{name: fileName, size: req.file.size, type: isGlb ? 'glb' : 'gltf'}],
        source: 'imported',
        deviceId: req.body.deviceId || null,
      };
      fs.writeFileSync(path.join(scanDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

      res.json({ success: true, glbReady: true, modelName, url: `/api/scans/${modelName}/${fileName}` });
    }
  } catch (error) {
    console.error('[ERROR]', error);
    res.status(500).json({success: false, message: error.message});
  }
});

// ========== FRONTEND (DASHBOARD E VIEWER) ==========
app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'viewer.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ========== AVVIO SERVER ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log('[INFO] RoomPlan Scanner Server Avviato                ');
  console.log('======================================================');
  console.log(`[LINK] Dashboard: http://localhost:${PORT}             `);
  console.log('======================================================\n');
});