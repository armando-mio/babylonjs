import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  FlatList,
  ActivityIndicator,
  Dimensions,
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
  ShadowGenerator,
  SceneLoader,
  Ray,
} from '@babylonjs/core';
import '@babylonjs/loaders';
import {AR_MODELS, ModelData} from './modelsData';

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

// ================= CONSTANTS =================
const GROUND_Y = -1.3;
const SELECTION_EMISSIVE = new Color3(0.3, 0.6, 1);
const TARGET_MODEL_SIZE = 1.0; // normalize all models to ~1m
const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

// ================= APP SCREENS =================
type AppScreen = 'gallery' | 'viewer';
type ViewerMode = 'AR' | 'VR';

// ================= APP =================
const App = () => {
  const engine = useEngine();

  // Navigation state
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('gallery');
  const [selectedModel, setSelectedModel] = useState<ModelData | null>(null);
  const [viewerMode, setViewerMode] = useState<ViewerMode>('AR');

  // 3D state
  const [camera, setCamera] = useState<Camera>();
  const [scene, setScene] = useState<Scene>();
  const [rootNode, setRootNode] = useState<TransformNode>();
  const [xrSession, setXrSession] = useState<WebXRSessionManager>();
  const [trackingState, setTrackingState] = useState<WebXRTrackingState>();
  const [status, setStatus] = useState('Inizializzazione motore 3D...');
  const [surfaceDetected, setSurfaceDetected] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);

  // Interaction state
  const [selectedInstance, setSelectedInstance] = useState<AbstractMesh | null>(null);
  const [objectsPlaced, setObjectsPlaced] = useState(0);

  // Manipulation state
  const [showManipulator, setShowManipulator] = useState(false);
  const [manipProperty, setManipProperty] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  // Texture / Material state
  const [showTexturePanel, setShowTexturePanel] = useState(false);
  const [meshListForTexture, setMeshListForTexture] = useState<{name: string; mesh: AbstractMesh}[]>([]);
  const [selectedMeshIdx, setSelectedMeshIdx] = useState<number>(0);

  // Refs
  const xrRef = useRef<any>(null);
  const selectedInstanceRef = useRef<AbstractMesh | null>(null);
  const placedInstancesRef = useRef<TransformNode[]>([]);
  const lastHitPosRef = useRef<Vector3 | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const rootNodeRef = useRef<TransformNode | null>(null);
  const trackingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackingRef = useRef<WebXRTrackingState | null>(null);
  const surfaceDetectedRef = useRef(false);
  const hitTestMarkerRef = useRef<Mesh | null>(null);
  const groundPlaneRef = useRef<Mesh | null>(null);
  const shadowGenRef = useRef<ShadowGenerator | null>(null);
  const loadedMeshesRef = useRef<AbstractMesh[]>([]);
  const dirLightRef = useRef<DirectionalLight | null>(null);
  const modelRootRef = useRef<TransformNode | null>(null);

  // ========== SELECT / DESELECT INSTANCE ==========
  const selectInstance = useCallback((node: TransformNode | null) => {
    // Reset emissive on previous
    if (selectedInstanceRef.current) {
      selectedInstanceRef.current.getChildMeshes().forEach(m => {
        const mat = m.material as StandardMaterial | null;
        if (mat && mat.emissiveColor) mat.emissiveColor = Color3.Black();
      });
    }
    selectedInstanceRef.current = node as any;
    setSelectedInstance(node as any);
    if (node) {
      node.getChildMeshes().forEach(m => {
        const mat = m.material as StandardMaterial | null;
        if (mat && mat.emissiveColor) mat.emissiveColor = SELECTION_EMISSIVE.clone();
      });
      setShowManipulator(true);
      log('INFO', `Selezionato: ${node.name}`);
    } else {
      setShowManipulator(false);
      setManipProperty(null);
    }
  }, []);

  // ========== PLACE MODEL COPY AT POSITION ==========
  const placeModelAt = useCallback(async (position: Vector3, scn: Scene, model: ModelData) => {
    const instName = `placed_${Date.now()}`;
    log('INFO', `Piazzamento ${model.name} a (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
    try {
      const instRoot = new TransformNode(instName, scn);
      instRoot.position = position.clone();

      const result = await SceneLoader.ImportMeshAsync('', 'app:///', model.fileName, scn);
      result.meshes.forEach(mesh => {
        if (mesh.name === '__root__') mesh.parent = instRoot;
        mesh.isPickable = true;
        if (shadowGenRef.current && mesh instanceof Mesh) {
          shadowGenRef.current.addShadowCaster(mesh);
        }
      });

      // Normalize placed instance scale
      let pMin = new Vector3(Infinity, Infinity, Infinity);
      let pMax = new Vector3(-Infinity, -Infinity, -Infinity);
      result.meshes.forEach(mesh => {
        mesh.computeWorldMatrix(true);
        const bi = mesh.getBoundingInfo();
        if (bi) {
          pMin = Vector3.Minimize(pMin, bi.boundingBox.minimumWorld);
          pMax = Vector3.Maximize(pMax, bi.boundingBox.maximumWorld);
        }
      });
      const pSize = pMax.subtract(pMin);
      const pMaxDim = Math.max(pSize.x, pSize.y, pSize.z, 0.001);
      const pNormScale = TARGET_MODEL_SIZE / pMaxDim;
      instRoot.scaling = new Vector3(pNormScale, pNormScale, pNormScale);

      placedInstancesRef.current.push(instRoot);
      setObjectsPlaced(prev => prev + 1);
      selectInstance(instRoot);
      setStatus(`${model.name} piazzato!`);
      log('INFO', `Piazzato: ${instName}`);
    } catch (err: any) {
      log('ERROR', `Errore piazzamento: ${err.message}`);
    }
  }, [selectInstance]);

  // ========== REMOVE SELECTED INSTANCE ==========
  const removeSelectedInstance = useCallback(() => {
    const inst = selectedInstanceRef.current;
    if (!inst) return;
    const name = inst.name;
    // Dispose all child meshes, then the node
    if ('getChildMeshes' in inst) {
      (inst as TransformNode).getChildMeshes().forEach(m => m.dispose());
    }
    inst.dispose();
    placedInstancesRef.current = placedInstancesRef.current.filter(n => n !== inst);
    selectInstance(null);
    setObjectsPlaced(prev => Math.max(0, prev - 1));
    log('INFO', `Rimosso: ${name}`);
    setStatus(`Oggetto rimosso.`);
  }, [selectInstance]);

  // ========== MANIPULATE MODEL: +/- step ==========
  const manipStep = useCallback((prop: string, direction: 1 | -1) => {
    // Manipulate selected placed instance, or fall back to preview model root
    const root = selectedInstanceRef.current || modelRootRef.current;
    if (!root) return;
    if (prop === 'scala') {
      const cur = root.scaling.x;
      const next = Math.min(5, Math.max(0.05, cur + direction * 0.1));
      root.scaling = new Vector3(next, next, next);
      log('INFO', `Scala: ${(next * 100).toFixed(0)}%`);
    } else if (prop === 'rotX') {
      root.rotation.x += direction * (15 * Math.PI / 180);
      log('INFO', `Rot X: ${((root.rotation.x * 180) / Math.PI).toFixed(0)}deg`);
    } else if (prop === 'rotY') {
      root.rotation.y += direction * (15 * Math.PI / 180);
      log('INFO', `Rot Y: ${((root.rotation.y * 180) / Math.PI).toFixed(0)}deg`);
    } else if (prop === 'posY') {
      root.position.y += direction * 0.05;
      log('INFO', `Pos Y: ${root.position.y.toFixed(2)}m`);
    }
    forceRender(n => n + 1);
  }, []);

  // ========== TEXTURE / MATERIAL PRESETS ==========
  const TEXTURE_PRESETS = [
    {label: 'Originale', color: null, metallic: null, roughness: null},
    {label: 'Rosso', color: new Color3(0.8, 0.1, 0.1), metallic: 0.1, roughness: 0.7},
    {label: 'Blu', color: new Color3(0.1, 0.2, 0.9), metallic: 0.1, roughness: 0.7},
    {label: 'Verde', color: new Color3(0.1, 0.7, 0.2), metallic: 0.1, roughness: 0.7},
    {label: 'Oro', color: new Color3(0.85, 0.65, 0.13), metallic: 0.9, roughness: 0.3},
    {label: 'Argento', color: new Color3(0.75, 0.75, 0.78), metallic: 0.95, roughness: 0.2},
    {label: 'Legno', color: new Color3(0.55, 0.35, 0.17), metallic: 0.0, roughness: 0.9},
    {label: 'Bianco', color: new Color3(0.95, 0.95, 0.95), metallic: 0.0, roughness: 0.5},
    {label: 'Nero', color: new Color3(0.05, 0.05, 0.05), metallic: 0.3, roughness: 0.5},
  ];

  const originalMaterialsRef = useRef<Map<string, {diffuse?: Color3; emissive?: Color3}>>(new Map());

  const refreshMeshList = useCallback((target?: TransformNode | null) => {
    const root = target || selectedInstanceRef.current || modelRootRef.current;
    if (!root) {
      setMeshListForTexture([]);
      return;
    }
    const meshes = root.getChildMeshes().filter(m => m.material && m.name !== '__root__' && m.name !== 'shadowGround' && m.name !== 'hitTestMarker' && m.name !== 'arGrid');
    const list = meshes.map((m, i) => ({name: m.name || `mesh_${i}`, mesh: m}));
    setMeshListForTexture(list);
    setSelectedMeshIdx(0);
  }, []);

  const applyMaterialPreset = useCallback((presetIdx: number) => {
    if (meshListForTexture.length === 0) return;
    const entry = meshListForTexture[selectedMeshIdx];
    if (!entry) return;
    const mesh = entry.mesh;
    const mat = mesh.material as StandardMaterial | null;
    if (!mat) return;
    const preset = TEXTURE_PRESETS[presetIdx];

    // Save original if not saved
    if (!originalMaterialsRef.current.has(mesh.uniqueId.toString())) {
      originalMaterialsRef.current.set(mesh.uniqueId.toString(), {
        diffuse: mat.diffuseColor?.clone(),
        emissive: mat.emissiveColor?.clone(),
      });
    }

    if (preset.color === null) {
      // Restore original
      const orig = originalMaterialsRef.current.get(mesh.uniqueId.toString());
      if (orig) {
        if (orig.diffuse) mat.diffuseColor = orig.diffuse.clone();
        if (orig.emissive) mat.emissiveColor = orig.emissive.clone();
      }
      log('INFO', `Texture ripristinata su ${mesh.name}`);
    } else {
      mat.diffuseColor = preset.color.clone();
      log('INFO', `Texture '${preset.label}' applicata a ${mesh.name}`);
    }
    forceRender(n => n + 1);
  }, [meshListForTexture, selectedMeshIdx]);

  // ========== LOAD GLB MODEL ==========
  const loadModel = useCallback(async (model: ModelData, scn: Scene) => {
    if (!scn) return;
    setLoadingModel(true);
    setModelLoaded(false);
    setStatus(`Caricamento ${model.name}...`);
    log('INFO', `Caricamento modello: ${model.fileName}`);

    try {
      // Dispose previous loaded meshes
      loadedMeshesRef.current.forEach(m => {
        try { m.dispose(); } catch (e) {}
      });
      loadedMeshesRef.current = [];
      if (modelRootRef.current) {
        modelRootRef.current.dispose();
        modelRootRef.current = null;
      }

      // Create model root
      const modelRoot = new TransformNode('modelRoot', scn);
      modelRoot.position = new Vector3(0, GROUND_Y, 0);
      modelRootRef.current = modelRoot;

      // Load the GLB file
      const result = await SceneLoader.ImportMeshAsync(
        '',
        'app:///',
        model.fileName,
        scn,
      );

      log('INFO', `Modello caricato: ${result.meshes.length} meshes`);

      // Parent all meshes to model root, enable shadows
      result.meshes.forEach((mesh) => {
        if (mesh.name === '__root__') {
          mesh.parent = modelRoot;
        }
        mesh.isPickable = true;
        if (shadowGenRef.current && mesh instanceof Mesh) {
          shadowGenRef.current.addShadowCaster(mesh);
        }
        loadedMeshesRef.current.push(mesh);
      });

      // ===== NORMALIZE MODEL SCALE =====
      // Compute world bounding box of all loaded meshes
      let minVec = new Vector3(Infinity, Infinity, Infinity);
      let maxVec = new Vector3(-Infinity, -Infinity, -Infinity);
      result.meshes.forEach(mesh => {
        mesh.computeWorldMatrix(true);
        const bi = mesh.getBoundingInfo();
        if (bi) {
          const bMin = bi.boundingBox.minimumWorld;
          const bMax = bi.boundingBox.maximumWorld;
          minVec = Vector3.Minimize(minVec, bMin);
          maxVec = Vector3.Maximize(maxVec, bMax);
        }
      });
      const size = maxVec.subtract(minVec);
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const normScale = TARGET_MODEL_SIZE / maxDim;
      modelRoot.scaling = new Vector3(normScale, normScale, normScale);
      log('INFO', `Scala normalizzata: maxDim=${maxDim.toFixed(3)} → scale=${normScale.toFixed(3)}`);

      setModelLoaded(true);
      setLoadingModel(false);
      setShowManipulator(true);
      setStatus(`${model.name} caricato! Usa i controlli per manipolarlo.`);
      log('INFO', `Done: ${model.name} caricato con successo`);
    } catch (error: any) {
      log('ERROR', `Errore caricamento modello: ${error.message}`);
      setStatus(`Errore: ${error.message}`);
      setLoadingModel(false);
      Alert.alert('Errore', `Impossibile caricare ${model.name}: ${error.message}`);
    }
  }, []);

  // ========== INITIALIZE SCENE ==========
  useEffect(() => {
    if (!engine) {
      log('INFO', 'In attesa del motore BabylonJS...');
      return;
    }
    if (currentScreen !== 'viewer' || !selectedModel) return;

    log('INFO', `Motore BabylonJS inizializzato. Platform: ${Platform.OS}`);

    try {
      const newScene = new Scene(engine);
      newScene.clearColor = new Color4(0.1, 0.1, 0.15, 1);
      sceneRef.current = newScene;

      // Camera
      const cam = new ArcRotateCamera(
        'mainCamera',
        -Math.PI / 2,
        Math.PI / 3,
        3,
        new Vector3(0, 0, 0),
        newScene,
      );
      cam.minZ = 0.01;
      cam.wheelDeltaPercentage = 0.01;
      cam.pinchDeltaPercentage = 0.01;
      cam.lowerRadiusLimit = 0.5;
      cam.upperRadiusLimit = 20;
      setCamera(cam);
      log('INFO', 'Camera creata');

      // Hemispheric light (ambient)
      const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), newScene);
      hemiLight.intensity = 0.5;
      hemiLight.groundColor = new Color3(0.2, 0.2, 0.25);

      // Directional light (for shadows)
      const dirLight = new DirectionalLight('dirLight', new Vector3(-1, -3, -1.5), newScene);
      dirLight.intensity = 0.8;
      dirLight.position = new Vector3(3, 6, 3);
      dirLightRef.current = dirLight;
      log('INFO', 'Luci aggiunte alla scena');

      // Shadow generator
      const shadowGen = new ShadowGenerator(1024, dirLight);
      shadowGen.useBlurExponentialShadowMap = true;
      shadowGen.blurKernel = 32;
      shadowGen.darkness = 0.4;
      shadowGenRef.current = shadowGen;
      log('INFO', 'Shadow generator creato');

      // Root node
      const root = new TransformNode('ARRoot', newScene);
      setRootNode(root);
      rootNodeRef.current = root;

      // Shadow-receiving ground
      const shadowGround = MeshBuilder.CreateGround(
        'shadowGround',
        {width: 30, height: 30},
        newScene,
      );
      shadowGround.position.y = GROUND_Y;
      shadowGround.receiveShadows = true;
      const shadowGroundMat = new StandardMaterial('shadowGroundMat', newScene);
      shadowGroundMat.diffuseColor = new Color3(0.3, 0.3, 0.35);
      shadowGroundMat.specularColor = new Color3(0.1, 0.1, 0.1);
      shadowGround.material = shadowGroundMat;
      shadowGround.isPickable = false;

      // Hit-test reticle
      const reticle = MeshBuilder.CreateTorus(
        'hitTestMarker',
        {diameter: 0.20, thickness: 0.015, tessellation: 32},
        newScene,
      );
      const reticleMat = new StandardMaterial('hitTestMarkerMat', newScene);
      reticleMat.diffuseColor = new Color3(0, 1, 0);
      reticleMat.emissiveColor = new Color3(0, 1, 0);
      reticleMat.alpha = 0.9;
      reticleMat.backFaceCulling = false;
      reticle.material = reticleMat;
      reticle.isVisible = false;
      reticle.isPickable = false;
      hitTestMarkerRef.current = reticle;

      // ========== POINTER / TAP HANDLER (always SELEZIONE) ==========
      newScene.onPointerObservable.add(evtData => {
        if (evtData.type !== PointerEventTypes.POINTERTAP) return;

        // Ray-pick to select placed instances directly
        const pickResult = newScene.pick(newScene.pointerX, newScene.pointerY);
        if (pickResult?.hit && pickResult.pickedMesh) {
          // Walk up the parent chain to find the placed instance TransformNode
          let current: any = pickResult.pickedMesh;
          let foundInstance: TransformNode | null = null;
          while (current) {
            if (current instanceof TransformNode && current.name.startsWith('placed_')) {
              foundInstance = current;
              break;
            }
            current = current.parent;
          }
          if (foundInstance) {
            selectInstance(foundInstance);
          } else {
            // Maybe tapped the preview model root
            current = pickResult.pickedMesh;
            while (current) {
              if (current === modelRootRef.current) {
                selectInstance(null);
                setShowManipulator(true);
                break;
              }
              current = current.parent;
            }
            if (!foundInstance && current !== modelRootRef.current) {
              selectInstance(null);
            }
          }
        } else {
          selectInstance(null);
        }
      });

      setScene(newScene);
      setSceneReady(true);
      setStatus('Scena pronta. Caricamento modello...');
      log('INFO', 'Scena completamente inizializzata');

      // Load the selected model
      loadModel(selectedModel, newScene);
    } catch (error: any) {
      log('ERROR', `Errore inizializzazione scena: ${error.message}`);
      setStatus(`Errore: ${error.message}`);
    }
  }, [engine, currentScreen, selectedModel, loadModel, selectInstance, placeModelAt]);

  // ========== TOGGLE AR/VR ==========
  const toggleXR = useCallback(async () => {
    if (!scene || !rootNode) {
      log('WARN', 'Scena o rootNode non ancora pronto');
      return;
    }

    try {
      if (xrSession) {
        log('INFO', `Uscita dalla sessione ${viewerMode}...`);
        setStatus(`Chiusura ${viewerMode}...`);

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

        // Make shadow ground visible again for preview
        const sg = scene.getMeshByName('shadowGround');
        if (sg) {
          sg.isVisible = true;
          const mat = sg.material as StandardMaterial;
          if (mat) {
            mat.alpha = 1;
            mat.diffuseColor = new Color3(0.3, 0.3, 0.35);
          }
        }

        // Re-enable the preview model root
        if (modelRootRef.current) {
          modelRootRef.current.setEnabled(true);
        }

        await xrSession.exitXRAsync();
        log('INFO', `Sessione ${viewerMode} terminata`);
        setStatus(`${viewerMode} disattivata.`);
      } else {
        const mode = viewerMode;
        log('INFO', `--- AVVIO ${mode} ---`);
        setStatus(`Avvio ${mode} in corso...`);

        const xr = await scene.createDefaultXRExperienceAsync({
          disableDefaultUI: true,
          disableTeleportation: true,
        });
        xrRef.current = xr;
        log('INFO', 'XR Experience creata');

        const sessionMode = mode === 'AR' ? 'immersive-ar' : 'immersive-vr';
        const refSpace = mode === 'AR' ? 'unbounded' : 'local-floor';

        log('INFO', `enterXRAsync('${sessionMode}', '${refSpace}')...`);
        const session = await xr.baseExperience.enterXRAsync(
          sessionMode,
          refSpace,
          xr.renderTarget,
        );
        log('INFO', `Sessione ${mode} avviata`);

        if (mode === 'AR') {
          // In AR: make shadow ground semi-transparent (just receives shadows)
          const sg = scene.getMeshByName('shadowGround');
          if (sg) {
            const mat = sg.material as StandardMaterial;
            if (mat) {
              mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
              mat.alpha = 0.3;
            }
          }

          // Hide the preview model so only user-placed copies are visible
          if (modelRootRef.current) {
            modelRootRef.current.setEnabled(false);
          }

          // Wireframe ground grid for AR
          const grid = MeshBuilder.CreateGround(
            'arGrid',
            {width: 20, height: 20, subdivisions: 40},
            scene,
          );
          grid.position.y = GROUND_Y;
          const gridMat = new StandardMaterial('gridMat', scene);
          gridMat.diffuseColor = new Color3(0, 0.6, 0.6);
          gridMat.emissiveColor = new Color3(0, 0.15, 0.15);
          gridMat.alpha = 0.15;
          gridMat.wireframe = true;
          gridMat.backFaceCulling = false;
          grid.material = gridMat;
          grid.isPickable = false;
          groundPlaneRef.current = grid;
          surfaceDetectedRef.current = true;
          setSurfaceDetected(true);

          // Per-frame camera raycast to ground
          xr.baseExperience.sessionManager.onXRFrameObservable.add(() => {
            if (!hitTestMarkerRef.current) return;
            const cam = xr.baseExperience.camera;
            if (!cam) return;
            const camForward = cam.getDirection(Vector3.Forward());
            const camPos = cam.globalPosition.clone();
            if (Math.abs(camForward.y) > 0.001) {
              const t = (GROUND_Y - camPos.y) / camForward.y;
              if (t > 0.3 && t < 10) {
                const hitX = camPos.x + t * camForward.x;
                const hitZ = camPos.z + t * camForward.z;
                hitTestMarkerRef.current.isVisible = true;
                hitTestMarkerRef.current.position.set(hitX, GROUND_Y + 0.005, hitZ);
                lastHitPosRef.current = new Vector3(hitX, GROUND_Y, hitZ);
              }
            }
          });
        } else if (mode === 'VR') {
          // Hide the preview model so only user-placed copies are visible
          if (modelRootRef.current) {
            modelRootRef.current.setEnabled(false);
          }

          // Make ground semi-transparent in VR
          const sg = scene.getMeshByName('shadowGround');
          if (sg) {
            const mat = sg.material as StandardMaterial;
            if (mat) {
              mat.diffuseColor = new Color3(0.15, 0.15, 0.2);
              mat.alpha = 0.85;
            }
          }

          // VR grid for spatial reference
          const vrGrid = MeshBuilder.CreateGround(
            'arGrid',
            {width: 30, height: 30, subdivisions: 60},
            scene,
          );
          vrGrid.position.y = GROUND_Y;
          const vrGridMat = new StandardMaterial('vrGridMat', scene);
          vrGridMat.diffuseColor = new Color3(0.3, 0.3, 0.5);
          vrGridMat.emissiveColor = new Color3(0.05, 0.05, 0.15);
          vrGridMat.alpha = 0.25;
          vrGridMat.wireframe = true;
          vrGridMat.backFaceCulling = false;
          vrGrid.material = vrGridMat;
          vrGrid.isPickable = false;
          groundPlaneRef.current = vrGrid;
          surfaceDetectedRef.current = true;
          setSurfaceDetected(true);

          // Per-frame camera raycast to ground (same as AR) for reticle + placement
          xr.baseExperience.sessionManager.onXRFrameObservable.add(() => {
            if (!hitTestMarkerRef.current) return;
            const cam = xr.baseExperience.camera;
            if (!cam) return;
            const camForward = cam.getDirection(Vector3.Forward());
            const camPos = cam.globalPosition.clone();
            if (Math.abs(camForward.y) > 0.001) {
              const t = (GROUND_Y - camPos.y) / camForward.y;
              if (t > 0.3 && t < 10) {
                const hitX = camPos.x + t * camForward.x;
                const hitZ = camPos.z + t * camForward.z;
                hitTestMarkerRef.current.isVisible = true;
                hitTestMarkerRef.current.position.set(hitX, GROUND_Y + 0.005, hitZ);
                lastHitPosRef.current = new Vector3(hitX, GROUND_Y, hitZ);
              }
            }
          });
        }

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
          setStatus(`${mode} terminata.`);
        });

        // Tracking state
        const xrCam = xr.baseExperience.camera;
        xrCam.onTrackingStateChanged.add(newState => {
          if (newState === lastTrackingRef.current) return;
          if (trackingTimerRef.current) clearTimeout(trackingTimerRef.current);
          trackingTimerRef.current = setTimeout(() => {
            if (newState !== lastTrackingRef.current) {
              lastTrackingRef.current = newState;
              setTrackingState(newState);
            }
          }, 500);
        });

        setTimeout(() => {
          if (lastTrackingRef.current === null) {
            lastTrackingRef.current = WebXRTrackingState.TRACKING;
            setTrackingState(WebXRTrackingState.TRACKING);
          }
        }, 2000);

        setStatus(`${mode} ATTIVA! Usa i controlli per manipolare il modello.`);
        log('INFO', `=== ${mode} COMPLETAMENTE OPERATIVA ===`);
      }
    } catch (error: any) {
      log('ERROR', `Errore ${viewerMode}: ${error.message}\n${error.stack || ''}`);
      setStatus(`Errore ${viewerMode}: ${error.message}`);
      setXrSession(undefined);
      Alert.alert(
        `Errore ${viewerMode}`,
        `Impossibile avviare la sessione ${viewerMode}:\n${error.message}`,
      );
    }
  }, [scene, rootNode, xrSession, viewerMode]);


  // Auto-start XR when the scene and model are ready
  useEffect(() => {
    if (sceneReady && modelLoaded && !xrSession) {
      // small delay to let the scene settle
      const t = setTimeout(() => {
        if (!xrSession) {
          toggleXR().catch((e) => log('ERROR', `Auto-start XR failed: ${e?.message || e}`));
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [sceneReady, modelLoaded, xrSession, toggleXR]);

  // ========== BACK TO GALLERY ==========
  const goBackToGallery = useCallback(async () => {
    // Exit XR if active
    if (xrSession) {
      try {
        await xrSession.exitXRAsync();
      } catch (e) {}
    }

    // Dispose loaded meshes
    loadedMeshesRef.current.forEach(m => {
      try { m.dispose(); } catch (e) {}
    });
    loadedMeshesRef.current = [];
    if (modelRootRef.current) {
      try { modelRootRef.current.dispose(); } catch (e) {}
      modelRootRef.current = null;
    }

    // Dispose scene
    if (sceneRef.current) {
      try { sceneRef.current.dispose(); } catch (e) {}
      sceneRef.current = null;
    }

    // Reset state
    setScene(undefined);
    setCamera(undefined);
    setRootNode(undefined);
    setXrSession(undefined);
    setTrackingState(undefined);
    setSceneReady(false);
    setModelLoaded(false);
    setLoadingModel(false);
    setShowManipulator(false);
    setManipProperty(null);
    setSurfaceDetected(false);
    setSelectedInstance(null);
    selectedInstanceRef.current = null;
    setObjectsPlaced(0);
    placedInstancesRef.current.forEach(n => {
      try { n.getChildMeshes().forEach(m => m.dispose()); n.dispose(); } catch(e) {}
    });
    placedInstancesRef.current = [];
    xrRef.current = null;
    shadowGenRef.current = null;
    dirLightRef.current = null;
    groundPlaneRef.current = null;
    hitTestMarkerRef.current = null;

    setSelectedModel(null);
    setCurrentScreen('gallery');
    setStatus('Inizializzazione motore 3D...');
    log('INFO', 'Tornato alla galleria');
  }, [xrSession]);

  // ========== SELECT MODEL FROM GALLERY ==========
  const openModel = useCallback((model: ModelData, mode: ViewerMode) => {
    log('INFO', `Selezionato modello: ${model.name} (${mode})`);
    setLoadingModel(true); // show loading overlay immediately to avoid flash
    setSelectedModel(model);
    setViewerMode(mode);
    setCurrentScreen('viewer');
  }, []);

  // ========== CREATE AT CENTER (reticle position) ==========
  const createAtCenter = useCallback(() => {
    if (!sceneRef.current || !selectedModel) return;
    const hitPos = lastHitPosRef.current;
    if (hitPos && surfaceDetectedRef.current) {
      placeModelAt(hitPos, sceneRef.current, selectedModel);
    } else {
      log('WARN', 'Nessuna posizione reticle disponibile per il piazzamento');
      setStatus('Punta la camera verso il pavimento per piazzare!');
    }
  }, [selectedModel, placeModelAt]);

  // ========== GALLERY SCREEN ==========
  if (currentScreen === 'gallery') {
    return (
      <SafeAreaView style={styles.galleryContainer}>
        <View style={styles.galleryHeader}>
          <Text style={styles.galleryTitle}>Galleria Modelli 3D</Text>
          <Text style={styles.gallerySubtitle}>
            Scegli un modello e visualizzalo in AR o VR
          </Text>
        </View>

        <FlatList
          data={AR_MODELS}
          numColumns={2}
          contentContainerStyle={styles.galleryList}
          columnWrapperStyle={styles.galleryRow}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <View style={styles.modelCard}>
              <View style={styles.modelThumbnail}>
                <Text style={styles.modelEmoji}>{item.thumbnail}</Text>
              </View>
              <Text style={styles.modelName}>{item.name}</Text>
              <Text style={styles.modelDesc}>{item.description}</Text>
              <View style={styles.modelActions}>
                <TouchableOpacity
                  style={styles.arActionBtn}
                  onPress={() => openModel(item, 'AR')}>
                  <Text style={styles.actionBtnText}>AR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.vrActionBtn}
                  onPress={() => openModel(item, 'VR')}>
                  <Text style={styles.actionBtnText}>VR</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  // ========== VIEWER SCREEN ==========
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.sceneContainer}>
        <EngineView
          style={styles.engineView}
          camera={camera}
          displayFrameRate={true}
          antiAliasing={2}
        />

        {/* Loading overlay */}
        {loadingModel && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4FC3F7" />
            <Text style={styles.loadingText}>
              Caricamento {selectedModel?.name}...
            </Text>
          </View>
        )}

        {/* Status bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusRow}>
            <TouchableOpacity style={styles.backButton} onPress={goBackToGallery}>
              <Text style={styles.backButtonText}>Galleria</Text>
            </TouchableOpacity>
            <Text style={styles.modelTitle} numberOfLines={1}>
              {selectedModel?.name || ''}
            </Text>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>{viewerMode}</Text>
            </View>
          </View>
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

        {/* Info overlay (AR & VR) */}
        {xrSession && (
          <View style={styles.infoBar}>
            <Text style={styles.infoText}>
              {viewerMode === 'AR' ? `Superficie: ${surfaceDetected ? 'Rilevata' : 'Ricerca...'}` : 'VR'}{' | Piazzati: '}{objectsPlaced}
            </Text>
            <Text style={styles.infoText}>
              {'Selezionato: '}{selectedInstance?.name || 'Nessuno'}
            </Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[
              styles.xrButton,
              styles.xrButtonActive,
              (!sceneReady || loadingModel) && styles.xrButtonDisabled,
            ]}
            onPress={goBackToGallery}
            disabled={!sceneReady || loadingModel}>
            <Text style={styles.xrButtonText}>
              {!sceneReady || loadingModel ? '⏳' : '⬅️'}
            </Text>
          </TouchableOpacity>

          {/* Create button (place at reticle) */}
          {xrSession && (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={createAtCenter}>
              <Text style={styles.createBtnText}>{'➕'}</Text>
            </TouchableOpacity>
          )}

          {/* Rimuovi & Texture buttons */}
          {xrSession && selectedInstance && (
            <View style={styles.instanceActionsRow}>
              <TouchableOpacity style={styles.actionBtnEqual} onPress={removeSelectedInstance}>
                <Text style={styles.iconBtnText}>{'🗑️'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnEqual, styles.textureBtnBg]}
                onPress={() => {
                  refreshMeshList();
                  setShowTexturePanel(prev => !prev);
                }}>
                <Text style={styles.iconBtnText}>{'🎨'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Texture button when NO instance selected but model loaded */}
          {modelLoaded && !selectedInstance && (
            <TouchableOpacity
              style={[styles.actionBtnEqual, styles.textureBtnBg]}
              onPress={() => {
                refreshMeshList(modelRootRef.current);
                setShowTexturePanel(prev => !prev);
              }}>
              <Text style={styles.iconBtnText}>{'🎨'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Texture selection panel */}
        {showTexturePanel && meshListForTexture.length > 0 && (
          <View style={styles.texturePanel}>
            <View style={styles.texturePanelHeader}>
              <Text style={styles.texturePanelTitle}>Cambia Texture</Text>
              <TouchableOpacity onPress={() => setShowTexturePanel(false)}>
                <Text style={styles.texturePanelClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Mesh selector */}
            <View style={styles.meshSelectorRow}>
              <TouchableOpacity
                style={styles.meshNavBtn}
                onPress={() => setSelectedMeshIdx(prev => Math.max(0, prev - 1))}>
                <Text style={styles.meshNavBtnText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.meshNameText} numberOfLines={1}>
                {meshListForTexture[selectedMeshIdx]?.name || '?'}
              </Text>
              <Text style={styles.meshCountText}>
                {selectedMeshIdx + 1}/{meshListForTexture.length}
              </Text>
              <TouchableOpacity
                style={styles.meshNavBtn}
                onPress={() => setSelectedMeshIdx(prev => Math.min(meshListForTexture.length - 1, prev + 1))}>
                <Text style={styles.meshNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Presets grid */}
            <View style={styles.presetGrid}>
              {TEXTURE_PRESETS.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.presetBtn,
                    p.color ? {backgroundColor: `rgb(${Math.round(p.color.r*255)},${Math.round(p.color.g*255)},${Math.round(p.color.b*255)})`} : styles.presetOriginalBg,
                  ]}
                  onPress={() => applyMaterialPreset(i)}>
                  <Text style={[styles.presetBtnText, p.color && (p.color.r + p.color.g + p.color.b) > 1.5 ? {color: '#000'} : {}]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Manipulation panel */}
        {showManipulator && modelLoaded && (
          <View style={styles.manipulatorPanel}>
            {!manipProperty && (
              <View style={styles.manipBtnRow}>
                {[
                  {key: 'scala', label: 'Scala'},
                  {key: 'rotX', label: 'Rot X'},
                  {key: 'rotY', label: 'Rot Y'},
                  {key: 'posY', label: 'Alt Y'},
                ].map(item => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.manipPropBtn}
                    onPress={() => setManipProperty(item.key)}>
                    <Text style={styles.manipPropBtnText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {manipProperty && (
              <View style={styles.manipActiveRow}>
                <TouchableOpacity
                  style={styles.manipStepBtn}
                  onPress={() => manipStep(manipProperty, -1)}>
                  <Text style={styles.manipStepBtnText}>{' - '}</Text>
                </TouchableOpacity>
                <Text style={styles.manipActiveLabel}>
                  {(() => {
                    const t = selectedInstanceRef.current || modelRootRef.current;
                    if (manipProperty === 'scala')
                      return `Scala ${((t?.scaling?.x || 1) * 100).toFixed(0)}%`;
                    if (manipProperty === 'rotX')
                      return `Rot X ${(((t?.rotation?.x || 0) * 180) / Math.PI).toFixed(0)} deg`;
                    if (manipProperty === 'rotY')
                      return `Rot Y ${(((t?.rotation?.y || 0) * 180) / Math.PI).toFixed(0)} deg`;
                    return `Alt Y ${(t?.position?.y || 0).toFixed(2)}m`;
                  })()}
                </Text>
                <TouchableOpacity
                  style={styles.manipStepBtn}
                  onPress={() => manipStep(manipProperty, 1)}>
                  <Text style={styles.manipStepBtnText}>{' + '}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deselectBtn}
                  onPress={() => setManipProperty(null)}>
                  <Text style={styles.deselectBtnText}>{'X'}</Text>
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
  // Gallery styles
  galleryContainer: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  galleryHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  galleryTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#f0f6fc',
    marginBottom: 4,
  },
  gallerySubtitle: {
    fontSize: 14,
    color: '#8b949e',
  },
  galleryList: {
    padding: 12,
  },
  galleryRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modelCard: {
    width: CARD_WIDTH,
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  modelThumbnail: {
    width: '100%',
    height: 80,
    backgroundColor: '#21262d',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  modelEmoji: {
    fontSize: 40,
  },
  modelName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#f0f6fc',
    marginBottom: 2,
  },
  modelDesc: {
    fontSize: 11,
    color: '#8b949e',
    marginBottom: 8,
  },
  modelActions: {
    flexDirection: 'row',
    gap: 6,
  },
  arActionBtn: {
    flex: 1,
    backgroundColor: '#238636',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  vrActionBtn: {
    flex: 1,
    backgroundColor: '#1f6feb',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Viewer styles
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingText: {
    color: '#4FC3F7',
    fontSize: 16,
    marginTop: 12,
    fontWeight: 'bold',
  },
  statusBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 10,
    borderRadius: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  backButton: {
    backgroundColor: '#30363d',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 8,
  },
  backButtonText: {
    color: '#58a6ff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modelTitle: {
    flex: 1,
    color: '#f0f6fc',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modeBadge: {
    backgroundColor: '#238636',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  modeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
  },
  trackingText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  controls: {
    position: 'absolute',
    bottom: 70,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xrButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 5,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xrButtonInactive: {
    backgroundColor: '#2196F3',
  },
  xrButtonActive: {
    backgroundColor: '#f44336',
  },
  xrButtonDisabled: {
    backgroundColor: '#555555',
    opacity: 0.6,
  },
  xrButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBar: {
    position: 'absolute',
    top: 110,
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
  createBtn: {
    backgroundColor: '#4CAF50',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  createBtnText: {
    fontSize: 22,
  },
  instanceActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnEqual: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 90,
    alignItems: 'center',
  },
  actionBtnEqualText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  iconBtnText: {
    fontSize: 20,
  },
  textureBtnBg: {
    backgroundColor: '#7B1FA2',
  },
  texturePanel: {
    position: 'absolute',
    bottom: 130,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(10,0,30,0.92)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7B1FA2',
  },
  texturePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  texturePanelTitle: {
    color: '#CE93D8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  texturePanelClose: {
    color: '#CE93D8',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  meshSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(123,31,162,0.25)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  meshNavBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  meshNavBtnText: {
    color: '#CE93D8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  meshNameText: {
    flex: 1,
    color: '#f0f6fc',
    fontSize: 12,
    textAlign: 'center',
  },
  meshCountText: {
    color: '#8b949e',
    fontSize: 11,
    marginRight: 4,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  presetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    minWidth: 68,
    alignItems: 'center',
  },
  presetOriginalBg: {
    backgroundColor: '#30363d',
  },
  presetBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
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
    minWidth: 120,
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
