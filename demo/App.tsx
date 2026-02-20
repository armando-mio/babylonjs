import React, {useState, useEffect, useCallback, useRef} from 'react';
import {Alert, BackHandler} from 'react-native';
import {useEngine} from '@babylonjs/react-native';
import {
  Scene,
  Vector3,
  Color3,
  Color4,
  Camera,
  ArcRotateCamera,
  TransformNode,
  WebXRSessionManager,
  WebXRTrackingState,
  AbstractMesh,
  PointerEventTypes,
  Mesh,
  ShadowGenerator,
  SceneLoader,
  StandardMaterial,
  MeshBuilder,
  Ray,
  WebXRFeatureName,
  WebXRHitTest,
  DirectionalLight,
  HemisphericLight,
  RawTexture,
  Texture,
  PBRMaterial,
} from '@babylonjs/core';
import '@babylonjs/loaders';
import {gyroscope, setUpdateIntervalForType, SensorTypes} from 'react-native-sensors';
import {AR_MODELS, ModelData} from './modelsData';

// ===== Refactored modules =====
import {log} from './src/logger';
import {
  GROUND_Y,
  SELECTION_EMISSIVE,
  TARGET_MODEL_SIZE,
  SUN_SPHERE_DISTANCE,
  getSunPosition,
  TEXTURE_PRESETS,
  MATERIAL_PRESETS,
} from './src/constants';
import {AppScreen, ViewerMode, MeshListEntry} from './src/types';
import {useGPS} from './src/hooks/useGPS';
import {useCompass} from './src/hooks/useCompass';
import {createVRWorld} from './src/scene/vrWorld';
import {createSunSphere} from './src/scene/sunSphere';
import {setupPlaneDetection, PlaneDetectionResult} from './src/scene/planeDetection';
import {configureARRendering, configureVRRendering, resetRendering} from './src/scene/occlusion';
import {GalleryScreen} from './src/components/GalleryScreen';
import {ViewerUI} from './src/components/ViewerUI';
import {RoomScanScreen} from './src/components/RoomScanScreen';

