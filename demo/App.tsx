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
  Switch,
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
  TransformNode,
  WebXRSessionManager,
  WebXRTrackingState,
  AbstractMesh,
  PointerEventTypes,
  Mesh,
} from '@babylonjs/core';
import '@babylonjs/loaders';

// ================= LOGGER =================
const LOG_MAX = 60;
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

// ================= TEXTURE PRESETS =================
const TEXTURE_PRESETS: {name: string; color: Color3; alpha: number}[] = [
  {name: 'Rosso', color: new Color3(1, 0, 0), alpha: 1},
  {name: 'Blu', color: new Color3(0, 0.3, 1), alpha: 1},
  {name: 'Verde', color: new Color3(0, 0.8, 0.2), alpha: 1},
];

// ================= CONSTANTS =================
const CUBE_SIZE = 0.12;
const SELECTION_EMISSIVE = new Color3(0.3, 0.6, 1);

// ================= APP =================
const App = () => {
  const engine = useEngine();
  const [camera, setCamera] = useState<Camera>();
  const [scene, setScene] = useState<Scene>();
  const [rootNode, setRootNode] = useState<TransformNode>();
  const [xrSession, setXrSession] = useState<WebXRSessionManager>();
  const [trackingState, setTrackingState] = useState<WebXRTrackingState>();
  const [status, setStatus] = useState('Inizializzazione motore 3D...');
  const [surfaceDetected, setSurfaceDetected] = useState(false);
  const [selectedTexture, setSelectedTexture] = useState(0);
  const [objectsPlaced, setObjectsPlaced] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [selectedCube, setSelectedCube] = useState<AbstractMesh | null>(null);
  const [showManipulator, setShowManipulator] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'CREAZIONE' | 'SELEZIONE'>('CREAZIONE');
  const [manipProperty, setManipProperty] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  const cubesRef = useRef<AbstractMesh[]>([]);
  const xrRef = useRef<any>(null);
  const selectedCubeRef = useRef<AbstractMesh | null>(null);
  const lastHitPosRef = useRef<Vector3 | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const rootNodeRef = useRef<TransformNode | null>(null);
  const selectedTextureRef = useRef(0);
  const trackingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackingRef = useRef<WebXRTrackingState | null>(null);
  const surfaceDetectedRef = useRef(false);
  const interactionModeRef = useRef<'CREAZIONE' | 'SELEZIONE'>('CREAZIONE');
  const hitTestMarkerRef = useRef<Mesh | null>(null);
  const groundPlaneRef = useRef<Mesh | null>(null);
  const groundYRef = useRef(-1.3);

  // ========== MANIPULATE CUBE: +/- step ==========
  const manipStep = useCallback((prop: string, direction: 1 | -1) => {
    const cube = selectedCubeRef.current;
    if (!cube) return;
    if (prop === 'scala') {
      const cur = cube.scaling.x;
      const next = Math.min(5, Math.max(0.1, cur + direction * 0.1)); // ±0.1 step, clamp 0.1-5
      cube.scaling = new Vector3(next, next, next);
      log('INFO', `Scala: ${(next * 100).toFixed(0)}%`);
    } else if (prop === 'rotX') {
      cube.rotation.x += direction * (15 * Math.PI / 180); // ±15°
      log('INFO', `Rot X: ${((cube.rotation.x * 180) / Math.PI).toFixed(0)}°`);
    } else if (prop === 'rotY') {
      cube.rotation.y += direction * (15 * Math.PI / 180); // ±15°
      log('INFO', `Rot Y: ${((cube.rotation.y * 180) / Math.PI).toFixed(0)}°`);
    }
    forceRender(n => n + 1);
  }, []);

  // ========== SELECT / DESELECT CUBE ==========
  const selectCube = useCallback((mesh: AbstractMesh | null) => {
    if (selectedCubeRef.current) {
      const prevMat = selectedCubeRef.current.material as StandardMaterial | null;
      if (prevMat) {
        prevMat.emissiveColor = Color3.Black();
      }
      log('INFO', `Deselezionato: ${selectedCubeRef.current.name}`);
    }
    selectedCubeRef.current = mesh;
    setSelectedCube(mesh);
    if (mesh) {
      const mat = mesh.material as StandardMaterial | null;
      if (mat) {
        mat.emissiveColor = SELECTION_EMISSIVE.clone();
      }
      setShowManipulator(true);
      log('INFO', `Selezionato: ${mesh.name}`);
    } else {
      setShowManipulator(false);
      setManipProperty(null);
    }
  }, []);

  // ========== PLACE CUBE AT POSITION ==========
  const placeCubeAt = useCallback(
    (position: Vector3, scn: Scene, _root: TransformNode) => {
      const objName = `cube_${Date.now()}`;
      const newCube = MeshBuilder.CreateBox(objName, {size: CUBE_SIZE}, scn);
      newCube.position = position.clone();
      newCube.position.y += CUBE_SIZE / 2;
      // NO parent — cubes stay in world coordinates so they remain visible in AR
      newCube.isPickable = true;

      const mat = new StandardMaterial(`${objName}_mat`, scn);
      const texIdx = selectedTextureRef.current;
      mat.diffuseColor = TEXTURE_PRESETS[texIdx].color.clone();
      mat.alpha = TEXTURE_PRESETS[texIdx].alpha;
      mat.specularColor = new Color3(0.4, 0.4, 0.4);
      mat.emissiveColor = Color3.Black();
      newCube.material = mat;

      cubesRef.current.push(newCube);
      setObjectsPlaced(prev => prev + 1);
      selectCube(newCube);

      log(
        'INFO',
        `Cubo piazzato: "${objName}" a (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) texture=${TEXTURE_PRESETS[texIdx].name}`,
      );
      setStatus('Cubo piazzato! Toccalo per selezionarlo.');
    },
    [selectCube],
  );

  // ========== STEP 1: Initialize Scene ==========
  useEffect(() => {
    if (!engine) {
      log('INFO', 'In attesa del motore BabylonJS...');
      return;
    }

    log('INFO', `Motore BabylonJS inizializzato. Platform: ${Platform.OS}`);

    try {
      const newScene = new Scene(engine);
      newScene.clearColor = new Color4(0.15, 0.15, 0.2, 1);
      sceneRef.current = newScene;

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

      const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), newScene);
      hemiLight.intensity = 0.7;

      const dirLight = new DirectionalLight('dirLight', new Vector3(-1, -2, -1), newScene);
      dirLight.intensity = 0.5;
      log('INFO', 'Luci aggiunte alla scena');

      const root = new TransformNode('ARRoot', newScene);
      setRootNode(root);
      rootNodeRef.current = root;

      // Demo cube
      const demoBox = MeshBuilder.CreateBox('cube_demo', {size: CUBE_SIZE}, newScene);
      demoBox.position = new Vector3(0, 0, 0.5);
      demoBox.parent = root;
      const demoMat = new StandardMaterial('cube_demo_mat', newScene);
      demoMat.diffuseColor = TEXTURE_PRESETS[0].color.clone();
      demoMat.specularColor = new Color3(0.3, 0.3, 0.3);
      demoMat.emissiveColor = Color3.Black();
      demoBox.material = demoMat;
      demoBox.isPickable = true;
      cubesRef.current.push(demoBox);
      log('INFO', `Cubo demo creato (${CUBE_SIZE * 100}cm, rosso)`);

      // Hit-test reticle — a visible torus (ring) lying flat on the ground
      const reticle = MeshBuilder.CreateTorus(
        'hitTestMarker',
        {diameter: 0.20, thickness: 0.015, tessellation: 32},
        newScene,
      );
      reticle.rotation.x = 0; // torus is already flat
      const reticleMat = new StandardMaterial('hitTestMarkerMat', newScene);
      reticleMat.diffuseColor = new Color3(0, 1, 0);
      reticleMat.emissiveColor = new Color3(0, 1, 0);
      reticleMat.alpha = 0.9;
      reticleMat.backFaceCulling = false;
      reticle.material = reticleMat;
      reticle.isVisible = false;
      reticle.isPickable = false;
      hitTestMarkerRef.current = reticle;

      // ========== POINTER / TAP HANDLER ==========
      newScene.onPointerObservable.add(evtData => {
        if (evtData.type !== PointerEventTypes.POINTERTAP) return;

        const mode = interactionModeRef.current;

        // Try scene.pick first (works in non-AR mode)
        const px = evtData.event.offsetX || 0;
        const py = evtData.event.offsetY || 0;
        const pickResult = newScene.pick(px, py, (mesh) => mesh.name.startsWith('cube_'));
        if (pickResult?.hit && pickResult.pickedMesh) {
          log('INFO', `Tap su cubo (pick): ${pickResult.pickedMesh.name} (modo: ${mode})`);
          selectCube(pickResult.pickedMesh);
          return;
        }

        // In AR, scene.pick often fails. Use proximity check near reticle/camera ray.
        if (xrRef.current && lastHitPosRef.current) {
          const hitPos = lastHitPosRef.current;
          const SELECT_RADIUS = 0.35; // meters — generous for 12cm cubes
          let closestCube: AbstractMesh | null = null;
          let closestDist = SELECT_RADIUS;
          for (const cube of cubesRef.current) {
            if (!cube.isVisible || cube.name === 'cube_demo') continue;
            const dx = cube.position.x - hitPos.x;
            const dz = cube.position.z - hitPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < closestDist) {
              closestDist = dist;
              closestCube = cube;
            }
          }
          if (closestCube) {
            log('INFO', `Tap su cubo (proximity ${closestDist.toFixed(2)}m): ${closestCube.name} (modo: ${mode})`);
            selectCube(closestCube);
            return;
          }
        }

        // No cube tapped
        log('INFO', `Tap su vuoto (modo: ${mode})`);

        // In SELEZIONE mode, deselect on empty tap
        if (mode === 'SELEZIONE') {
          selectCube(null);
          return;
        }

        // CREAZIONE mode: Place cube at reticle position ONLY
        if (lastHitPosRef.current && xrRef.current && surfaceDetectedRef.current) {
          const pos = lastHitPosRef.current.clone();
          log('INFO', `Piazzamento cubo a reticle: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
          placeCubeAt(pos, newScene, rootNodeRef.current!);
        } else if (!xrRef.current) {
          // Non-AR tap: deselect
          selectCube(null);
        } else {
          setStatus('Inquadra il pavimento per piazzare un cubo');
        }
      });
      log('INFO', 'Pointer/Tap listener registrato');

      setScene(newScene);
      setSceneReady(true);
      setStatus('Scena 3D pronta. Premi "Avvia AR" per iniziare.');
      log('INFO', '\u2705 Scena 3D completamente inizializzata');
    } catch (error: any) {
      log('ERROR', `Errore inizializzazione scena: ${error.message}`);
      setStatus(`Errore: ${error.message}`);
    }
  }, [engine, selectCube, placeCubeAt]);

  // ========== STEP 2: Toggle AR ==========
  const toggleAR = useCallback(async () => {
    if (!scene || !rootNode) {
      log('WARN', 'Scena o rootNode non ancora pronto');
      return;
    }

    try {
      if (xrSession) {
        log('INFO', 'Uscita dalla sessione AR...');
        setStatus('Chiusura AR...');

        if (hitTestMarkerRef.current) {
          hitTestMarkerRef.current.isVisible = false;
        }
        if (groundPlaneRef.current) {
          groundPlaneRef.current.dispose();
          groundPlaneRef.current = null;
        }
        lastHitPosRef.current = null;
        lastTrackingRef.current = null;
        setSurfaceDetected(false);
        surfaceDetectedRef.current = false;
        if (trackingTimerRef.current) {
          clearTimeout(trackingTimerRef.current);
          trackingTimerRef.current = null;
        }

        await xrSession.exitXRAsync();
        log('INFO', '\u2705 Sessione AR terminata');
        setStatus('AR disattivata. Premi "Avvia AR" per riavviare.');

        // Show demo cube again
        cubesRef.current.forEach(cube => {
          if (cube.name === 'cube_demo') {
            cube.isVisible = true;
          }
        });
      } else {
        log('INFO', '--- AVVIO AR ---');
        setStatus('Avvio AR in corso...');

        log('INFO', 'Creazione XR Experience...');
        const xr = await scene.createDefaultXRExperienceAsync({
          disableDefaultUI: true,
          disableTeleportation: true,
        });
        xrRef.current = xr;
        log('INFO', '\u2705 XR Experience creata');

        log('INFO', "Chiamata enterXRAsync('immersive-ar', 'unbounded')...");
        const session = await xr.baseExperience.enterXRAsync(
          'immersive-ar',
          'unbounded',
          xr.renderTarget,
        );
        log('INFO', '\u2705 Sessione AR avviata con successo!');

        // ====== GROUND PLANE (visible grid so user sees where the floor is) ======
        const GROUND_Y = groundYRef.current;
        const ground = MeshBuilder.CreateGround(
          'virtualGround',
          {width: 20, height: 20, subdivisions: 40},
          scene,
        );
        ground.position.y = GROUND_Y;
        const groundMat = new StandardMaterial('groundMat', scene);
        groundMat.diffuseColor = new Color3(0, 0.6, 0.6);
        groundMat.emissiveColor = new Color3(0, 0.15, 0.15);
        groundMat.alpha = 0.15;
        groundMat.wireframe = true;
        groundMat.backFaceCulling = false;
        ground.material = groundMat;
        ground.isPickable = false;
        ground.isVisible = true;
        groundPlaneRef.current = ground;
        log('INFO', `Piano griglia visibile creato a Y=${GROUND_Y.toFixed(2)}`);

        // Mark surface as detected immediately (ground plane is always there)
        surfaceDetectedRef.current = true;
        setSurfaceDetected(true);

        // ====== PER-FRAME: RAYCAST FROM CAMERA CENTER TO GROUND ======
        xr.baseExperience.sessionManager.onXRFrameObservable.add(() => {
          if (!hitTestMarkerRef.current || !groundPlaneRef.current) return;

          const cam = xr.baseExperience.camera;
          if (!cam) return;

          // Get camera world position and forward direction
          const camForward = cam.getDirection(Vector3.Forward());
          const camPos = cam.globalPosition.clone();

          // Raycast: find where the forward vector hits the ground plane Y
          // ground is at GROUND_Y; we solve: camPos.y + t * camForward.y = GROUND_Y
          if (Math.abs(camForward.y) > 0.001) {
            const t = (GROUND_Y - camPos.y) / camForward.y;
            if (t > 0.3 && t < 10) { // Only ahead of camera, reasonable distance
              const hitX = camPos.x + t * camForward.x;
              const hitZ = camPos.z + t * camForward.z;
              const hitPos = new Vector3(hitX, GROUND_Y, hitZ);

              hitTestMarkerRef.current.isVisible = true;
              hitTestMarkerRef.current.position.set(hitX, GROUND_Y + 0.005, hitZ);
              lastHitPosRef.current = hitPos;
            }
          }
        });
        log('INFO', '\u2705 Raycast pavimento attivo');

        setXrSession(session);

        session.onXRSessionEnded.add(() => {
          log('INFO', 'Sessione XR terminata (evento)');
          setXrSession(undefined);
          setTrackingState(undefined);
          xrRef.current = null;
          lastTrackingRef.current = null;
          if (trackingTimerRef.current) {
            clearTimeout(trackingTimerRef.current);
            trackingTimerRef.current = null;
          }
          setStatus('AR terminata. Premi "Avvia AR" per riavviare.');
        });

        const xrCam = xr.baseExperience.camera;
        log('INFO', `Tracking state iniziale: ${WebXRTrackingState[xrCam.trackingState]}`);

        // Debounced tracking state
        xrCam.onTrackingStateChanged.add(newState => {
          if (newState === lastTrackingRef.current) return;
          if (trackingTimerRef.current) {
            clearTimeout(trackingTimerRef.current);
          }
          trackingTimerRef.current = setTimeout(() => {
            if (newState !== lastTrackingRef.current) {
              lastTrackingRef.current = newState;
              setTrackingState(newState);
              log('INFO', `Tracking state stabile: ${WebXRTrackingState[newState]}`);
            }
          }, 500);
        });

        // Set initial as TRACKING after a short delay
        setTimeout(() => {
          if (lastTrackingRef.current === null) {
            lastTrackingRef.current = WebXRTrackingState.TRACKING;
            setTrackingState(WebXRTrackingState.TRACKING);
            log('INFO', 'Tracking state impostato a TRACKING (default iniziale)');
          }
        }, 2000);

        // Hide demo cube in AR
        cubesRef.current.forEach(cube => {
          if (cube.name === 'cube_demo') {
            cube.isVisible = false;
          }
        });

        setStatus('AR ATTIVA! La griglia indica il pavimento. Punta in basso e tocca per piazzare.');
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

  // ========== STEP 3: Change Texture (selected cube only) ==========
  const changeTexture = useCallback(
    (index: number) => {
      if (!scene) return;
      setSelectedTexture(index);
      selectedTextureRef.current = index;
      const preset = TEXTURE_PRESETS[index];

      if (selectedCubeRef.current) {
        const mat = selectedCubeRef.current.material as StandardMaterial | null;
        if (mat) {
          mat.diffuseColor = preset.color.clone();
          mat.alpha = preset.alpha;
        }
        log('INFO', `Texture "${preset.name}" applicata a: ${selectedCubeRef.current.name}`);
        setStatus(`Texture "${preset.name}" applicata a ${selectedCubeRef.current.name}`);
      } else {
        log('WARN', 'Nessun cubo selezionato!');
        setStatus('\u26A0\uFE0F Seleziona un cubo prima di cambiare la texture!');
      }
    },
    [scene],
  );

  // ========== STEP 5: Remove Selected Cube ==========
  const removeSelectedCube = useCallback(() => {
    const cube = selectedCubeRef.current;
    if (!cube || cube.name === 'cube_demo') {
      log('WARN', 'Nessun cubo selezionato da rimuovere');
      setStatus('Seleziona un cubo prima di rimuoverlo');
      return;
    }
    const cubeName = cube.name;
    cube.dispose();
    cubesRef.current = cubesRef.current.filter(c => c !== cube);
    selectCube(null);
    setObjectsPlaced(prev => Math.max(0, prev - 1));
    log('INFO', `Rimosso cubo: ${cubeName}`);
    setStatus(`Cubo "${cubeName}" rimosso.`);
  }, [selectCube]);

  // ========== RENDER ==========
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.sceneContainer}>
        <EngineView
          style={styles.engineView}
          camera={camera}
          displayFrameRate={true}
          antiAliasing={2}
        />

        {/* Status bar */}
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
                      : trackingState === WebXRTrackingState.NOT_TRACKING
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
            {'📐 Superficie: '}{surfaceDetected ? '✅ Rilevata' : '⏳ Ricerca...'}{' | 📦 Cubi: '}{cubesRef.current.length}{' (+'}{objectsPlaced}{' piazzati)'}
          </Text>
          <Text style={styles.infoText}>
            {'🎯 Selezionato: '}{selectedCube?.name || 'Nessuno'}{' | Modo: '}{interactionMode}
          </Text>
          <Text style={styles.infoText}>
            {'📱 '}{Platform.OS === 'android' ? 'ARCore' : 'ARKit'}{' | BabylonJS 6.14.0'}
          </Text>
        </View>

        {/* Main controls: AR left, Switch center, Rimuovi right */}
        <View style={styles.controls}>
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
                ? 'Caricamento...'
                : xrSession
                  ? 'Ferma AR'
                  : 'Avvia AR'}
            </Text>
          </TouchableOpacity>

          <View style={styles.modeToggleContainer}>
            <Text style={[styles.modeLabel, interactionMode === 'SELEZIONE' && styles.modeLabelActive]}>
              {'SEL'}
            </Text>
            <Switch
              value={interactionMode === 'CREAZIONE'}
              onValueChange={(isCreazione) => {
                const newMode = isCreazione ? 'CREAZIONE' : 'SELEZIONE';
                setInteractionMode(newMode);
                interactionModeRef.current = newMode;
                log('INFO', `Modalità cambiata: ${newMode}`);
                setStatus(newMode === 'CREAZIONE' ? 'Modalità CREAZIONE: tocca per piazzare cubi' : 'Modalità SELEZIONE: tocca un cubo per selezionarlo');
              }}
              trackColor={{false: '#9C27B0', true: '#4CAF50'}}
              thumbColor={interactionMode === 'CREAZIONE' ? '#8BC34A' : '#CE93D8'}
            />
            <Text style={[styles.modeLabel, interactionMode === 'CREAZIONE' && styles.modeLabelActive]}>
              {'CREA'}
            </Text>
          </View>

          {selectedCube && selectedCube.name !== 'cube_demo' ? (
            <TouchableOpacity style={styles.clearButton} onPress={removeSelectedCube}>
              <Text style={styles.clearButtonText}>Rimuovi</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.clearButtonPlaceholder} />
          )}
        </View>

        {/* Texture selector */}
        <View style={styles.textureBar}>
          <Text style={styles.textureLabelText}>
            Texture{selectedCube ? ` (${selectedCube.name})` : ' (nessuno)'}:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TEXTURE_PRESETS.map((preset, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.textureButton,
                  {
                    backgroundColor: `rgb(${Math.floor(preset.color.r * 255)},${Math.floor(preset.color.g * 255)},${Math.floor(preset.color.b * 255)})`,
                    borderWidth: selectedTexture === idx ? 3 : 1,
                    borderColor: selectedTexture === idx ? '#ffffff' : '#666666',
                    opacity: !selectedCube ? 0.4 : preset.alpha < 1 ? 0.6 : 1,
                  },
                ]}
                onPress={() => changeTexture(idx)}
                disabled={!selectedCube}>
                <Text style={styles.textureButtonText}>{preset.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Manipulation panel */}
        {showManipulator && selectedCube && (
          <View style={styles.manipulatorPanel}>
            {/* Row 1: property selector buttons */}
            {!manipProperty && (
              <View style={styles.manipBtnRow}>
                {[
                  {key: 'scala', label: 'Scala'},
                  {key: 'rotX', label: 'Rot X'},
                  {key: 'rotY', label: 'Rot Y'},
                ].map(item => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.manipPropBtn}
                    onPress={() => setManipProperty(item.key)}>
                    <Text style={styles.manipPropBtnText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.deselectBtn} onPress={() => selectCube(null)}>
                  <Text style={styles.deselectBtnText}>{'✖'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Row when a property IS selected: show - / label / + / ✖ */}
            {manipProperty && (
              <View style={styles.manipActiveRow}>
                <TouchableOpacity
                  style={styles.manipStepBtn}
                  onPress={() => manipStep(manipProperty, -1)}>
                  <Text style={styles.manipStepBtnText}>{' − '}</Text>
                </TouchableOpacity>
                <Text style={styles.manipActiveLabel}>
                  {manipProperty === 'scala'
                    ? `Scala ${((selectedCube?.scaling?.x || 1) * 100).toFixed(0)}%`
                    : manipProperty === 'rotX'
                      ? `Rot X ${(((selectedCube?.rotation?.x || 0) * 180) / Math.PI).toFixed(0)}°`
                      : `Rot Y ${(((selectedCube?.rotation?.y || 0) * 180) / Math.PI).toFixed(0)}°`}
                </Text>
                <TouchableOpacity
                  style={styles.manipStepBtn}
                  onPress={() => manipStep(manipProperty, 1)}>
                  <Text style={styles.manipStepBtnText}>{' + '}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deselectBtn}
                  onPress={() => setManipProperty(null)}>
                  <Text style={styles.deselectBtnText}>{'✖'}</Text>
                </TouchableOpacity>
              </View>
            )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 5,
    minWidth: 100,
    alignItems: 'center',
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  clearButton: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 25,
    gap: 4,
  },
  modeLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  modeLabelActive: {
    color: '#fff',
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
    fontSize: 11,
    marginRight: 6,
    fontWeight: 'bold',
    maxWidth: 110,
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
  clearButtonPlaceholder: {
    minWidth: 100,
  },
  manipulatorPanel: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,30,0.85)',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3388ff',
  },
  manipBtnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  manipPropBtn: {
    backgroundColor: '#335599',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  manipPropBtnText: {
    color: '#aaccff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  manipActiveRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  manipStepBtn: {
    backgroundColor: '#335599',
    width: 50,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manipStepBtnText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  manipActiveLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 110,
    textAlign: 'center',
  },
  deselectBtn: {
    backgroundColor: '#883333',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deselectBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

});

export default App;