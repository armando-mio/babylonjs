import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import {RoomPlanView, ExportType, useRoomPlanView} from 'expo-roomplan';
import {ROOM_SCAN_SERVER_URL} from '../constants';
import {log} from '../logger';

interface RoomScanScreenProps {
  onGoBack: () => void;
}

/**
 * Normalizza il path del file per l'uso su iOS.
 * expo-roomplan salva i file in una directory dell'app (non tmp),
 * quindi i file dovrebbero persistere tra sessioni.
 * Assicuriamo solo che il path sia un URI valido.
 */
function normalizeFileUri(url: string): string {
  if (!url) return url;
  // Rimuovi il prefisso file:// se presente per avere il path puro
  const cleanPath = url.replace(/^file:\/\//, '');
  // Ritorna con il prefisso file:// per l'uso nelle API React Native
  return `file://${cleanPath}`;
}

/**
 * Estrai il path puro (senza file://) per i log.
 */
function cleanPath(url: string): string {
  return url.replace(/^file:\/\//, '');
}

/**
 * Invia i file scansionati al server.
 * Usa FormData con file URI che React Native gestisce nativamente.
 */
async function uploadToServer(
  scanPath: string | null,
  jsonPath: string | null,
  scanName: string,
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append('scanName', scanName);

    if (scanPath) {
      const uri = normalizeFileUri(scanPath);
      formData.append('usdzFile', {
        uri,
        type: 'application/octet-stream',
        name: `${scanName}.usdz`,
      } as any);
      log('INFO', `Upload USDZ da: ${uri}`);
    }

    if (jsonPath) {
      const uri = normalizeFileUri(jsonPath);
      formData.append('jsonFile', {
        uri,
        type: 'application/json',
        name: `${scanName}.json`,
      } as any);
      log('INFO', `Upload JSON da: ${uri}`);
    }

    const response = await fetch(`${ROOM_SCAN_SERVER_URL}/api/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    log('INFO', `Upload completato: ${JSON.stringify(result)}`);
    return true;
  } catch (error: any) {
    log('ERROR', `Upload fallito: ${error.message}`);
    throw error;
  }
}

export const RoomScanScreen: React.FC<RoomScanScreenProps> = ({onGoBack}) => {
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // File paths ricevuti dall'export
  const scanUrlRef = useRef<string | null>(null);
  const jsonUrlRef = useRef<string | null>(null);
  const scanNameRef = useRef<string>(`RoomScan_${Date.now()}`);

  // File paths salvati in posizione sicura
  const savedScanPathRef = useRef<string | null>(null);
  const savedJsonPathRef = useRef<string | null>(null);

  const {viewProps, controls, state} = useRoomPlanView({
    scanName: scanNameRef.current,
    exportType: ExportType.Mesh,
    exportOnFinish: true,
    sendFileLoc: true,
    autoCloseOnTerminalStatus: false,
    onStatus: e => {
      log('INFO', `RoomPlan status: ${JSON.stringify(e.nativeEvent)}`);
    },
    onPreview: () => {
      log('INFO', 'RoomPlan: preview mostrata');
    },
    onExported: async e => {
      log('INFO', `RoomPlan exported: ${JSON.stringify(e.nativeEvent)}`);
      const {scanUrl, jsonUrl} = e.nativeEvent;

      // Salva i path dei file esportati
      // expo-roomplan con sendFileLoc:true restituisce i path dei file
      // che sono nella directory dell'app (Documents), non in tmp
      if (scanUrl) {
        savedScanPathRef.current = scanUrl;
        scanUrlRef.current = scanUrl;
        log('INFO', `USDZ salvato in: ${cleanPath(scanUrl)}`);
      }

      if (jsonUrl) {
        savedJsonPathRef.current = jsonUrl;
        jsonUrlRef.current = jsonUrl;
        log('INFO', `JSON salvato in: ${cleanPath(jsonUrl)}`);
      }

      setScanComplete(true);
      setScanning(false);
      log('INFO', 'Scansione completata ed esportata con successo');
    },
  });

  // Quando lo stato cambia a terminal (OK, Error, Canceled) e non scanning
  useEffect(() => {
    if (state.status === 'Canceled' && scanning) {
      setScanning(false);
    }
  }, [state.status, scanning]);

  const startScan = useCallback(() => {
    // Reset
    scanNameRef.current = `RoomScan_${Date.now()}`;
    scanUrlRef.current = null;
    jsonUrlRef.current = null;
    savedScanPathRef.current = null;
    savedJsonPathRef.current = null;
    setScanComplete(false);
    setScanning(true);
    controls.start();
  }, [controls]);

  const cancelScan = useCallback(() => {
    controls.cancel();
    setScanning(false);
    setScanComplete(false);
  }, [controls]);

  const finishScan = useCallback(() => {
    controls.finishScan();
    // L'export avverrà automaticamente grazie a exportOnFinish: true
  }, [controls]);

  const handleSave = useCallback(async () => {
    if (!savedScanPathRef.current && !savedJsonPathRef.current) {
      Alert.alert('Errore', 'Nessun file da salvare');
      return;
    }

    setSaving(true);
    try {
      const savedFiles: string[] = [];

      if (savedScanPathRef.current) {
        savedFiles.push(`${scanNameRef.current}.usdz`);
      }

      if (savedJsonPathRef.current) {
        savedFiles.push(`${scanNameRef.current}.json`);
      }

      if (savedFiles.length > 0) {
        Alert.alert(
          'File Salvati',
          `I file sono già salvati nella directory dell'app:\n\n${savedFiles.join('\n')}`,
          [{text: 'OK'}],
        );
      } else {
        Alert.alert('Errore', 'Nessun file trovato');
      }
    } catch (error: any) {
      Alert.alert('Errore', `Impossibile verificare i file: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleUploadToServer = useCallback(async () => {
    if (!savedScanPathRef.current && !savedJsonPathRef.current) {
      Alert.alert('Errore', 'Nessun file da inviare');
      return;
    }

    setUploading(true);
    try {
      await uploadToServer(
        savedScanPathRef.current,
        savedJsonPathRef.current,
        scanNameRef.current,
      );
      Alert.alert('Successo', 'File inviati al server con successo!');
    } catch (error: any) {
      Alert.alert(
        'Errore Upload',
        `Impossibile inviare i file al server.\n\nDettagli: ${error.message}\n\nAssicurati che il server sia in esecuzione su ${ROOM_SCAN_SERVER_URL}`,
      );
    } finally {
      setUploading(false);
    }
  }, []);

  const handleExit = useCallback(() => {
    if (scanning) {
      Alert.alert(
        'Esci dalla scansione',
        'Sei sicuro di voler uscire? La scansione corrente verrà persa.',
        [
          {text: 'Annulla', style: 'cancel'},
          {
            text: 'Esci',
            style: 'destructive',
            onPress: () => {
              controls.cancel();
              setScanning(false);
              setScanComplete(false);
              onGoBack();
            },
          },
        ],
      );
    } else {
      onGoBack();
    }
  }, [scanning, controls, onGoBack]);

  // ========== RENDER: Scansione attiva ==========
  if (scanning) {
    return (
      <View style={scanStyles.container}>
        <RoomPlanView style={StyleSheet.absoluteFill} {...viewProps} />

        {/* Controlli sovrapposti */}
        <SafeAreaView style={scanStyles.overlayControls}>
          <View style={scanStyles.topBar}>
            <TouchableOpacity
              style={scanStyles.cancelBtn}
              onPress={cancelScan}>
              <Text style={scanStyles.cancelBtnText}>✕ Annulla</Text>
            </TouchableOpacity>

            <View style={scanStyles.statusBadge}>
              <View style={scanStyles.recordingDot} />
              <Text style={scanStyles.statusText}>Scansione in corso</Text>
            </View>

            <TouchableOpacity
              style={scanStyles.finishBtn}
              onPress={finishScan}>
              <Text style={scanStyles.finishBtnText}>✓ Finisci</Text>
            </TouchableOpacity>
          </View>

          <View style={scanStyles.addRoomContainer}>
            <TouchableOpacity
              style={scanStyles.addRoomBtn}
              onPress={controls.addRoom}>
              <Text style={scanStyles.addRoomBtnText}>+ Aggiungi Stanza</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ========== RENDER: Risultato scansione ==========
  if (scanComplete) {
    return (
      <SafeAreaView style={scanStyles.container}>
        <View style={scanStyles.resultContainer}>
          <View style={scanStyles.resultHeader}>
            <Text style={scanStyles.resultIcon}>✅</Text>
            <Text style={scanStyles.resultTitle}>Scansione Completata</Text>
            <Text style={scanStyles.resultSubtitle}>
              La scansione della stanza è stata completata con successo
            </Text>
          </View>

          {/* Info file */}
          <View style={scanStyles.fileInfo}>
            <Text style={scanStyles.fileInfoTitle}>File generati:</Text>
            {savedScanPathRef.current && (
              <View style={scanStyles.fileRow}>
                <Text style={scanStyles.fileIcon}>📦</Text>
                <Text style={scanStyles.fileName} numberOfLines={1}>
                  {scanNameRef.current}.usdz
                </Text>
              </View>
            )}
            {savedJsonPathRef.current && (
              <View style={scanStyles.fileRow}>
                <Text style={scanStyles.fileIcon}>📄</Text>
                <Text style={scanStyles.fileName} numberOfLines={1}>
                  {scanNameRef.current}.json
                </Text>
              </View>
            )}
          </View>

          {/* Azioni */}
          <View style={scanStyles.actionButtons}>
            <TouchableOpacity
              style={scanStyles.saveBtn}
              onPress={handleSave}
              disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={scanStyles.actionIcon}>💾</Text>
                  <Text style={scanStyles.actionBtnText}>Salva</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={scanStyles.uploadBtn}
              onPress={handleUploadToServer}
              disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={scanStyles.actionIcon}>☁️</Text>
                  <Text style={scanStyles.actionBtnText}>Invia al Server</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Pulsante Nuova Scansione / Esci */}
          <View style={scanStyles.bottomActions}>
            <TouchableOpacity
              style={scanStyles.newScanBtn}
              onPress={startScan}>
              <Text style={scanStyles.newScanBtnText}>🔄 Nuova Scansione</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={scanStyles.exitBtn}
              onPress={onGoBack}>
              <Text style={scanStyles.exitBtnText}>← Torna alla Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ========== RENDER: Stato iniziale ==========
  return (
    <SafeAreaView style={scanStyles.container}>
      <View style={scanStyles.initialContainer}>
        <View style={scanStyles.initialHeader}>
          <TouchableOpacity
            style={scanStyles.backBtn}
            onPress={handleExit}>
            <Text style={scanStyles.backBtnText}>← Indietro</Text>
          </TouchableOpacity>
          <Text style={scanStyles.initialTitle}>Scansione Stanza</Text>
          <View style={{width: 80}} />
        </View>

        <View style={scanStyles.initialContent}>
          <Text style={scanStyles.initialIcon}>📐</Text>
          <Text style={scanStyles.initialHeading}>
            Scansiona la tua stanza
          </Text>
          <Text style={scanStyles.initialDescription}>
            Utilizza la fotocamera per scansionare la stanza in 3D. Muovi il
            dispositivo lentamente per catturare tutti i dettagli.
          </Text>

          <View style={scanStyles.requirementsList}>
            <Text style={scanStyles.requirementItem}>
              📱 iPhone/iPad con chip LiDAR
            </Text>
            <Text style={scanStyles.requirementItem}>
              💡 Buona illuminazione
            </Text>
            <Text style={scanStyles.requirementItem}>
              🔄 Muovi lentamente il dispositivo
            </Text>
          </View>

          <TouchableOpacity
            style={scanStyles.startScanBtn}
            onPress={startScan}>
            <Text style={scanStyles.startScanBtnText}>
              📷 Avvia Scansione
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

// ================= STILI LOCALI =================
const scanStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },

  // Overlay durante la scansione
  overlayControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 16,
  },
  cancelBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  cancelBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  finishBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  finishBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  addRoomContainer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  addRoomBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  addRoomBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  // Risultato scansione
  resultContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  resultIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  resultSubtitle: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 20,
  },
  fileInfo: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  fileInfoTitle: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  fileIcon: {
    fontSize: 20,
  },
  fileName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },

  // Pulsanti azione
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  uploadBtn: {
    flex: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  actionIcon: {
    fontSize: 20,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Bottom actions
  bottomActions: {
    gap: 12,
  },
  newScanBtn: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a855f7',
  },
  newScanBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  exitBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  exitBtnText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '600',
  },

  // Stato iniziale
  initialContainer: {
    flex: 1,
  },
  initialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 8 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backBtnText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  initialTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  initialContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  initialIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  initialHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  initialDescription: {
    color: '#a1a1aa',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  requirementsList: {
    alignSelf: 'stretch',
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 12,
  },
  requirementItem: {
    color: '#d4d4d8',
    fontSize: 14,
    fontWeight: '500',
  },
  startScanBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 20,
    shadowColor: '#3b82f6',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  startScanBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
});