// ================= APP =================
const App = () => {
  const engine = useEngine();

  // Hooks
  const {deviceLatRef, deviceLonRef} = useGPS();
  const {compassHeading} = useCompass();

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
  const [canPlaceOnSurface, setCanPlaceOnSurface] = useState(false);

  // Manipulation state
  const [showManipulator, setShowManipulator] = useState(false);
  const [manipProperty, setManipProperty] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  // Texture / Material state
  const [showTexturePanel, setShowTexturePanel] = useState(false);
  const [meshListForTexture, setMeshListForTexture] = useState<MeshListEntry[]>([]);
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
  const planeDetectionRef = useRef<PlaneDetectionResult | null>(null);
  const reticleTargetPosRef = useRef<Vector3 | null>(null);
  // Stores per-placed-instance WebXR anchor (null = no anchor yet for that instance)
  const placedAnchorsRef = useRef<Map<TransformNode, any>>(new Map());
  const anchorSystemRef = useRef<any>(null);
  const compassRootRef = useRef<TransformNode | null>(null);
  const sunSphereRef = useRef<Mesh | null>(null);
  const vrActiveRef = useRef(false);
  const vrBeforeRenderRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);
  const vrFrozenRef = useRef(false);
  const [vrFrozen, setVrFrozen] = useState(false);
  const navigatingBackRef = useRef(false);
  const disposingRef = useRef(false);
  const cleanupDoneRef = useRef(false);
  const xrFrameObserverRef = useRef<any>(null);
  const xrHitTestObserverRef = useRef<any>(null);
  const xrTrackingObserverRef = useRef<any>(null);
  const xrStartingRef = useRef(false);
  const placingRef = useRef(false);
  const arFloorYRef = useRef<number>(0);
  const canPlaceOnSurfaceRef = useRef(false);
  const originalMaterialsRef = useRef<Map<string, {
    // StandardMaterial props
    diffuse?: Color3;
    emissive?: Color3;
    specular?: Color3;
    diffuseTexture?: any;
    // PBRMaterial props
    albedoColor?: Color3;
    albedoTexture?: any;
    emissiveColorPBR?: Color3;
    metallic?: number;
    roughness?: number;
    // Shared
    alpha?: number;
    backFaceCulling?: boolean;
  }>>(new Map());

  // Tab state for texture/material panel
  const [textureTab, setTextureTab] = useState<'texture' | 'material'>('texture');

  // ========== SELECT / DESELECT INSTANCE ==========
  const selectInstance = useCallback((node: TransformNode | null) => {
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
      // Chiude anche texture se deseleziono
      setShowTexturePanel(false); 
    }
  }, []);

  // ========== PLACE MODEL COPY AT POSITION ==========
  const placeModelAt = useCallback(async (position: Vector3, scn: Scene, model: ModelData) => {
    // Guard: prevent concurrent placements and placement during disposal
    if (placingRef.current) {
      log('WARN', 'Piazzamento già in corso, ignorato');
      return;
    }
    if (disposingRef.current) {
      log('WARN', 'Disposal in corso, piazzamento ignorato');
      return;
    }
    if (scn.isDisposed) {
      log('WARN', 'Scena disposta, piazzamento ignorato');
      return;
    }
    placingRef.current = true;
    const instName = `placed_${Date.now()}`;
    log('INFO', `Piazzamento ${model.name} a (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
    try {
      const instRoot = new TransformNode(instName, scn);
      instRoot.position = Vector3.Zero();

      const result = await SceneLoader.ImportMeshAsync('', 'app:///', model.fileName, scn);
      result.meshes.forEach(mesh => {
        if (mesh.name === '__root__') mesh.parent = instRoot;
        mesh.isPickable = true;
        mesh.renderingGroupId = 1;
        if (shadowGenRef.current && mesh instanceof Mesh) {
          shadowGenRef.current.addShadowCaster(mesh);
          mesh.receiveShadows = true;
        }
      });

      // Normalize — skip meshes with no geometry (e.g. __root__) so bounding box is accurate
      let pMin = new Vector3(Infinity, Infinity, Infinity);
      let pMax = new Vector3(-Infinity, -Infinity, -Infinity);
      result.meshes.forEach(mesh => {
        if (mesh.getTotalVertices && mesh.getTotalVertices() === 0) return;
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

      // Position bottom on reticle — only consider meshes with actual geometry
      result.meshes.forEach(m => m.computeWorldMatrix(true));
      let scaledMin = new Vector3(Infinity, Infinity, Infinity);
      let scaledMax = new Vector3(-Infinity, -Infinity, -Infinity);
      result.meshes.forEach(mesh => {
        if (mesh.getTotalVertices && mesh.getTotalVertices() === 0) return;
        const bi = mesh.getBoundingInfo();
        if (bi) {
          scaledMin = Vector3.Minimize(scaledMin, bi.boundingBox.minimumWorld);
          scaledMax = Vector3.Maximize(scaledMax, bi.boundingBox.maximumWorld);
        }
      });

      const modelBottomY = scaledMin.y;
      const modelCenterX = (scaledMin.x + scaledMax.x) / 2;
      const modelCenterZ = (scaledMin.z + scaledMax.z) / 2;
      instRoot.position = new Vector3(
        position.x - modelCenterX,
        position.y - modelBottomY + 0.005, // +5mm above surface to prevent z-fighting with occluders
        position.z - modelCenterZ,
      );

      (instRoot as any)._baseScale = pNormScale;
      (instRoot as any)._modelName = model.name; // Store source model name for cross-model textures

      placedInstancesRef.current.push(instRoot);
      setObjectsPlaced(prev => prev + 1);
      selectInstance(instRoot);
      setStatus(`${model.name} piazzato!`);
      log('INFO', `Piazzato: ${instName} baseScale=${pNormScale.toFixed(4)}`);

      // Create an AR anchor at the placement position to stabilise the object
      // against tracking drift / re-localisation.
      if (anchorSystemRef.current) {
        try {
          const Quaternion = (await import('@babylonjs/core')).Quaternion;
          anchorSystemRef.current.addAnchorAtPositionAndRotationAsync(
            instRoot.position.clone(),
            Quaternion.Identity(),
          ).then((anchor: any) => {
            if (anchor) {
              placedAnchorsRef.current.set(instRoot, anchor);
              log('INFO', `AR: Anchor created for ${instName}`);
            }
          }).catch((ancErr: any) => {
            log('WARN', `AR: Anchor creation failed: ${ancErr?.message || ancErr}`);
          });
        } catch (ancErr: any) {
          log('WARN', `AR: Anchor not available: ${ancErr?.message || ancErr}`);
        }
      }
    } catch (err: any) {
      log('ERROR', `Errore piazzamento: ${err.message}`);
      setStatus(`Errore piazzamento: ${err.message}`);
    } finally {
      placingRef.current = false;
    }
  }, [selectInstance]);

  // ========== REMOVE SELECTED INSTANCE ==========
  const removeSelectedInstance = useCallback(() => {
    const inst = selectedInstanceRef.current;
    if (!inst) return;
    const name = inst.name;
    if ('getChildMeshes' in inst) {
      (inst as TransformNode).getChildMeshes().forEach(m => m.dispose());
    }
    inst.dispose();
    placedInstancesRef.current = placedInstancesRef.current.filter(n => n !== inst);
    // Remove the anchor attached to this instance
    try {
      const anchor = placedAnchorsRef.current.get(inst as TransformNode);
      if (anchor && anchorSystemRef.current) {
        anchorSystemRef.current.removeAnchor(anchor);
      }
    } catch (e) {}
    placedAnchorsRef.current.delete(inst as TransformNode);
    selectInstance(null);
    setObjectsPlaced(prev => Math.max(0, prev - 1));
    log('INFO', `Rimosso: ${name}`);
    setStatus('Oggetto rimosso.');
  }, [selectInstance]);

  // ========== MANIPULATE MODEL: +/- step ==========
  const manipStep = useCallback((prop: string, direction: 1 | -1) => {
    const root = selectedInstanceRef.current || modelRootRef.current;
    if (!root) return;
    if (prop === 'scala') {
      const baseScale = (root as any)._baseScale || 1;
      const cur = root.scaling.x;
      const step = baseScale * 0.1;
      const next = Math.max(baseScale * 0.05, cur + direction * step);
      root.scaling = new Vector3(next, next, next);
      const pct = ((next / baseScale) * 100).toFixed(0);
      log('INFO', `Scala: ${pct}%`);
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

  // ========== TEXTURE: Collect meshes from SELECTED instance (or all if none selected) ==========
  const refreshMeshList = useCallback((target?: TransformNode | null) => {
    const list: MeshListEntry[] = [];
    const excludeNames = new Set(['__root__', 'shadowGround', 'hitTestMarker', 'arGrid']);

    // Determine which instance to show meshes for:
    // Priority: explicit target → currently selected instance → all instances
    const activeTarget = target || selectedInstanceRef.current;

    if (activeTarget) {
      // Show only the selected/target instance's meshes
      const sourceName = (activeTarget as any)._modelName || activeTarget.name;
      const meshes = activeTarget.getChildMeshes().filter(
        m => m.material && !excludeNames.has(m.name),
      );
      meshes.forEach((m, i) => {
        list.push({name: m.name || `mesh_${i}`, mesh: m, sourceName});
      });
    } else {
      // No selection — collect from all placed instances
      for (const inst of placedInstancesRef.current) {
        const sourceName = (inst as any)._modelName || inst.name;
        const meshes = inst.getChildMeshes().filter(
          m => m.material && !excludeNames.has(m.name),
        );
        meshes.forEach((m, i) => {
          list.push({name: m.name || `mesh_${i}`, mesh: m, sourceName});
        });
      }

      // Also include preview model root if it has meshes
      if (modelRootRef.current) {
        const sourceName = selectedModel?.name || 'Preview';
        const meshes = modelRootRef.current.getChildMeshes().filter(
          m => m.material && !excludeNames.has(m.name),
        );
        meshes.forEach((m, i) => {
          if (!list.some(e => e.mesh === m)) {
            list.push({name: m.name || `preview_${i}`, mesh: m, sourceName});
          }
        });
      }
    }

    setMeshListForTexture(list);
    setSelectedMeshIdx(0);
  }, [selectedModel]);

  // ========== MATERIAL HELPERS (supports both PBRMaterial and StandardMaterial) ==========
  const isPBR = useCallback((mat: any): mat is PBRMaterial => {
    return mat && (mat.getClassName() === 'PBRMaterial' || mat.getClassName() === 'PBRMetallicRoughnessMaterial' || 'albedoColor' in mat);
  }, []);

  // Save original material state for a mesh (called before first modification)
  const saveOriginalMaterial = useCallback((mesh: AbstractMesh) => {
    const key = mesh.uniqueId.toString();
    if (originalMaterialsRef.current.has(key)) return;
    const mat = mesh.material;
    if (!mat) return;
    if (isPBR(mat)) {
      originalMaterialsRef.current.set(key, {
        albedoColor: mat.albedoColor?.clone(),
        albedoTexture: mat.albedoTexture,
        emissiveColorPBR: mat.emissiveColor?.clone(),
        metallic: mat.metallic ?? undefined,
        roughness: mat.roughness ?? undefined,
        alpha: mat.alpha,
        backFaceCulling: mat.backFaceCulling,
      });
    } else {
      const std = mat as StandardMaterial;
      originalMaterialsRef.current.set(key, {
        diffuse: std.diffuseColor?.clone(),
        emissive: std.emissiveColor?.clone(),
        specular: std.specularColor?.clone(),
        diffuseTexture: std.diffuseTexture,
        alpha: std.alpha,
        backFaceCulling: std.backFaceCulling,
      });
    }
    log('INFO', `Salvato materiale originale per ${mesh.name} (${mat.getClassName()})`);
  }, [isPBR]);

  // Restore original material for a mesh
  const restoreOriginalMaterial = useCallback((mesh: AbstractMesh) => {
    const key = mesh.uniqueId.toString();
    const orig = originalMaterialsRef.current.get(key);
    const mat = mesh.material;
    if (!orig || !mat) return;
    if (isPBR(mat)) {
      if (orig.albedoColor) mat.albedoColor = orig.albedoColor.clone();
      mat.albedoTexture = orig.albedoTexture || null;
      if (orig.emissiveColorPBR) mat.emissiveColor = orig.emissiveColorPBR.clone();
      if (orig.metallic !== undefined) mat.metallic = orig.metallic;
      if (orig.roughness !== undefined) mat.roughness = orig.roughness;
      mat.alpha = orig.alpha ?? 1;
      mat.backFaceCulling = orig.backFaceCulling ?? true;
    } else {
      const std = mat as StandardMaterial;
      if (orig.diffuse) std.diffuseColor = orig.diffuse.clone();
      if (orig.emissive) std.emissiveColor = orig.emissive.clone();
      if (orig.specular) std.specularColor = orig.specular.clone();
      std.diffuseTexture = orig.diffuseTexture || null;
      std.alpha = orig.alpha ?? 1;
      std.backFaceCulling = orig.backFaceCulling ?? true;
      std.wireframe = false;
    }
  }, [isPBR]);

  // Create a procedural texture via RawTexture (works in React Native — no Canvas needed)
  const createProceduralTexture = useCallback((scn: Scene, pattern: string, c1: {r:number;g:number;b:number}, c2: {r:number;g:number;b:number}): RawTexture => {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    const r1 = Math.round(c1.r * 255), g1 = Math.round(c1.g * 255), b1 = Math.round(c1.b * 255);
    const r2 = Math.round(c2.r * 255), g2 = Math.round(c2.g * 255), b2 = Math.round(c2.b * 255);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        let r: number, g: number, b: number;

        if (pattern === 'checker') {
          const tileSize = size / 8;
          const isEven = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0;
          r = isEven ? r1 : r2;
          g = isEven ? g1 : g2;
          b = isEven ? b1 : b2;
        } else if (pattern === 'stripes') {
          const stripeH = size / 16;
          const isEven = Math.floor(y / stripeH) % 2 === 0;
          r = isEven ? r1 : r2;
          g = isEven ? g1 : g2;
          b = isEven ? b1 : b2;
        } else if (pattern === 'noise') {
          const t = Math.random();
          r = Math.round(r1 * (1 - t) + r2 * t);
          g = Math.round(g1 * (1 - t) + g2 * t);
          b = Math.round(b1 * (1 - t) + b2 * t);
        } else {
          r = r1; g = g1; b = b1;
        }
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    const tex = RawTexture.CreateRGBATexture(
      data, size, size, scn,
      false,  // generateMipMaps
      false,  // invertY
      Texture.BILINEAR_SAMPLINGMODE,
    );
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.hasAlpha = false;
    log('INFO', `RawTexture creata: pattern=${pattern} size=${size}`);
    return tex;
  }, []);

  // Apply a texture preset (procedural pattern) to the selected mesh
  const applyTexturePreset = useCallback((presetIdx: number) => {
    if (meshListForTexture.length === 0) return;
    const entry = meshListForTexture[selectedMeshIdx];
    if (!entry) return;
    const mesh = entry.mesh;
    const mat = mesh.material;
    if (!mat) return;
    const scn = sceneRef.current;
    if (!scn) return;
    const preset = TEXTURE_PRESETS[presetIdx];

    saveOriginalMaterial(mesh);

    if (preset.type === 'restore') {
      restoreOriginalMaterial(mesh);
      log('INFO', `Texture ripristinata su ${mesh.name}`);
    } else {
      const c1 = preset.color1 || {r: 0.5, g: 0.5, b: 0.5};
      const c2 = preset.color2 || {r: 0.3, g: 0.3, b: 0.3};
      const tex = createProceduralTexture(scn, preset.pattern, c1, c2);

      if (isPBR(mat)) {
        mat.albedoTexture = tex;
        mat.albedoColor = new Color3(1, 1, 1);
        log('INFO', `Texture '${preset.label}' (PBR) applicata a ${mesh.name}`);
      } else {
        const std = mat as StandardMaterial;
        std.diffuseTexture = tex;
        std.diffuseColor = new Color3(1, 1, 1);
        log('INFO', `Texture '${preset.label}' (Std) applicata a ${mesh.name}`);
      }
    }
    forceRender(n => n + 1);
  }, [meshListForTexture, selectedMeshIdx, saveOriginalMaterial, restoreOriginalMaterial, createProceduralTexture, isPBR]);

  // Apply a material preset (color/metallic/emissive/alpha) to the selected mesh
  const applyMaterialStylePreset = useCallback((presetIdx: number) => {
    if (meshListForTexture.length === 0) return;
    const entry = meshListForTexture[selectedMeshIdx];
    if (!entry) return;
    const mesh = entry.mesh;
    const mat = mesh.material;
    if (!mat) return;
    const preset = MATERIAL_PRESETS[presetIdx];

    saveOriginalMaterial(mesh);

    if (preset.type === 'restore') {
      restoreOriginalMaterial(mesh);
      log('INFO', `Materiale ripristinato su ${mesh.name}`);
    } else {
      if (isPBR(mat)) {
        // PBR material
        if (preset.diffuse) mat.albedoColor = new Color3(preset.diffuse.r, preset.diffuse.g, preset.diffuse.b);
        if (preset.emissive) mat.emissiveColor = new Color3(preset.emissive.r, preset.emissive.g, preset.emissive.b);
        if (preset.specular) {
          // High specular → low roughness, high metallic
          mat.metallic = (preset.specular.r + preset.specular.g + preset.specular.b) / 3;
          mat.roughness = 1 - mat.metallic;
        }
        if (preset.alpha !== undefined) mat.alpha = preset.alpha;
        if (preset.backFaceCulling !== undefined) mat.backFaceCulling = preset.backFaceCulling;
        // Remove albedo texture so color shows through
        mat.albedoTexture = null;
        log('INFO', `Materiale '${preset.label}' (PBR) applicato a ${mesh.name}`);
      } else {
        // StandardMaterial
        const std = mat as StandardMaterial;
        if (preset.diffuse) std.diffuseColor = new Color3(preset.diffuse.r, preset.diffuse.g, preset.diffuse.b);
        if (preset.specular) std.specularColor = new Color3(preset.specular.r, preset.specular.g, preset.specular.b);
        if (preset.emissive) std.emissiveColor = new Color3(preset.emissive.r, preset.emissive.g, preset.emissive.b);
        if (preset.alpha !== undefined) std.alpha = preset.alpha;
        if (preset.backFaceCulling !== undefined) std.backFaceCulling = preset.backFaceCulling;
        if (preset.wireframe !== undefined) std.wireframe = preset.wireframe;
        std.diffuseTexture = null;
        log('INFO', `Materiale '${preset.label}' (Std) applicato a ${mesh.name}`);
      }
    }
    forceRender(n => n + 1);
  }, [meshListForTexture, selectedMeshIdx, saveOriginalMaterial, restoreOriginalMaterial, isPBR]);

  // Legacy wrapper — kept for prop compatibility
  const applyMaterialPreset = useCallback((presetIdx: number) => {
    applyTexturePreset(presetIdx);
  }, [applyTexturePreset]);

  // ========== LOAD GLB MODEL ==========
  const loadModel = useCallback(async (model: ModelData, scn: Scene) => {
    if (!scn) return;
    setLoadingModel(true);
    setModelLoaded(false);
    setStatus(`Caricamento ${model.name}...`);
    log('INFO', `Caricamento modello: ${model.fileName}`);

    try {
      loadedMeshesRef.current.forEach(m => {
        try { m.dispose(); } catch (e) {}
      });
      loadedMeshesRef.current = [];
      if (modelRootRef.current) {
        modelRootRef.current.dispose();
        modelRootRef.current = null;
      }

      const modelRoot = new TransformNode('modelRoot', scn);
      modelRoot.position = new Vector3(0, GROUND_Y, 0);
      modelRootRef.current = modelRoot;

      const result = await SceneLoader.ImportMeshAsync('', 'app:///', model.fileName, scn);

      // Detailed model load report
      const totalMeshes = result.meshes.length;
      const skeletons = result.skeletons || [];
      const animGroups = result.animationGroups || [];
      let totalVertices = 0;
      let totalFaces = 0;
      let meshWithMaterial = 0;
      let meshWithoutMaterial = 0;
      const materialSet = new Set<string>();
      const textureSet = new Set<string>();

      result.meshes.forEach(mesh => {
        if (mesh.getTotalVertices) totalVertices += mesh.getTotalVertices();
        if (mesh.getTotalIndices) totalFaces += Math.floor(mesh.getTotalIndices() / 3);
        if (mesh.material) {
          meshWithMaterial++;
          materialSet.add(mesh.material.name || 'unnamed');
          const mat = mesh.material as any;
          if (mat.diffuseTexture?.name) textureSet.add(mat.diffuseTexture.name);
          if (mat.bumpTexture?.name) textureSet.add(mat.bumpTexture.name);
          if (mat.ambientTexture?.name) textureSet.add(mat.ambientTexture.name);
          if (mat.emissiveTexture?.name) textureSet.add(mat.emissiveTexture.name);
          if (mat.specularTexture?.name) textureSet.add(mat.specularTexture.name);
          if (mat.albedoTexture?.name) textureSet.add(mat.albedoTexture.name);
          if (mat.metallicTexture?.name) textureSet.add(mat.metallicTexture.name);
          if (mat.reflectivityTexture?.name) textureSet.add(mat.reflectivityTexture.name);
        } else {
          meshWithoutMaterial++;
        }
      });

      log('INFO', `========== MODEL LOAD REPORT ==========`);
      log('INFO', `File: ${model.fileName}`);
      log('INFO', `Meshes: ${totalMeshes} (${meshWithMaterial} con materiale, ${meshWithoutMaterial} senza)`);
      log('INFO', `Vertices: ${totalVertices.toLocaleString()} | Faces: ${totalFaces.toLocaleString()}`);
      log('INFO', `Materials: ${materialSet.size} → [${[...materialSet].slice(0, 10).join(', ')}]`);
      log('INFO', `Textures: ${textureSet.size} → [${[...textureSet].slice(0, 8).join(', ')}]`);
      log('INFO', `Skeletons: ${skeletons.length} | AnimationGroups: ${animGroups.length}`);

      result.meshes.slice(0, 15).forEach((mesh, i) => {
        const verts = mesh.getTotalVertices ? mesh.getTotalVertices() : 0;
        const matName = mesh.material?.name || 'NONE';
        const pos = mesh.position;
        log('INFO', `  mesh[${i}] "${mesh.name}" verts=${verts} mat="${matName}" pos=(${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)})`);
      });
      if (totalMeshes > 15) log('INFO', `  ... e altri ${totalMeshes - 15} meshes`);
      log('INFO', `========================================`);

      result.meshes.forEach((mesh) => {
        if (mesh.name === '__root__') mesh.parent = modelRoot;
        mesh.isPickable = true;
        mesh.renderingGroupId = 1;
        if (shadowGenRef.current && mesh instanceof Mesh) {
          shadowGenRef.current.addShadowCaster(mesh);
          mesh.receiveShadows = true;
        }
        loadedMeshesRef.current.push(mesh);
      });

      // Normalize — skip meshes with no geometry (e.g. __root__) so bounding box is accurate
      let minVec = new Vector3(Infinity, Infinity, Infinity);
      let maxVec = new Vector3(-Infinity, -Infinity, -Infinity);
      result.meshes.forEach(mesh => {
        if (mesh.getTotalVertices && mesh.getTotalVertices() === 0) return;
        mesh.computeWorldMatrix(true);
        const bi = mesh.getBoundingInfo();
        if (bi) {
          minVec = Vector3.Minimize(minVec, bi.boundingBox.minimumWorld);
          maxVec = Vector3.Maximize(maxVec, bi.boundingBox.maximumWorld);
        }
      });
      const size = maxVec.subtract(minVec);
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const normScale = TARGET_MODEL_SIZE / maxDim;
      modelRoot.scaling = new Vector3(normScale, normScale, normScale);
      (modelRoot as any)._baseScale = normScale;
      (modelRoot as any)._modelName = model.name;
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

    log('INFO', `Motore BabylonJS inizializzato.`);

    try {
      const newScene = new Scene(engine);
      newScene.clearColor = new Color4(0.1, 0.1, 0.15, 1);
      // NOTE: Do NOT set setRenderingAutoClearDepthStencil(1, false) here.
      // That config is only needed for AR occlusion and is set when entering AR mode.
      // Setting it here would prevent VR world (renderingGroup 1) from rendering.
      sceneRef.current = newScene;

      // Camera
      const cam = new ArcRotateCamera('mainCamera', -Math.PI / 2, Math.PI / 3, 3, new Vector3(0, 0, 0), newScene);
      cam.minZ = 0.01;
      cam.wheelDeltaPercentage = 0.01;
      cam.pinchDeltaPercentage = 0.01;
      cam.lowerRadiusLimit = 0.5;
      cam.upperRadiusLimit = 20;
      setCamera(cam);

      // Lights
      const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), newScene);
      hemiLight.intensity = 0.5;
      hemiLight.groundColor = new Color3(0.2, 0.2, 0.25);

      const dirLight = new DirectionalLight('dirLight', new Vector3(-1, -3, -1.5), newScene);
      dirLight.intensity = 1.0;
      dirLight.position = new Vector3(5, 10, 5);
      dirLightRef.current = dirLight;

      // Shadow generator
      const shadowGen = new ShadowGenerator(2048, dirLight);
      shadowGen.useBlurExponentialShadowMap = true;
      shadowGen.blurKernel = 64;
      shadowGen.darkness = 0.6;
      shadowGen.bias = 0.001;
      shadowGen.normalBias = 0.02;
      shadowGen.depthScale = 50;
      shadowGen.frustumEdgeFalloff = 1.0;
      shadowGen.useKernelBlur = true;
      shadowGen.blurScale = 2;
      shadowGen.setDarkness(0.6);
      shadowGen.transparencyShadow = true;
      shadowGenRef.current = shadowGen;
      dirLight.shadowMinZ = 0.1;
      dirLight.shadowMaxZ = 40;
      dirLight.autoUpdateExtends = true;
      dirLight.autoCalcShadowZBounds = true;

      // Root node
      const root = new TransformNode('ARRoot', newScene);
      setRootNode(root);
      rootNodeRef.current = root;

      // Shadow ground
      const shadowGround = MeshBuilder.CreateGround('shadowGround', {width: 50, height: 50}, newScene);
      shadowGround.position.y = GROUND_Y;
      shadowGround.receiveShadows = true;
      const shadowGroundMat = new StandardMaterial('shadowGroundMat', newScene);
      shadowGroundMat.diffuseColor = new Color3(0.3, 0.3, 0.35);
      shadowGroundMat.specularColor = new Color3(0.1, 0.1, 0.1);
      shadowGroundMat.ambientColor = new Color3(0.2, 0.2, 0.2);
      shadowGround.material = shadowGroundMat;
      shadowGround.isPickable = false;
      shadowGround.renderingGroupId = 1;

      // Hit-test reticle — base diameter 0.20m, will be dynamically scaled by distance
      const reticle = MeshBuilder.CreateTorus('hitTestMarker', {diameter: 0.20, thickness: 0.015, tessellation: 32}, newScene);
      const reticleMat = new StandardMaterial('hitTestMarkerMat', newScene);
      reticleMat.diffuseColor = new Color3(0, 1, 0);
      reticleMat.emissiveColor = new Color3(0, 1, 0);
      reticleMat.alpha = 0.9;
      reticleMat.backFaceCulling = false;
      reticleMat.disableDepthWrite = true;
      reticle.material = reticleMat;
      reticle.isVisible = false;
      reticle.isPickable = false;
      reticle.renderingGroupId = 2;
      hitTestMarkerRef.current = reticle;
      reticleTargetPosRef.current = null;

      // Pointer / tap handler
      newScene.onPointerObservable.add(evtData => {
        if (disposingRef.current) return;
        if (evtData.type !== PointerEventTypes.POINTERTAP) return;
        try {
        const pickResult = newScene.pick(newScene.pointerX, newScene.pointerY);
        if (pickResult?.hit && pickResult.pickedMesh) {
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
        } catch (pickErr) {
          // Ignore pick errors during disposal
        }
      });

      setScene(newScene);
      setSceneReady(true);
      setStatus('Scena pronta. Caricamento modello...');
      log('INFO', 'Scena completamente inizializzata');

      loadModel(selectedModel, newScene);
    } catch (error: any) {
      log('ERROR', `Errore inizializzazione scena: ${error.message}`);
      setStatus(`Errore: ${error.message}`);
    }
  }, [engine, currentScreen, selectedModel, loadModel, selectInstance, placeModelAt]);

  // ========== TOGGLE AR/VR ==========
  const toggleXR = useCallback(async () => {
    if (disposingRef.current) return; // Don't start XR during cleanup
    if (!scene || !rootNode) {
      log('WARN', 'Scena o rootNode non ancora pronto');
      return;
    }

    try {
      // ===== EXITING =====
      if (xrSession || vrActiveRef.current) {
        log('INFO', `Uscita dalla sessione ${viewerMode}...`);
        setStatus(`Chiusura ${viewerMode}...`);

        if (hitTestMarkerRef.current) hitTestMarkerRef.current.isVisible = false;
        if (groundPlaneRef.current) {
          groundPlaneRef.current.dispose();
          groundPlaneRef.current = null;
        }

        // Clean up VR meshes
        if (scene) {
          scene.meshes.filter(m =>
            m.name.startsWith('vrMountain_') || m.name.startsWith('vrTrunk_') ||
            m.name.startsWith('vrCrown_') || m.name.startsWith('vrCloud_') ||
            m.name === 'vrSkyDome',
          ).forEach(m => m.dispose());
        }

        // Clean up plane detection
        if (planeDetectionRef.current) {
          planeDetectionRef.current.dispose();
          planeDetectionRef.current = null;
        }

        if (compassRootRef.current) {
          compassRootRef.current.getChildMeshes().forEach(m => m.dispose());
          compassRootRef.current.dispose();
          compassRootRef.current = null;
        }
        if (sunSphereRef.current) {
          sunSphereRef.current.dispose();
          sunSphereRef.current = null;
        }
        if (scene) {
          const sunGlow = scene.getMeshByName('sunGlow');
          if (sunGlow) sunGlow.dispose();
        }
        if (vrBeforeRenderRef.current && scene) {
          scene.onBeforeRenderObservable.remove(vrBeforeRenderRef.current);
          vrBeforeRenderRef.current = null;
        }

        lastHitPosRef.current = null;
        lastTrackingRef.current = null;
        arFloorYRef.current = Number.NaN;
        setSurfaceDetected(false);
        surfaceDetectedRef.current = false;
        if (trackingTimerRef.current) {
          clearTimeout(trackingTimerRef.current);
          trackingTimerRef.current = null;
        }

        // Restore shadow ground
        const sg = scene.getMeshByName('shadowGround');
        if (sg) {
          sg.isVisible = true;
          const mat = sg.material as StandardMaterial;
          if (mat) {
            mat.alpha = 1;
            mat.diffuseColor = new Color3(0.3, 0.3, 0.35);
            mat.disableDepthWrite = false;
          }
          sg.renderingGroupId = 1;
        }

        if (hitTestMarkerRef.current) {
          hitTestMarkerRef.current.renderingGroupId = 2;
        }

        if (modelRootRef.current) modelRootRef.current.setEnabled(true);
        scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

        // Restore default rendering group settings (all groups auto-clear)
        resetRendering(scene);

        if (gyroSubRef.current) {
          gyroSubRef.current.unsubscribe();
          gyroSubRef.current = null;
        }

        if (xrSession) await xrSession.exitXRAsync();

        // Dispose XR experience helper to fully clean up AR state.
        // Without this, the WebXR camera remains as scene.activeCamera and
        // subsequent VR entry gets a dead camera → black screen.
        if (xrRef.current) {
          try { xrRef.current.dispose(); } catch (e) {}
          xrRef.current = null;
        }

        // Explicitly restore the ArcRotateCamera as active camera.
        // After AR, scene.activeCamera may still point to the WebXR camera.
        const mainCam = scene.getCameraByName('mainCamera') as ArcRotateCamera;
        if (mainCam) {
          scene.activeCamera = mainCam;
          mainCam.attachControl();
          log('INFO', 'Camera ArcRotateCamera ripristinata dopo AR');
        }

        vrActiveRef.current = false;
        vrFrozenRef.current = false;
        setVrFrozen(false);
        canPlaceOnSurfaceRef.current = false;
        setCanPlaceOnSurface(false);
        setXrSession(undefined);
        log('INFO', `Sessione ${viewerMode} terminata`);
        setStatus(`${viewerMode} disattivata.`);
        return;
      }

      // ===== ENTERING =====
      if (xrStartingRef.current) {
        log('INFO', 'XR/VR già in fase di avvio, attendo...');
        return;
      }
      xrStartingRef.current = true;
      const mode = viewerMode;
      log('INFO', `--- AVVIO ${mode} ---`);
      setStatus(`Avvio ${mode} in corso...`);

      if (mode === 'VR') {
        // ===== VR MODE =====
        vrActiveRef.current = true;

        if (modelRootRef.current) modelRootRef.current.setEnabled(false);

        // Clean up any stale WebXR state from a previous AR session.
        // This is defensive — goBackToGallery should have cleaned up,
        // but if the scene was recreated while native XR was still active,
        // ensure there are no stale XR cameras or render targets.
        if (xrRef.current) {
          log('WARN', 'VR: rilevato stale XR ref — disposing');
          try { xrRef.current.dispose(); } catch (e) {}
          xrRef.current = null;
        }
        // Remove any stale WebXR cameras that might linger
        scene.cameras.forEach(cam => {
          if (cam.name && cam.name.toLowerCase().includes('webxr') && cam.name !== 'mainCamera') {
            log('INFO', `VR: rimozione camera stale: ${cam.name}`);
            try { cam.dispose(); } catch (e) {}
          }
        });

        // Explicitly get the ArcRotateCamera by name — scene.activeCamera may still
        // be a dead WebXR camera if AR was used previously.
        const vrCam = (scene.getCameraByName('mainCamera') || scene.activeCamera) as ArcRotateCamera;
        if (vrCam) {
          scene.activeCamera = vrCam;
          vrCam.target = new Vector3(0, GROUND_Y + 1.6, 0);
          vrCam.beta = Math.PI / 2;
          vrCam.radius = 5;
          vrCam.lowerRadiusLimit = 2;
          vrCam.upperRadiusLimit = 30;
          // Limit vertical tilt so user cannot look fully above or below.
          // Allow +/- 30 degrees from horizontal (pi/2) by default.
          const maxTilt = Math.PI / 6; // 30deg
          vrCam.lowerBetaLimit = Math.PI / 2 - maxTilt;
          vrCam.upperBetaLimit = Math.PI / 2 + maxTilt;
          vrCam.detachControl();
          vrCam.inputs.clear();

          const headingRad = (compassHeading * Math.PI) / 180;
          vrCam.alpha = -(headingRad) - Math.PI / 2;

          try {
            setUpdateIntervalForType(SensorTypes.gyroscope, 16);
            gyroSubRef.current = gyroscope.subscribe(
              ({x, y, z}) => {
                const sensitivity = 0.035;
                vrCam.alpha += y * sensitivity;
                vrCam.beta += x * sensitivity;
                const lb = vrCam.lowerBetaLimit;
                const ub = vrCam.upperBetaLimit;
                if (lb != null && vrCam.beta < lb) vrCam.beta = lb;
                if (ub != null && vrCam.beta > ub) vrCam.beta = ub;
              },
              (error: any) => {
                log('WARN', `VR: Errore giroscopio: ${error?.message || error}`);
              },
            );
            log('INFO', 'VR: Camera con giroscopio attivata');
          } catch (gyroErr: any) {
            log('WARN', `VR: Giroscopio non disponibile: ${gyroErr?.message || gyroErr}`);
          }
        }

        // Configure rendering groups for VR
        configureVRRendering(scene);

        // Create VR world (sky, mountains, trees, clouds)
        const vrGridPlane = createVRWorld(scene, shadowGenRef.current);
        groundPlaneRef.current = vrGridPlane;

        surfaceDetectedRef.current = true;
        setSurfaceDetected(true);

        // Reticle
        if (hitTestMarkerRef.current) {
          hitTestMarkerRef.current.isVisible = true;
          hitTestMarkerRef.current.renderingGroupId = 2;
          // Ensure reticle is green in VR mode
          const rMat = hitTestMarkerRef.current.material as StandardMaterial;
          if (rMat) {
            rMat.diffuseColor = new Color3(0, 1, 0);
            rMat.emissiveColor = new Color3(0, 1, 0);
          }
        }
        lastHitPosRef.current = new Vector3(0, GROUND_Y, -2);
        if (hitTestMarkerRef.current) {
          hitTestMarkerRef.current.position.set(0, GROUND_Y + 0.02, -2);
        }

        // VR beforeRender: update reticle from camera
        const vrObserver = scene.onBeforeRenderObservable.add(() => {
          if (!hitTestMarkerRef.current || !scene.activeCamera) return;
          const cam = scene.activeCamera;
          const camForward = cam.getDirection(Vector3.Forward());
          const camPos = cam.globalPosition.clone();
          if (Math.abs(camForward.y) > 0.001) {
            const t = (GROUND_Y - camPos.y) / camForward.y;
            if (t > 0.2 && t < 30) {
              const hitX = camPos.x + t * camForward.x;
              const hitZ = camPos.z + t * camForward.z;
              hitTestMarkerRef.current.isVisible = true;
              hitTestMarkerRef.current.position.set(hitX, GROUND_Y + 0.02, hitZ);
              lastHitPosRef.current = new Vector3(hitX, GROUND_Y, hitZ);
            }
          }
          if (!lastHitPosRef.current) {
            const fwdFlat = new Vector3(camForward.x, 0, camForward.z).normalize();
            lastHitPosRef.current = camPos.add(fwdFlat.scale(3));
            lastHitPosRef.current.y = GROUND_Y;
          }

          // Clamp camera beta to configured limits to avoid looking fully over/under
          try {
            const arcCam = scene.activeCamera as ArcRotateCamera;
            const lb = arcCam.lowerBetaLimit;
            const ub = arcCam.upperBetaLimit;
            if (lb != null && arcCam.beta < lb) arcCam.beta = lb;
            if (ub != null && arcCam.beta > ub) arcCam.beta = ub;
          } catch (e) {}

        });
        vrBeforeRenderRef.current = vrObserver;

        // Sun sphere
        try {
          sunSphereRef.current = createSunSphere(scene, deviceLatRef.current, deviceLonRef.current, dirLightRef.current, false);
        } catch (sunErr: any) {
          log('WARN', `VR: Errore sole: ${sunErr.message}`);
        }

        xrStartingRef.current = false;
        canPlaceOnSurfaceRef.current = true;
        setCanPlaceOnSurface(true);
        setXrSession({exitXRAsync: async () => {}} as any);
        setStatus('VR ATTIVA! Mondo virtuale senza fotocamera.');
        log('INFO', '=== VR COMPLETAMENTE OPERATIVA ===');
        return;
      }

      // ===== AR MODE =====
      // Reset AR floor tracking (unknown until we get a hit/plane)
      arFloorYRef.current = Number.NaN;
      lastHitPosRef.current = null;
      canPlaceOnSurfaceRef.current = false;
      setCanPlaceOnSurface(false);
      if (hitTestMarkerRef.current) hitTestMarkerRef.current.isVisible = false;

      const xr = await scene.createDefaultXRExperienceAsync({
        disableDefaultUI: true,
        disableTeleportation: true,
        optionalFeatures: ['hit-test', 'plane-detection', 'mesh-detection', 'anchors'],
      });
      xrRef.current = xr;

      const referenceSpaceOrder: Array<'unbounded' | 'local-floor' | 'local' | 'viewer'> = [
        'unbounded',
        'local-floor',
        'local',
        'viewer',
      ];
      let session: any = null;
      let lastEnterErr: any = null;
      for (const refSpace of referenceSpaceOrder) {
        try {
          session = await xr.baseExperience.enterXRAsync('immersive-ar', refSpace, xr.renderTarget);
          log('INFO', `Sessione AR avviata con reference space: ${refSpace}`);
          break;
        } catch (enterErr: any) {
          lastEnterErr = enterErr;
          log('WARN', `AR: reference space ${refSpace} non disponibile: ${enterErr?.message || enterErr}`);
        }
      }
      if (!session) {
        throw lastEnterErr || new Error('Nessun reference space AR disponibile');
      }
      log('INFO', 'Sessione AR avviata');

      // AR shadow ground
      const sg = scene.getMeshByName('shadowGround');
      if (sg) {
        sg.receiveShadows = true;
        sg.position.y = Number.isFinite(arFloorYRef.current) ? arFloorYRef.current : 0;
        const mat = sg.material as StandardMaterial;
        if (mat) {
          mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
          mat.specularColor = new Color3(0, 0, 0);
          mat.alpha = 0.35;
          mat.disableDepthWrite = true;
        }
      }

      if (modelRootRef.current) modelRootRef.current.setEnabled(false);

      // AR grid
      const grid = MeshBuilder.CreateGround('arGrid', {width: 20, height: 20, subdivisions: 40}, scene);
      grid.position.y = Number.isFinite(arFloorYRef.current) ? arFloorYRef.current : 0;
      const gridMat = new StandardMaterial('gridMat', scene);
      gridMat.diffuseColor = new Color3(0, 0.6, 0.6);
      gridMat.emissiveColor = new Color3(0, 0.15, 0.15);
      gridMat.alpha = 0.15;
      gridMat.wireframe = true;
      gridMat.backFaceCulling = false;
      gridMat.disableDepthWrite = true;
      grid.material = gridMat;
      grid.isPickable = false;
      grid.renderingGroupId = 1;
      groundPlaneRef.current = grid;

      let hitTestTimestamp = 0;

      // WebXR Hit Test
      try {
        const hitTestOptions = {offsetRay: new Vector3(0, 0, 0), entityTypes: ['plane', 'point', 'mesh']};
        let hitTestFeature: WebXRHitTest | null = null;
        try {
          hitTestFeature = xr.baseExperience.featuresManager.enableFeature(
            WebXRFeatureName.HIT_TEST,
            'stable',
            hitTestOptions,
          ) as WebXRHitTest;
        } catch (stableErr: any) {
          log('INFO', `AR: HitTest stable non disponibile, fallback latest (${stableErr?.message || stableErr})`);
          hitTestFeature = xr.baseExperience.featuresManager.enableFeature(
            WebXRFeatureName.HIT_TEST,
            'latest',
            hitTestOptions,
          ) as WebXRHitTest;
        }

        if (hitTestFeature) {
          log('INFO', 'AR: WebXR HitTest abilitato');
          xrHitTestObserverRef.current = hitTestFeature.onHitTestResultObservable.add((results) => {
            if (disposingRef.current) return;
            if (results.length > 0) {
              const hit = results[0];
              hitTestTimestamp = Date.now();
              const cam = xr.baseExperience.camera;
              if (cam) {
                const camPos = cam.globalPosition.clone();
                const dist = Vector3.Distance(camPos, hit.position);
                if (dist > 15) return; // Ignore outlier hits far from camera
              }
              if (!surfaceDetectedRef.current) {
                surfaceDetectedRef.current = true;
                setSurfaceDetected(true);
                log('INFO', 'AR: Superficie rilevata via HitTest');
              }
              // Set target position for smooth interpolation (applied in per-frame observer)
              reticleTargetPosRef.current = new Vector3(hit.position.x, hit.position.y + 0.02, hit.position.z);
              if (hitTestMarkerRef.current) {
                hitTestMarkerRef.current.isVisible = true;
              }
              lastHitPosRef.current = hit.position.clone();
              // Track the detected floor Y for AR fallback positioning
              if (!Number.isFinite(arFloorYRef.current) || Math.abs(hit.position.y - arFloorYRef.current) < 1.5) {
                arFloorYRef.current = hit.position.y;
              }
            }
          });
        }
      } catch (htErr: any) {
        log('WARN', `AR: WebXR HitTest non disponibile: ${htErr.message}`);
      }

      // Enable WebXR Anchor system for placed-object stabilization
      try {
        anchorSystemRef.current = xr.baseExperience.featuresManager.enableFeature(
          WebXRFeatureName.ANCHOR_SYSTEM,
          'stable',
        );
        if (!anchorSystemRef.current) throw new Error('null');
        log('INFO', 'AR: Anchor system enabled');
      } catch {
        try {
          anchorSystemRef.current = xr.baseExperience.featuresManager.enableFeature(
            WebXRFeatureName.ANCHOR_SYSTEM,
            'latest',
          );
          log('INFO', 'AR: Anchor system enabled (latest)');
        } catch (ancErr: any) {
          anchorSystemRef.current = null;
          log('WARN', `AR: Anchor system unavailable: ${ancErr?.message || ancErr}`);
        }
      }

      // Configure AR rendering groups (occlusion)
      configureARRendering(scene);

      // Plane detection
      planeDetectionRef.current = setupPlaneDetection({xr, scene, enableOccluders: true});

      // Camera raycast fallback
      surfaceDetectedRef.current = true;
      setSurfaceDetected(true);
      log('INFO', 'AR: Raycast camera fallback attivo');

      // Smoothing factor for per-frame reticle lerp (0 = no movement, 1 = instant snap).
      // 0.18 keeps motion fluid without being too laggy.
      const RETICLE_LERP = 0.18;
      // Base reticle scale at 1 m distance.  At distance d, scale = d * BASE_SCALE.
      const RETICLE_BASE_SCALE = 1.0;
      // When no surface data is available at all, project the reticle this many metres in front.
      const RETICLE_FALLBACK_DIST = 1.5;

      xrFrameObserverRef.current = xr.baseExperience.sessionManager.onXRFrameObservable.add(() => {
        if (disposingRef.current) return;
        if (!hitTestMarkerRef.current || !xr.baseExperience.camera) return;
        try {
        const cam = xr.baseExperience.camera;
        const camPos = cam.globalPosition.clone();
        const camForward = cam.getDirection(Vector3.Forward());
        const now = Date.now();
        const hitTestRecentlyActive = (now - hitTestTimestamp) < 300;

        // Feed camera height to plane detection for plausibility checks
        if (planeDetectionRef.current) {
          planeDetectionRef.current.setCameraY(camPos.y);
        }

        // ── Update anchor transforms for all placed objects ──
        if (anchorSystemRef.current) {
          placedAnchorsRef.current.forEach((anchor, node) => {
            if (!anchor || node.isDisposed()) return;
            try {
              const anchorPos = anchor.position;
              const anchorRot = anchor.rotationQuaternion;
              if (anchorPos) {
                node.position.copyFrom(anchorPos);
              }
              if (anchorRot && node.rotationQuaternion) {
                node.rotationQuaternion.copyFrom(anchorRot);
              }
            } catch (anchorErr) {
              // skip if anchor is stale
            }
          });
        }

        // ── Prefer fresh hit-test result (most accurate) ──
        // (target already set in hitTest observer above when fresh)

        if (!hitTestRecentlyActive) {
          // ── Fallback 1: raycast against detected plane meshes ──
          const ray = new Ray(camPos, camForward, 15);
          let closestDist = Infinity;
          let bestHitPos: Vector3 | null = null;

          if (planeDetectionRef.current) {
            planeDetectionRef.current.planes.forEach((plane) => {
              if (!plane.visualMesh.isDisposed()) {
                const pickInfo = ray.intersectsMesh(plane.visualMesh, false);
                if (pickInfo.hit && pickInfo.pickedPoint && pickInfo.distance < closestDist) {
                  closestDist = pickInfo.distance;
                  bestHitPos = pickInfo.pickedPoint.clone();
                }
              }
            });
          }

          if (bestHitPos) {
            const hp = bestHitPos as Vector3;
            reticleTargetPosRef.current = new Vector3(hp.x, hp.y + 0.02, hp.z);
            hitTestMarkerRef.current.isVisible = true;
            lastHitPosRef.current = hp;
            arFloorYRef.current = hp.y;
          } else {
            // ── Fallback 2: project camera ray onto known floor plane ──
            const floorY = arFloorYRef.current;
            let projected = false;
            if (Number.isFinite(floorY) && Math.abs(camForward.y) > 0.001) {
              const t = (floorY - camPos.y) / camForward.y;
              if (t > 0.2 && t < 15) {
                const hitX = camPos.x + t * camForward.x;
                const hitZ = camPos.z + t * camForward.z;
                reticleTargetPosRef.current = new Vector3(hitX, floorY + 0.02, hitZ);
                hitTestMarkerRef.current.isVisible = true;
                lastHitPosRef.current = new Vector3(hitX, floorY, hitZ);
                projected = true;
              }
            }

            if (!projected) {
              // ── Fallback 3 (ALWAYS MOVE): project at fixed distance in front of camera ──
              // This ensures the reticle NEVER freezes even if no surface is known.
              const forward2D = new Vector3(camForward.x, 0, camForward.z);
              const forward2DLen = Math.sqrt(forward2D.x * forward2D.x + forward2D.z * forward2D.z);
              if (forward2DLen > 0.001) {
                forward2D.scaleInPlace(1 / forward2DLen);
                const groundY = Number.isFinite(arFloorYRef.current) ? arFloorYRef.current : camPos.y - 1.2;
                const projX = camPos.x + forward2D.x * RETICLE_FALLBACK_DIST;
                const projZ = camPos.z + forward2D.z * RETICLE_FALLBACK_DIST;
                reticleTargetPosRef.current = new Vector3(projX, groundY + 0.02, projZ);
                hitTestMarkerRef.current.isVisible = true;
                lastHitPosRef.current = new Vector3(projX, groundY, projZ);
              }
            }
          }
        }

        // ── Smooth reticle position via lerp ──
        if (reticleTargetPosRef.current && hitTestMarkerRef.current) {
          const cur = hitTestMarkerRef.current.position;
          const tgt = reticleTargetPosRef.current;
          // If the reticle hasn't been positioned yet, snap immediately
          if (cur.x === 0 && cur.y === 0 && cur.z === 0) {
            cur.copyFrom(tgt);
          } else {
            // Use a lerp factor that ramps up when the target is far away,
            // so large position changes (new hit-test result) converge quickly
            // while small everyday movements remain smooth.
            const dist2 = Vector3.DistanceSquared(cur, tgt);
            const adaptiveLerp = dist2 > 0.5 ? 0.4 : RETICLE_LERP; // snap fast if far
            cur.x += (tgt.x - cur.x) * adaptiveLerp;
            cur.y += (tgt.y - cur.y) * adaptiveLerp;
            cur.z += (tgt.z - cur.z) * adaptiveLerp;
          }

          // ── Distance-based reticle scaling ──
          const camPos = cam.globalPosition;
          const dist = Vector3.Distance(camPos, cur);
          const s = Math.max(0.3, dist * RETICLE_BASE_SCALE);
          hitTestMarkerRef.current.scaling.set(s, s, s);
        }

        // ── Placement validity — update reticle colour (green = valid, red = invalid) ──
        {
          let placementValid = false;
          if (hitTestMarkerRef.current?.isVisible && lastHitPosRef.current) {
            const camP = cam.globalPosition;
            const placeDist = Vector3.Distance(camP, lastHitPosRef.current);
            if (placeDist <= 15) {
              if (Number.isFinite(arFloorYRef.current)) {
                const dy = Math.abs(lastHitPosRef.current.y - arFloorYRef.current);
                placementValid = dy <= 1.5;
              } else {
                placementValid = true;
              }
            }
          }
          if (hitTestMarkerRef.current) {
            const rMat = hitTestMarkerRef.current.material as StandardMaterial;
            if (rMat) {
              if (placementValid) {
                rMat.diffuseColor.r = 0; rMat.diffuseColor.g = 1; rMat.diffuseColor.b = 0;
                rMat.emissiveColor.r = 0; rMat.emissiveColor.g = 1; rMat.emissiveColor.b = 0;
              } else {
                rMat.diffuseColor.r = 1; rMat.diffuseColor.g = 0; rMat.diffuseColor.b = 0;
                rMat.emissiveColor.r = 1; rMat.emissiveColor.g = 0; rMat.emissiveColor.b = 0;
              }
            }
          }
          if (placementValid !== canPlaceOnSurfaceRef.current) {
            canPlaceOnSurfaceRef.current = placementValid;
            setCanPlaceOnSurface(placementValid);
          }
        }

        // Sync floor Y from plane detection manager
        if (planeDetectionRef.current) {
          const planeFloorY = planeDetectionRef.current.getFloorY();
          if (Number.isFinite(planeFloorY)) {
            arFloorYRef.current = planeFloorY;
          }
        }

        // Sync surface-detected state
        if (planeDetectionRef.current && planeDetectionRef.current.isSurfaceDetected()) {
          if (!surfaceDetectedRef.current) {
            surfaceDetectedRef.current = true;
            setSurfaceDetected(true);
          }
        }

        // Keep AR grid synced with detected floor height
        if (groundPlaneRef.current && groundPlaneRef.current.name === 'arGrid') {
          const floorY = arFloorYRef.current;
          if (Number.isFinite(floorY) && Math.abs(groundPlaneRef.current.position.y - floorY) > 0.01) {
            groundPlaneRef.current.position.y = floorY;
          }
        }
        const sg = scene.getMeshByName('shadowGround');
        if (sg) {
          const floorY = arFloorYRef.current;
          if (Number.isFinite(floorY) && Math.abs(sg.position.y - floorY) > 0.01) {
            sg.position.y = floorY;
          }
        }
        } catch (frameErr) {
          // Ignore errors during XR teardown
        }
      });

      // Sun sphere for AR — align directional light to real sun but hide the visual sphere
      try {
        sunSphereRef.current = createSunSphere(scene, deviceLatRef.current, deviceLonRef.current, dirLightRef.current, true);
        // Hide the visual sun meshes in AR — only light alignment matters
        if (sunSphereRef.current) sunSphereRef.current.isVisible = false;
        const sunGlowAR = scene.getMeshByName('sunGlow');
        if (sunGlowAR) sunGlowAR.isVisible = false;
        log('INFO', 'AR: Sole visivo nascosto (solo allineamento luce)');
      } catch (sunErr: any) {
        log('WARN', `Errore posizione sole: ${sunErr.message}`);
      }

      setXrSession(session);

      session.onXRSessionEnded.add(() => {
        anchorSystemRef.current = null;
        placedAnchorsRef.current.clear();
        log('INFO', 'Sessione XR terminata (evento)');
        xrRef.current = null;
        lastTrackingRef.current = null;
        if (trackingTimerRef.current) {
          clearTimeout(trackingTimerRef.current);
          trackingTimerRef.current = null;
        }
        // If we were navigating back, cleanup is already handled by goBackToGallery
        if (navigatingBackRef.current || disposingRef.current) {
          log('INFO', 'AR session ended (during back navigation — cleanup already in progress)');
        } else {
          setXrSession(undefined);
          setTrackingState(undefined);
          setStatus('AR terminata.');
        }
      });

      // Tracking state
      const xrCam = xr.baseExperience.camera;
      xrTrackingObserverRef.current = xrCam.onTrackingStateChanged.add((newState: WebXRTrackingState) => {
        if (disposingRef.current) return;
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

      xrStartingRef.current = false;
      setStatus('AR ATTIVA! Usa i controlli per manipolare il modello.');
      log('INFO', '=== AR COMPLETAMENTE OPERATIVA ===');
    } catch (error: any) {
      xrStartingRef.current = false;
      log('ERROR', `Errore ${viewerMode}: ${error.message}\n${error.stack || ''}`);
      setStatus(`Errore ${viewerMode}: ${error.message}`);
      setXrSession(undefined);
      Alert.alert(`Errore ${viewerMode}`, `Impossibile avviare la sessione ${viewerMode}:\n${error.message}`);
    }
  }, [scene, rootNode, xrSession, viewerMode, compassHeading]);

  // Auto-start XR/VR
  useEffect(() => {
    if (sceneReady && modelLoaded && !xrSession && !vrActiveRef.current && !xrStartingRef.current) {
      const t = setTimeout(() => {
        if (!xrSession && !vrActiveRef.current && !xrStartingRef.current) {
          toggleXR().catch((e) => log('ERROR', `Auto-start XR failed: ${e?.message || e}`));
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [sceneReady, modelLoaded, xrSession, toggleXR]);

  // ========== CLEANUP & NAVIGATE TO GALLERY ==========
  const doFullCleanupAndNavigate = useCallback(() => {
    // Guard against double calls (e.g. safety timer + onXRSessionEnded both firing)
    if (cleanupDoneRef.current) {
      log('INFO', 'doFullCleanupAndNavigate: già eseguito, skip');
      return;
    }
    cleanupDoneRef.current = true;
    disposingRef.current = true;
    log('INFO', 'doFullCleanupAndNavigate');

    // Clean up VR gyro/observers
    if (vrBeforeRenderRef.current && sceneRef.current) {
      try { sceneRef.current.onBeforeRenderObservable.remove(vrBeforeRenderRef.current); } catch (e) {}
      vrBeforeRenderRef.current = null;
    }
    if (gyroSubRef.current) {
      try { gyroSubRef.current.unsubscribe(); } catch (e) {}
      gyroSubRef.current = null;
    }
    vrActiveRef.current = false;

    // Null out refs that callbacks depend on to prevent native code from accessing them
    xrRef.current = null;
    shadowGenRef.current = null;
    dirLightRef.current = null;
    groundPlaneRef.current = null;
    hitTestMarkerRef.current = null;
    xrFrameObserverRef.current = null;
    xrHitTestObserverRef.current = null;
    xrTrackingObserverRef.current = null;
    planeDetectionRef.current = null;
    reticleTargetPosRef.current = null;
    anchorSystemRef.current = null;
    placedAnchorsRef.current.clear();
    originalMaterialsRef.current.clear();

    // CRITICAL: Delay all disposal to let BabylonNative's native async task queue drain.
    // The native layer (arcana tasks in libBabylonNative.so) still has pending callbacks
    // after exitXRAsync/onXRSessionEnded. Disposing immediately causes SIGSEGV.
    // We keep EngineView mounted during this delay so the native context stays valid.
    const NATIVE_DRAIN_DELAY = 600; // ms — enough for native arcana tasks to complete

    setTimeout(() => {
      log('INFO', 'Post-drain: disposing scene objects');

      // Dispose meshes and objects while EngineView is still mounted
      try {
        loadedMeshesRef.current.forEach(m => { try { m.dispose(); } catch (e) {} });
        loadedMeshesRef.current = [];
      } catch (e) {}
      try {
        if (modelRootRef.current) { modelRootRef.current.dispose(); modelRootRef.current = null; }
      } catch (e) {}
      try {
        placedInstancesRef.current.forEach(n => {
          try { n.getChildMeshes().forEach(m => m.dispose()); n.dispose(); } catch (e) {}
        });
        placedInstancesRef.current = [];
      } catch (e) {}
      try {
        if (planeDetectionRef.current) { planeDetectionRef.current.dispose(); planeDetectionRef.current = null; }
      } catch (e) {}
      try {
        if (compassRootRef.current) {
          compassRootRef.current.getChildMeshes().forEach(m => { try { m.dispose(); } catch (e) {} });
          compassRootRef.current.dispose();
          compassRootRef.current = null;
        }
      } catch (e) {}
      try {
        if (sunSphereRef.current) { sunSphereRef.current.dispose(); sunSphereRef.current = null; }
      } catch (e) {}

      // Dispose scene WHILE EngineView is still mounted
      try {
        if (sceneRef.current) { sceneRef.current.dispose(); sceneRef.current = null; }
      } catch (e) {
        log('WARN', `Errore dispose scene: ${e}`);
        sceneRef.current = null;
      }

      log('INFO', 'Cleanup completo');

      // Reset React state and switch screen AFTER disposal is done
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
      setCanPlaceOnSurface(false);
      canPlaceOnSurfaceRef.current = false;
      setStatus('Inizializzazione motore 3D...');

      // Switch screen (triggers EngineView unmount)
      setSelectedModel(null);
      setCurrentScreen('gallery');

      // Reset navigation flags after everything is done
      navigatingBackRef.current = false;
      setTimeout(() => {
        disposingRef.current = false;
        cleanupDoneRef.current = false;
      }, 100);

      log('INFO', 'Tornato alla galleria');
    }, NATIVE_DRAIN_DELAY);
  }, []);

  // ========== BACK TO GALLERY ==========
  const goBackToGallery = useCallback(() => {
    if (navigatingBackRef.current || disposingRef.current) return; // Already navigating
    log('INFO', 'goBackToGallery chiamato');
    navigatingBackRef.current = true;
    disposingRef.current = true; // Block all frame/pointer callbacks immediately

    const doExit = async () => {
      // ── Step 0: Immediately dispose plane detection so its observables
      // stop firing during exit. This prevents native callbacks from
      // dispatching into already-freed BabylonNative objects.  ──
      try {
        if (planeDetectionRef.current) {
          planeDetectionRef.current.dispose();
          planeDetectionRef.current = null;
        }
      } catch (e) {}

      if (xrSession && !vrActiveRef.current && xrRef.current) {
        log('INFO', 'AR: cleanup observers + exitXRAsync');

        // Step 1: Remove ALL XR observables FIRST
        try {
          if (xrFrameObserverRef.current && xrRef.current?.baseExperience?.sessionManager?.onXRFrameObservable) {
            xrRef.current.baseExperience.sessionManager.onXRFrameObservable.remove(xrFrameObserverRef.current);
          }
        } catch (e) {}
        xrFrameObserverRef.current = null;

        try {
          if (xrHitTestObserverRef.current) {
            // The hit-test observer is owned by the feature — just null our ref.
            xrHitTestObserverRef.current = null;
          }
        } catch (e) {}

        try {
          if (xrTrackingObserverRef.current && xrRef.current?.baseExperience?.camera?.onTrackingStateChanged) {
            xrRef.current.baseExperience.camera.onTrackingStateChanged.remove(xrTrackingObserverRef.current);
          }
        } catch (e) {}
        xrTrackingObserverRef.current = null;

        // Null out refs that per-frame callbacks read so even if a stray
        // callback fires during the async gap it exits immediately.
        hitTestMarkerRef.current = null;
        reticleTargetPosRef.current = null;

        // Step 2: Exit the XR session
        try {
          await xrSession.exitXRAsync();
          log('INFO', 'AR: exitXRAsync completato');
        } catch (exitErr: any) {
          log('WARN', `AR: exitXRAsync errore: ${exitErr?.message || exitErr}`);
        }

        // Step 3: Dispose the XR experience helper
        const xrHelper = xrRef.current;
        xrRef.current = null;  // null before dispose to avoid re-entry
        try {
          xrHelper?.dispose();
        } catch (dispErr: any) {
          log('WARN', `AR: XR dispose errore: ${dispErr?.message || dispErr}`);
        }

        // Let native XR shutdown finish before tearing down the scene.
        // 400 ms is conservative enough for BabylonNative arcana tasks.
        await new Promise<void>(resolve => {
          setTimeout(() => resolve(), 400);
        });

        lastTrackingRef.current = null;
        if (trackingTimerRef.current) {
          clearTimeout(trackingTimerRef.current);
          trackingTimerRef.current = null;
        }
      }

      // Proceed with full cleanup after XR is properly ended
      doFullCleanupAndNavigate();
    };

    doExit().catch(err => {
      log('ERROR', `goBackToGallery exit error: ${err?.message || err}`);
      doFullCleanupAndNavigate();
    });
  }, [xrSession, doFullCleanupAndNavigate]);

  // ========== ANDROID BACK BUTTON → GALLERY ==========
  useEffect(() => {
    if (currentScreen !== 'viewer') return;
    const onBackPress = () => {
      goBackToGallery();
      return true; // prevent default (closing app)
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [currentScreen, goBackToGallery]);

  // ========== SELECT MODEL FROM GALLERY ==========
  const openModel = useCallback((model: ModelData, mode: ViewerMode) => {
    log('INFO', `Selezionato modello: ${model.name} (${mode})`);
    setLoadingModel(true);
    setSelectedModel(model);
    setViewerMode(mode);
    setCurrentScreen('viewer');
  }, []);

  // ========== CREATE AT CENTER ==========
  const createAtCenter = useCallback(() => {
    if (!sceneRef.current || !selectedModel || disposingRef.current || placingRef.current) return;

    // 1) Primary: use last known hit position
    let pos = lastHitPosRef.current;

    // 2) Fallback: use the reticle's current world position if it's visible
    if (!pos && hitTestMarkerRef.current && hitTestMarkerRef.current.isVisible) {
      const rp = hitTestMarkerRef.current.position;
      pos = new Vector3(rp.x, rp.y - 0.02, rp.z); // undo the visual Y offset
    }

    // 3) Last resort: project 2m in front of camera at ground level
    if (!pos && sceneRef.current.activeCamera) {
      const cam = sceneRef.current.activeCamera;
      const fwd = cam.getDirection(Vector3.Forward());
      const fwdFlat = new Vector3(fwd.x, 0, fwd.z).normalize();
      pos = cam.globalPosition.add(fwdFlat.scale(2));
      // Use tracked AR floor Y in AR mode, GROUND_Y in VR mode
      if (vrActiveRef.current) {
        pos.y = GROUND_Y;
      } else if (Number.isFinite(arFloorYRef.current)) {
        pos.y = arFloorYRef.current;
      } else {
        pos = null;
      }
    }

    if (pos && sceneRef.current.activeCamera) {
      const cam = sceneRef.current.activeCamera;
      const dist = Vector3.Distance(cam.globalPosition, pos);
      if (dist > 15) {
        log('WARN', `Piazzamento ignorato: posizione troppo distante (${dist.toFixed(2)}m)`);
        setStatus('Superficie troppo distante, riprova');
        return;
      }
      if (!vrActiveRef.current && Number.isFinite(arFloorYRef.current)) {
        const dy = Math.abs(pos.y - arFloorYRef.current);
        if (dy > 1.5) {
          log('WARN', `Piazzamento ignorato: Y instabile (dy=${dy.toFixed(2)})`);
          setStatus('Superficie instabile, riprova');
          return;
        }
      }
    }

    if (pos) {
      placeModelAt(pos, sceneRef.current, selectedModel);
    } else {
      log('WARN', 'Nessuna posizione disponibile per il piazzamento');
      setStatus('Punta la camera verso una superficie per piazzare!');
    }
  }, [selectedModel, placeModelAt]);

  

  // ========== TOGGLE VR FREEZE (lock/unlock gyroscope) ==========
  const toggleVRFreeze = useCallback(() => {
    if (!vrActiveRef.current || !sceneRef.current) return;
    const cam = sceneRef.current.activeCamera as ArcRotateCamera;
    if (!cam) return;

    if (!vrFrozenRef.current) {
      // FREEZE: unsubscribe gyroscope
      if (gyroSubRef.current) {
        gyroSubRef.current.unsubscribe();
        gyroSubRef.current = null;
      }
      vrFrozenRef.current = true;
      setVrFrozen(true);
      log('INFO', 'VR: Visuale congelata');
    } else {
      // UNFREEZE: re-subscribe gyroscope
      setUpdateIntervalForType(SensorTypes.gyroscope, 16);
      gyroSubRef.current = gyroscope.subscribe(({x, y}) => {
        const sensitivity = 0.035;
        cam.alpha += y * sensitivity;
        cam.beta += x * sensitivity;
        const lb = cam.lowerBetaLimit;
        const ub = cam.upperBetaLimit;
        if (lb != null && cam.beta < lb) cam.beta = lb;
        if (ub != null && cam.beta > ub) cam.beta = ub;
      });
      vrFrozenRef.current = false;
      setVrFrozen(false);
      log('INFO', 'VR: Visuale scongelata');
    }
  }, []);

  // ========== ROOM SCAN NAVIGATION ==========
  const openRoomScan = useCallback(() => {
    setCurrentScreen('roomscan');
  }, []);

  const closeRoomScan = useCallback(() => {
    setCurrentScreen('gallery');
  }, []);

  // ========== RENDER ==========
  if (currentScreen === 'gallery') {
    return <GalleryScreen onOpenModel={openModel} onOpenRoomScan={openRoomScan} />;
  }

  if (currentScreen === 'roomscan') {
    return <RoomScanScreen onGoBack={closeRoomScan} />;
  }

  return (
    <ViewerUI
      camera={camera}
      selectedModel={selectedModel}
      viewerMode={viewerMode}
      status={status}
      trackingState={trackingState}
      loadingModel={loadingModel}
      modelLoaded={modelLoaded}
      sceneReady={sceneReady}
      surfaceDetected={surfaceDetected}
      objectsPlaced={objectsPlaced}
      xrSession={xrSession}
      selectedInstance={selectedInstance}
      selectedInstanceRef={selectedInstanceRef}
      modelRootRef={modelRootRef}
      compassHeading={compassHeading}
      showManipulator={showManipulator}
      manipProperty={manipProperty}
      setManipProperty={setManipProperty}
      manipStep={manipStep}
      showTexturePanel={showTexturePanel}
      setShowTexturePanel={setShowTexturePanel}
      meshListForTexture={meshListForTexture}
      selectedMeshIdx={selectedMeshIdx}
      setSelectedMeshIdx={setSelectedMeshIdx}
      applyMaterialPreset={applyMaterialPreset}
      applyTexturePreset={applyTexturePreset}
      applyMaterialStylePreset={applyMaterialStylePreset}
      textureTab={textureTab}
      setTextureTab={setTextureTab}
      refreshMeshList={refreshMeshList}
      goBackToGallery={goBackToGallery}
      createAtCenter={createAtCenter}
      removeSelectedInstance={removeSelectedInstance}
      canPlaceOnSurface={canPlaceOnSurface}
      vrFrozen={vrFrozen}
      toggleVRFreeze={toggleVRFreeze}
    />
  );
};

export default App;