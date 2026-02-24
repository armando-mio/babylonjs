const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const { NodeIO } = require('@gltf-transform/core');
// DRACO rimosso — non compatibile con BabylonJS React Native su iOS

// Trasforma exec in una Promise per usare async/await
const execPromise = util.promisify(exec);

const app = express();

// ================= CONSTANTS =================
const PORT = 3001;
const UPLOADS_FOLDER_NAME = 'uploads';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

app.use(cors());
app.use(express.json());

// Directory per i file caricati (Dinamica tramite .env)
const UPLOADS_DIR = path.join(__dirname, UPLOADS_FOLDER_NAME);
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {recursive: true});
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

// Multer separato per import modelli — salva in cartella temporanea
// per evitare problemi di ordinamento dei campi multipart
// (il file arriva prima dei campi testo, quindi req.body.scanName non è disponibile)
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

// ========== PIPELINE USDZ -> GLB CON DEBUGGING AVANZATO ==========
async function convertAndIntegrate(usdzPath, jsonPath, outputGlbPath, scanDir) {
  let logContent = "=========================================\n";
  logContent += "   DEBUG LOG - CONVERSIONE ROOMPLAN      \n";
  logContent += "=========================================\n\n";

  try {
    console.log(`\n🔄 [CONVERSIONE] Avvio pipeline con debug per: ${path.basename(usdzPath)}`);
    
    // 1. ESTRAZIONE IN TESTO CHIARO (USDA) PER DEBUGGING
    const usdaPath = path.join(scanDir, 'debug_scene.usda');
    logContent += `[STEP 1] Analisi struttura USDZ (usdcat)\n`;
    logContent += `Esecuzione: usdcat "${usdzPath}" -o "${usdaPath}"\n`;
    try {
      // usdcat converte il binario USDZ in un file di testo leggibile (USDA)
      await execPromise(`usdcat "${usdzPath}" -o "${usdaPath}"`);
      logContent += `SUCCESS: File USDA di debug generato con successo.\n\n`;
      console.log('✅ [1/4] File di testo USD (USDA) generato per il debug.');
    } catch (err) {
      logContent += `WARNING: usdcat ha fallito. Errore: ${err.message}\n\n`;
      console.log('⚠️ [1/4] Impossibile generare USDA, procedo comunque.');
    }

    // 2. CONVERSIONE USDZ -> GLB (usando il flag -f per il Flatten)
    const tempGlbPath = outputGlbPath.replace('.glb', '_temp.glb');
    logContent += `[STEP 2] Conversione geometria in GLB (usd2gltf)\n`;
    logContent += `Esecuzione: usd2gltf -i "${usdzPath}" -o "${tempGlbPath}" -f\n`;
    try {
      console.log('📦 [2/4] Avvio motore usd2gltf...');
      const { stdout, stderr } = await execPromise(`usd2gltf -i "${usdzPath}" -o "${tempGlbPath}" -f`);
      
      // Scriviamo TUTTO l'output del programma nel file di log per capire perché appiattisce
      logContent += `--- STDOUT (Output normale) ---\n${stdout || 'Nessun output standard.'}\n`;
      logContent += `--- STDERR (Avvisi/Errori) ---\n${stderr || 'Nessun avviso.'}\n`;
      logContent += `SUCCESS: Conversione base completata.\n\n`;
      console.log('✅ [2/4] Conversione 3D completata.');
    } catch (err) {
      logContent += `FATAL ERROR in usd2gltf:\n${err.message}\n\n`;
      throw new Error("Il tool usd2gltf ha restituito un errore critico.");
    }

    // 3. INIEZIONE JSON METADATA (senza DRACO — la compressione DRACO
    //    non è compatibile con BabylonJS React Native su iOS)
    logContent += `[STEP 3] Iniezione Metadati JSON\n`;
    if (jsonPath && fs.existsSync(jsonPath)) {
      console.log('⚙️ [3/4] Iniezione dei metadati JSON nel GLB...');
      const io = new NodeIO();
      const document = await io.read(tempGlbPath);
      const metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      
      document.getRoot().setExtras(metadata);

      await io.write(outputGlbPath, document);
      fs.unlinkSync(tempGlbPath);
      
      logContent += `SUCCESS: JSON iniettato nel GLB.\n\n`;
      console.log('✅ [3/4] Metadati inseriti.');
    } else {
      // Nessun JSON — rinomina direttamente il file temp
      fs.renameSync(tempGlbPath, outputGlbPath);
      
      logContent += `INFO: Nessun JSON trovato, GLB salvato senza metadati.\n\n`;
      console.log('⏩ [3/4] GLB salvato senza metadati.');
    }

    logContent += `[STEP 4] Salvataggio completato.\nFile finale: ${outputGlbPath}\n`;
    console.log(`🎉 [4/4] File GLB pronto in: ${outputGlbPath}\n`);

  } catch (error) {
    console.error('❌ [ERRORE CRITICO DI CONVERSIONE]:', error);
    logContent += `\n!!! PROCEDURA INTERROTTA DA UN ERRORE GLOBALE !!!\n`;
    logContent += `${error.message}\n${error.stack}\n`;
  } finally {
    // Scrive il log su disco
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

      console.log(`📥 Scansione "${scanName}" ricevuta. Avvio pipeline debug...`);

      if (usdzPath) {
        const glbFileName = files.usdzFile[0].originalname.replace('.usdz', '.glb');
        const glbPath = path.join(scanDir, glbFileName);
        // Lanciamo in background passando anche la directory
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
    if (!fs.existsSync(UPLOADS_DIR)) return res.json({scans: []});

    const filterDeviceId = req.query.deviceId || null;
    const scanDirs = fs.readdirSync(UPLOADS_DIR).filter(name =>
      name !== '_tmp' && fs.statSync(path.join(UPLOADS_DIR, name)).isDirectory()
    );

    const scans = scanDirs
      .map(dirName => {
        const dirPath = path.join(UPLOADS_DIR, dirName);
        let metadata = null;
        if (fs.existsSync(path.join(dirPath, 'metadata.json'))) {
          try { metadata = JSON.parse(fs.readFileSync(path.join(dirPath, 'metadata.json'), 'utf-8')); } catch (e) {}
        }

        const files = fs.readdirSync(dirPath).filter(f => f !== 'metadata.json');
        const fileDetails = files.map(f => {
          const filePath = path.join(dirPath, f);
          const stats = fs.statSync(filePath);
          // Riconoscimento estensioni per i badge
          let type = path.extname(f).replace('.', '');
          if(f === 'debug.log') type = 'log';
          
          return { name: f, size: stats.size, type: type, createdAt: stats.birthtime.toISOString() };
        });

        return {
          scanName: dirName,
          timestamp: metadata?.timestamp || fs.statSync(dirPath).birthtime.toISOString(),
          displayName: metadata?.displayName || null,
          description: metadata?.description || null,
          source: metadata?.source || null,
          deviceId: metadata?.deviceId || null,
          files: fileDetails,
        };
      })
      .filter(scan => {
        // Se viene passato un deviceId, mostra solo i modelli di quel device (o quelli senza deviceId per retrocompatibilità)
        if (!filterDeviceId) return true;
        return !scan.deviceId || scan.deviceId === filterDeviceId;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({scans});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/scans/:scanName/:fileName', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.scanName, req.params.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({success: false, message: 'File non trovato'});
  res.download(filePath);
});

app.delete('/api/scans/:scanName', (req, res) => {
  const dirPath = path.join(UPLOADS_DIR, req.params.scanName);
  if (!fs.existsSync(dirPath)) return res.status(404).json({success: false, message: 'Scansione non trovata'});
  fs.rmSync(dirPath, {recursive: true, force: true});
  res.json({success: true, message: 'Scansione eliminata'});
});

// ========== AGGIORNA NOME/DESCRIZIONE MODELLO ==========
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

// ========== UPLOAD MODELLO IMPORTATO (GLB/GLTF/USDZ) ==========
// Usa modelUpload (multer separato con temp dir) per evitare che multer crei
// cartelle scan_XXXX spurie prima che i campi testo siano disponibili.
app.post('/api/upload-model', modelUpload.single('modelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({success: false, message: 'Nessun file ricevuto'});
    }
    const modelName = req.body.modelName || `model_${Date.now()}`;
    const scanDir = path.join(UPLOADS_DIR, modelName);
    if (!fs.existsSync(scanDir)) {
      fs.mkdirSync(scanDir, {recursive: true});
    }

    const fileName = req.file.originalname;
    const fileNameLower = fileName.toLowerCase();
    const isUsdz = fileNameLower.endsWith('.usdz');
    const isGlb = fileNameLower.endsWith('.glb');

    // Sposta il file dalla cartella temp alla cartella definitiva del modello
    const tempPath = req.file.path;
    const finalPath = path.join(scanDir, fileName);
    fs.renameSync(tempPath, finalPath);

    console.log(`📥 Modello "${modelName}" caricato: ${fileName} (${(req.file.size / 1024).toFixed(1)} KB)`);

    if (isUsdz) {
      // ===== PIPELINE USDZ → GLB =====
      const glbFileName = fileName.replace(/\.usdz$/i, '.glb');
      const glbPath = path.join(scanDir, glbFileName);

      const metadata = {
        scanName: modelName,
        timestamp: new Date().toISOString(),
        files: [
          {name: fileName, size: req.file.size, type: 'usdz'},
        ],
        source: 'imported',
        deviceId: req.body.deviceId || null,
      };

      // Conversione USDZ → GLB con usd2gltf
      try {
        console.log(`🔄 Pipeline USDZ→GLB per: ${fileName}`);
        await execPromise(`usd2gltf -i "${finalPath}" -o "${glbPath}" -f`);
        if (fs.existsSync(glbPath)) {
          const glbStats = fs.statSync(glbPath);
          metadata.files.push({name: glbFileName, size: glbStats.size, type: 'glb'});
          console.log(`✅ Pipeline: GLB generato automaticamente → ${glbFileName}`);
        }
      } catch (convErr) {
        console.log(`⚠️ Conversione USDZ→GLB fallita per ${fileName}: ${convErr.message}`);
      }

      fs.writeFileSync(path.join(scanDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

      // Restituiamo l'URL del GLB (per BabylonJS) se disponibile, altrimenti errore
      const glbExists = fs.existsSync(glbPath);
      res.json({
        success: true,
        glbReady: glbExists,
        message: 'Modello USDZ caricato' + (glbExists ? ' e convertito in GLB' : ' (conversione GLB fallita)'),
        modelName,
        fileName: glbExists ? glbFileName : fileName,
        url: glbExists ? `/api/scans/${modelName}/${glbFileName}` : null,
      });
    } else {
      // ===== PIPELINE GLB/GLTF → USDZ =====
      const metadata = {
        scanName: modelName,
        timestamp: new Date().toISOString(),
        files: [{name: fileName, size: req.file.size, type: isGlb ? 'glb' : 'gltf'}],
        source: 'imported',
        deviceId: req.body.deviceId || null,
      };
      fs.writeFileSync(path.join(scanDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

      res.json({
        success: true,
        glbReady: true,
        message: 'Modello caricato con successo',
        modelName,
        fileName,
        url: `/api/scans/${modelName}/${fileName}`,
      });
    }
  } catch (error) {
    console.error('❌ Errore upload modello:', error);
    res.status(500).json({success: false, message: error.message});
  }
});

// ========== FRONTEND (DASHBOARD E VIEWER) ==========

// ========== CONVERSIONE GLB → USDZ ==========
app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'viewer.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ========== AVVIO DEL SERVER ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log('🚀 RoomPlan Scanner Server Avviato                    ');
  console.log('======================================================');
  console.log(`🌐 Dashboard: http://localhost:${PORT}                 `);
  console.log('======================================================\n');
});