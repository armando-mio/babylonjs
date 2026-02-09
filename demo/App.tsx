import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {EngineView, useEngine} from '@babylonjs/react-native';
import {
  Scene,
  Vector3,
  Color3,
  Color4,
  Camera,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  WebXRSessionManager,
  WebXRTrackingState,
  WebXRFeatureName,
  WebXRHitTest,
  WebXRPlaneDetector,
  AbstractMesh,
  PointerEventTypes,
} from '@babylonjs/core';
import '@babylonjs/loaders';

// ================= LOGGER =================
const LOG_MAX = 50;
type LogEntry = {time: string; level: 'INFO' | 'WARN' | 'ERROR'; msg: string};
const logBuffer: LogEntry[] = [];

function log(level: LogEntry['level'], msg: string) {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now
    .getMilliseconds()
    .toString()
    .padStart(3, '0')}`;
  const entry: LogEntry = {time, level, msg};
  logBuffer.push(entry);
  if (logBuffer.length > LOG_MAX) logBuffer.shift();

  const prefix = `[AR-APP ${time}]`;
  if (level === 'ERROR') console.error(prefix, msg);
  else if (level === 'WARN') console.warn(prefix, msg);
  else console.log(prefix, msg);
}

// ================= TEXTURES =================
const TEXTURE_PRESETS: {name: string; color: Color3; alpha: number}[] = [
  {name: 'Rosso', color: new Color3(1, 0, 0), alpha: 1},
  {name: 'Blu', color: new Color3(0, 0.3, 1), alpha: 1},
  {name: 'Verde', color: new Color3(0, 0.8, 0.2), alpha: 1},
  {name: 'Oro', color: new Color3(1, 0.84, 0), alpha: 1},
  {name: 'Trasparente', color: new Color3(0.5, 0.5, 1), alpha: 0.4},
  {name: 'Legno', color: new Color3(0.55, 0.35, 0.17), alpha: 1},
  {name: 'Metallo', color: new Color3(0.75, 0.75, 0.78), alpha: 1},
];

// ================= APP =================
const App = () => {
  const engine = useEngine();
  const [camera, setCamera] = useState<Camera>();
  const [scene, setScene] = useState<Scene>();
  const [rootNode, setRootNode] = useState<TransformNode>();
  const [xrSession, setXrSession] = useState<WebXRSessionManager>();
  const [trackingState, setTrackingState] = useState<WebXRTrackingState>();
  const [status, setStatus] = useState('Inizializzazione motore 3D...');
  const [planesDetected, setPlanesDetected] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<LogEntry[]>([]);
  const [selectedTexture, setSelectedTexture] = useState(0);
  const [objectsPlaced, setObjectsPlaced] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);

  const objectsRef = useRef<AbstractMesh[]>([]);
  const xrRef = useRef<any>(null);
  const planeCountRef = useRef(0);

  // Refresh debug logs
  const refreshLogs = useCallback(() => {
    setDebugLogs([...logBuffer]);
  }, []);

  // ========== STEP 1: Initialize Scene ==========
  useEffect(() => {
    if (!engine) {
      log('INFO', 'In attesa del motore BabylonJS...');
      return;
    }

    log('INFO', `Motore BabylonJS inizializzato. Platform: ${Platform.OS}`);
    log('INFO', `Engine version: ${engine.description || 'ReactNativeEngine'}`);

    try {
      const newScene = new Scene(engine);
      newScene.clearColor = new Color4(0.2, 0.2, 0.3, 1);

      // Camera: ArcRotateCamera (necessaria per BabylonJS React Native)
      const cam = new ArcRotateCamera(
        'mainCamera',
        -Math.PI / 2,
        Math.PI / 2.5,
        3,
        Vector3.Zero(),
        newScene,
      );
      cam.minZ = 0.01;
      cam.wheelDeltaPercentage = 0.01;
      cam.pinchDeltaPercentage = 0.01;
      setCamera(cam);
      log('INFO', 'Camera ArcRotateCamera creata');

      // Luci
      const hemiLight = new HemisphericLight(
        'hemiLight',
        new Vector3(0, 1, 0),
        newScene,
      );
      hemiLight.intensity = 0.7;

      const dirLight = new DirectionalLight(
        'dirLight',
        new Vector3(-1, -2, -1),
        newScene,
      );
      dirLight.intensity = 0.5;
      log('INFO', 'Luci aggiunte alla scena');

      // Root container per tutti gli oggetti AR
      const root = new TransformNode('ARRoot', newScene);
      setRootNode(root);

      // Cubo demo iniziale
      const demoBox = MeshBuilder.CreateBox(
        'demoBox',
        {size: 0.15},
        newScene,
      );
      demoBox.position = new Vector3(0, 0, 0);
      demoBox.parent = root;
      const demoMat = new StandardMaterial('demoBoxMat', newScene);
      demoMat.diffuseColor = TEXTURE_PRESETS[0].color.clone();
      demoMat.specularColor = new Color3(0.3, 0.3, 0.3);
      demoBox.material = demoMat;
      objectsRef.current.push(demoBox);
      log('INFO', 'Cubo demo creato (rosso, 15cm)');

      // Sfera demo
      const demoSphere = MeshBuilder.CreateSphere(
        'demoSphere',
        {diameter: 0.1, segments: 16},
        newScene,
      );
      demoSphere.position = new Vector3(0.25, 0, 0);
      demoSphere.parent = root;
      const sphereMat = new StandardMaterial('demoSphereMat', newScene);
      sphereMat.diffuseColor = TEXTURE_PRESETS[1].color.clone();
      sphereMat.specularColor = new Color3(0.5, 0.5, 0.5);
      demoSphere.material = sphereMat;
      objectsRef.current.push(demoSphere);
      log('INFO', 'Sfera demo creata (blu, 10cm)');

      // Cilindro demo
      const demoCylinder = MeshBuilder.CreateCylinder(
        'demoCylinder',
        {height: 0.15, diameter: 0.08, tessellation: 16},
        newScene,
      );
      demoCylinder.position = new Vector3(-0.25, 0, 0);
      demoCylinder.parent = root;
      const cylMat = new StandardMaterial('demoCylMat', newScene);
      cylMat.diffuseColor = TEXTURE_PRESETS[2].color.clone();
      cylMat.specularColor = new Color3(0.3, 0.3, 0.3);
      demoCylinder.material = cylMat;
      objectsRef.current.push(demoCylinder);
      log('INFO', 'Cilindro demo creato (verde, 15cm)');

      // Pointer observable per piazzare oggetti con il tap
      newScene.onPointerObservable.add(evtData => {
        if (evtData.type === PointerEventTypes.POINTERTAP) {
          log(
            'INFO',
            `Tap rilevato a (${evtData.event.offsetX?.toFixed(0)}, ${evtData.event.offsetY?.toFixed(0)})`,
          );

          // Calcola la posizione nel mondo 3D usando il pick
          const pickResult = newScene.pick(
            evtData.event.offsetX || 0,
            evtData.event.offsetY || 0,
          );

          if (pickResult?.hit && pickResult.pickedPoint) {
            log(
              'INFO',
              `Pick hit: ${pickResult.pickedMesh?.name} a pos (${pickResult.pickedPoint.x.toFixed(2)}, ${pickResult.pickedPoint.y.toFixed(2)}, ${pickResult.pickedPoint.z.toFixed(2)})`,
            );

            // Crea nuovo oggetto alla posizione del tap
            const shapes = ['box', 'sphere', 'cylinder', 'torus'];
            const shapeIndex =
              objectsRef.current.length % shapes.length;
            const shapeName = shapes[shapeIndex];
            const objName = `placed_${shapeName}_${Date.now()}`;

            let newMesh: AbstractMesh;
            switch (shapeName) {
              case 'sphere':
                newMesh = MeshBuilder.CreateSphere(
                  objName,
                  {diameter: 0.08, segments: 16},
                  newScene,
                );
                break;
              case 'cylinder':
                newMesh = MeshBuilder.CreateCylinder(
                  objName,
                  {height: 0.12, diameter: 0.06, tessellation: 16},
                  newScene,
                );
                break;
              case 'torus':
                newMesh = MeshBuilder.CreateTorus(
                  objName,
                  {diameter: 0.08, thickness: 0.02, tessellation: 16},
                  newScene,
                );
                break;
              default:
                newMesh = MeshBuilder.CreateBox(
                  objName,
                  {size: 0.06},
                  newScene,
                );
            }

            newMesh.position = pickResult.pickedPoint.clone();
            newMesh.parent = root;
            const newMat = new StandardMaterial(`${objName}_mat`, newScene);
            const texIdx =
              objectsRef.current.length % TEXTURE_PRESETS.length;
            newMat.diffuseColor = TEXTURE_PRESETS[texIdx].color.clone();
            newMat.alpha = TEXTURE_PRESETS[texIdx].alpha;
            newMat.specularColor = new Color3(0.4, 0.4, 0.4);
            newMesh.material = newMat;
            objectsRef.current.push(newMesh);
            setObjectsPlaced(prev => prev + 1);
            log(
              'INFO',
              `Nuovo ${shapeName} piazzato: "${objName}" con texture ${TEXTURE_PRESETS[texIdx].name}`,
            );
          } else {
            // Se non colpisci niente, piazza davanti alla camera
            if (newScene.activeCamera) {
              const ray = newScene.activeCamera.getForwardRay(0.5);
              const pos = ray.origin.add(
                ray.direction.scale(ray.length),
              );
              const objName = `placed_front_${Date.now()}`;
              const newMesh = MeshBuilder.CreateBox(
                objName,
                {size: 0.06},
                newScene,
              );
              newMesh.position = pos;
              newMesh.parent = root;
              const newMat = new StandardMaterial(
                `${objName}_mat`,
                newScene,
              );
              const texIdx =
                objectsRef.current.length % TEXTURE_PRESETS.length;
              newMat.diffuseColor = TEXTURE_PRESETS[texIdx].color.clone();
              newMat.alpha = TEXTURE_PRESETS[texIdx].alpha;
              newMesh.material = newMat;
              objectsRef.current.push(newMesh);
              setObjectsPlaced(prev => prev + 1);
              log(
                'INFO',
                `Oggetto piazzato davanti alla camera: "${objName}"`,
              );
            }
          }
        }
      });
      log('INFO', 'Pointer/Tap listener registrato');

      setScene(newScene);
      setSceneReady(true);
      setStatus('Scena 3D pronta. Premi "Avvia AR" per iniziare.');
      log('INFO', '✅ Scena 3D completamente inizializzata');
    } catch (error: any) {
      log('ERROR', `Errore inizializzazione scena: ${error.message}`);
      setStatus(`Errore: ${error.message}`);
    }
  }, [engine]);

  // ========== STEP 2: Toggle AR ==========
  const toggleAR = useCallback(async () => {
    if (!scene || !rootNode) {
      log('WARN', 'Scena o rootNode non ancora pronto');
      return;
    }

    try {
      if (xrSession) {
        // ---- EXIT AR ----
        log('INFO', 'Uscita dalla sessione AR...');
        setStatus('Chiusura AR...');
        await xrSession.exitXRAsync();
        log('INFO', '✅ Sessione AR terminata');
        setStatus('AR disattivata. Premi "Avvia AR" per riavviare.');
      } else {
        // ---- ENTER AR ----
        log('INFO', '--- AVVIO AR ---');
        setStatus('Avvio AR in corso...');

        // Step 2a: Crea XR experience
        log('INFO', 'Creazione XR Experience...');
        const xr = await scene.createDefaultXRExperienceAsync({
          disableDefaultUI: true,
          disableTeleportation: true,
        });
        xrRef.current = xr;
        log('INFO', '✅ XR Experience creata');

        // Step 2b: Abilita features AR prima di entrare nella sessione
        const fm = xr.baseExperience.featuresManager;

        // --- PLANE DETECTION (ARCore/ARKit) ---
        try {
          const planeDetector = fm.enableFeature(
            WebXRFeatureName.PLANE_DETECTION,
            'latest',
          ) as WebXRPlaneDetector;
          log('INFO', '✅ Plane Detection abilitato');

          if (planeDetector && planeDetector.onPlaneAddedObservable) {
            planeDetector.onPlaneAddedObservable.add(plane => {
              planeCountRef.current++;
              setPlanesDetected(planeCountRef.current);
              log(
                'INFO',
                `Piano rilevato #${planeCountRef.current}: classificazione=${
                  (plane as any).xrPlane?.orientation || 'N/A'
                }`,
              );

              // Visualizza il piano rilevato con un marker semi-trasparente
              try {
                const planeMesh = MeshBuilder.CreatePlane(
                  `plane_${planeCountRef.current}`,
                  {size: 0.5},
                  scene,
                );
                planeMesh.position = plane.polygonDefinition
                  ? Vector3.Zero()
                  : Vector3.Zero();
                const planeMat = new StandardMaterial(
                  `planeMat_${planeCountRef.current}`,
                  scene,
                );
                planeMat.diffuseColor = new Color3(0, 1, 0.5);
                planeMat.alpha = 0.15;
                planeMat.backFaceCulling = false;
                planeMesh.material = planeMat;
                planeMesh.parent = rootNode;
                log(
                  'INFO',
                  `Marker piano #${planeCountRef.current} aggiunto alla scena`,
                );
              } catch (planeErr: any) {
                log(
                  'WARN',
                  `Impossibile creare marker piano: ${planeErr.message}`,
                );
              }
            });

            planeDetector.onPlaneUpdatedObservable?.add(plane => {
              log(
                'INFO',
                `Piano aggiornato: bounds cambiati`,
              );
            });

            planeDetector.onPlaneRemovedObservable?.add(plane => {
              planeCountRef.current = Math.max(0, planeCountRef.current - 1);
              setPlanesDetected(planeCountRef.current);
              log('INFO', 'Piano rimosso');
            });
          }
        } catch (planeErr: any) {
          log('WARN', `Plane Detection non disponibile: ${planeErr.message}`);
        }

        // --- HIT TEST ---
        try {
          const hitTest = fm.enableFeature(
            WebXRFeatureName.HIT_TEST,
            'latest',
          ) as WebXRHitTest;
          log('INFO', '✅ Hit Test abilitato');

          if (hitTest && hitTest.onHitTestResultObservable) {
            hitTest.onHitTestResultObservable.add(results => {
              if (results.length > 0) {
                // Primo risultato disponibile - logga periodicamente
                const pos = results[0].position;
                if (pos && Math.random() < 0.02) {
                  log(
                    'INFO',
                    `HitTest: superficie rilevata a (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`,
                  );
                }
              }
            });
          }
        } catch (hitErr: any) {
          log('WARN', `Hit Test non disponibile: ${hitErr.message}`);
        }

        // Step 2c: Entra nella sessione AR
        log('INFO', "Chiamata enterXRAsync('immersive-ar', 'unbounded')...");
        const session = await xr.baseExperience.enterXRAsync(
          'immersive-ar',
          'unbounded',
          xr.renderTarget,
        );
        log('INFO', '✅ Sessione AR avviata con successo!');

        setXrSession(session);

        // Lifecycle: sessione terminata
        session.onXRSessionEnded.add(() => {
          log('INFO', 'Sessione XR terminata (evento)');
          setXrSession(undefined);
          setTrackingState(undefined);
          xrRef.current = null;
          setStatus('AR terminata. Premi "Avvia AR" per riavviare.');
        });

        // Tracking state
        const xrCam = xr.baseExperience.camera;
        setTrackingState(xrCam.trackingState);
        log(
          'INFO',
          `Tracking state iniziale: ${WebXRTrackingState[xrCam.trackingState]}`,
        );

        xrCam.onTrackingStateChanged.add(newState => {
          setTrackingState(newState);
          log(
            'INFO',
            `Tracking state cambiato: ${WebXRTrackingState[newState]}`,
          );
        });

        // Posiziona gli oggetti davanti alla camera
        if (scene.activeCamera) {
          const ray = scene.activeCamera.getForwardRay(1);
          rootNode.position = ray.origin.add(
            ray.direction.scale(ray.length),
          );
          rootNode.rotate(Vector3.Up(), Math.PI);
          log(
            'INFO',
            `Oggetti posizionati davanti alla camera: (${rootNode.position.x.toFixed(2)}, ${rootNode.position.y.toFixed(2)}, ${rootNode.position.z.toFixed(2)})`,
          );
        }

        setStatus('AR ATTIVA! Inquadra le superfici e tocca per piazzare oggetti.');
        log('INFO', '=== AR COMPLETAMENTE OPERATIVA ===');
      }
    } catch (error: any) {
      log('ERROR', `Errore AR: ${error.message}\n${error.stack || ''}`);
      setStatus(`Errore AR: ${error.message}`);
      setXrSession(undefined);
      Alert.alert(
        'Errore AR',
        `Impossibile avviare la sessione AR:\n${error.message}\n\nAssicurati che ARCore/ARKit sia installato e che i permessi della fotocamera siano concessi.`,
      );
    }
  }, [scene, rootNode, xrSession]);

  // ========== STEP 3: Change Textures ==========
  const changeTexture = useCallback(
    (index: number) => {
      if (!scene) return;
      setSelectedTexture(index);
      const preset = TEXTURE_PRESETS[index];
      log(
        'INFO',
        `Cambio texture: ${preset.name} (R:${preset.color.r.toFixed(1)} G:${preset.color.g.toFixed(1)} B:${preset.color.b.toFixed(1)} A:${preset.alpha})`,
      );

      // Applica la texture a tutti gli oggetti piazzati
      objectsRef.current.forEach(mesh => {
        if (mesh.material && mesh.material instanceof StandardMaterial) {
          (mesh.material as StandardMaterial).diffuseColor =
            preset.color.clone();
          (mesh.material as StandardMaterial).alpha = preset.alpha;
        }
      });
      setStatus(`Texture "${preset.name}" applicata a ${objectsRef.current.length} oggetti`);
    },
    [scene],
  );

  // ========== STEP 4: Clear All Objects ==========
  const clearObjects = useCallback(() => {
    // Rimuovi solo gli oggetti piazzati dall'utente (non i 3 demo iniziali)
    const toRemove = objectsRef.current.slice(3);
    toRemove.forEach(mesh => {
      mesh.dispose();
    });
    objectsRef.current = objectsRef.current.slice(0, 3);
    setObjectsPlaced(0);
    log('INFO', `Rimossi ${toRemove.length} oggetti piazzati`);
    setStatus('Oggetti rimossi. Tocca per piazzarne di nuovi.');
  }, []);

  // ========== RENDER ==========
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.sceneContainer}>
        {/* Engine View - DEVE renderizzarsi SEMPRE per permettere a BabylonNative di inizializzare la superficie grafica.
            Se camera è undefined, EngineView mostra una view vuota internamente. */}
        <EngineView
          style={styles.engineView}
          camera={camera}
          displayFrameRate={true}
          antiAliasing={2}
        />

        {/* Status bar in alto */}
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{status}</Text>
          {trackingState !== undefined && (
            <Text
              style={[
                styles.trackingText,
                {
                  color:
                    trackingState === WebXRTrackingState.TRACKING
                      ? '#00ff88'
                      : trackingState ===
                          WebXRTrackingState.NOT_TRACKING
                        ? '#ff4444'
                        : '#ffaa00',
                },
              ]}>
              Tracking: {WebXRTrackingState[trackingState]}
            </Text>
          )}
        </View>

        {/* Info overlay */}
        <View style={styles.infoBar}>
          <Text style={styles.infoText}>
            📐 Piani: {planesDetected} | 📦 Oggetti: {objectsRef.current.length} (+{objectsPlaced} piazzati)
          </Text>
          <Text style={styles.infoText}>
            📱 {Platform.OS === 'android' ? 'ARCore' : 'ARKit'} | Engine: BabylonJS 6.14.0
          </Text>
        </View>

        {/* Pulsanti principali */}
        <View style={styles.controls}>
          {/* Pulsante AR */}
          <TouchableOpacity
            style={[
              styles.arButton,
              xrSession ? styles.arButtonActive : styles.arButtonInactive,
              !sceneReady && styles.arButtonDisabled,
            ]}
            onPress={toggleAR}
            disabled={!sceneReady}>
            <Text style={styles.arButtonText}>
              {!sceneReady
                ? '⏳ Caricamento...'
                : xrSession
                  ? '⏹ Ferma AR'
                  : '🚀 Avvia AR'}
            </Text>
          </TouchableOpacity>

          {/* Pulsante Clear */}
          {objectsPlaced > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={clearObjects}>
              <Text style={styles.clearButtonText}>🗑 Rimuovi ({objectsPlaced})</Text>
            </TouchableOpacity>
          )}

          {/* Pulsante Debug */}
          <TouchableOpacity
            style={styles.debugButton}
            onPress={() => {
              refreshLogs();
              setShowDebug(!showDebug);
            }}>
            <Text style={styles.debugButtonText}>
              {showDebug ? '✖ Chiudi Log' : '🔧 Log'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Texture selector */}
        <View style={styles.textureBar}>
          <Text style={styles.textureLabelText}>Texture:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TEXTURE_PRESETS.map((preset, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.textureButton,
                  {
                    backgroundColor: `rgb(${Math.floor(preset.color.r * 255)},${Math.floor(preset.color.g * 255)},${Math.floor(preset.color.b * 255)})`,
                    borderWidth: selectedTexture === idx ? 3 : 1,
                    borderColor:
                      selectedTexture === idx ? '#ffffff' : '#666666',
                    opacity: preset.alpha < 1 ? 0.6 : 1,
                  },
                ]}
                onPress={() => changeTexture(idx)}>
                <Text style={styles.textureButtonText}>{preset.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Debug log panel */}
        {showDebug && (
          <View style={styles.debugPanel}>
            <View style={styles.debugHeader}>
              <Text style={styles.debugTitle}>📋 Debug Log</Text>
              <TouchableOpacity onPress={refreshLogs}>
                <Text style={styles.refreshText}>🔄 Aggiorna</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.debugScroll}>
              {debugLogs
                .slice()
                .reverse()
                .map((entry, idx) => (
                  <Text
                    key={idx}
                    style={[
                      styles.logEntry,
                      {
                        color:
                          entry.level === 'ERROR'
                            ? '#ff4444'
                            : entry.level === 'WARN'
                              ? '#ffaa00'
                              : '#aaddaa',
                      },
                    ]}>
                    [{entry.time}] {entry.level}: {entry.msg}
                  </Text>
                ))}
            </ScrollView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

// ================= STYLES =================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  sceneContainer: {
    flex: 1,
  },
  engineView: {
    flex: 1,
  },
  statusBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 10,
    borderRadius: 8,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  trackingText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  infoBar: {
    position: 'absolute',
    top: 80,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 6,
  },
  infoText: {
    color: '#cccccc',
    fontSize: 11,
  },
  controls: {
    position: 'absolute',
    bottom: 120,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  arButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  arButtonInactive: {
    backgroundColor: '#2196F3',
  },
  arButtonActive: {
    backgroundColor: '#f44336',
  },
  arButtonDisabled: {
    backgroundColor: '#555555',
    opacity: 0.6,
  },
  arButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearButton: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 25,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  debugButton: {
    backgroundColor: '#333333',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#666',
  },
  debugButtonText: {
    color: '#aaa',
    fontSize: 14,
  },
  textureBar: {
    position: 'absolute',
    bottom: 60,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textureLabelText: {
    color: '#fff',
    fontSize: 12,
    marginRight: 8,
    fontWeight: 'bold',
  },
  textureButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginHorizontal: 3,
  },
  textureButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
  debugPanel: {
    position: 'absolute',
    top: 130,
    left: 10,
    right: 10,
    bottom: 180,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 6,
  },
  debugTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  refreshText: {
    color: '#66bbff',
    fontSize: 12,
  },
  debugScroll: {
    flex: 1,
  },
  logEntry: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
});

export default App;