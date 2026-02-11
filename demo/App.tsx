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
import {setupPlaneDetection, setupMeshDetection} from './src/scene/planeDetection';
import {GalleryScreen} from './src/components/GalleryScreen';
import {ViewerUI} from './src/components/ViewerUI';

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
  const detectedPlaneMeshesRef = useRef<Map<number, Mesh>>(new Map());
  const compassRootRef = useRef<TransformNode | null>(null);
  const sunSphereRef = useRef<Mesh | null>(null);
  const vrActiveRef = useRef(false);
  const vrBeforeRenderRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);
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
    }
  }, []);

  // ========== PLACE MODEL COPY AT POSITION ==========
  const placeModelAt = useCallback(async (position: Vector3, scn: Scene, model: ModelData) => {
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

      // Normalize
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

      // Position bottom on reticle
      result.meshes.forEach(m => m.computeWorldMatrix(true));
      let scaledMin = new Vector3(Infinity, Infinity, Infinity);
      let scaledMax = new Vector3(-Infinity, -Infinity, -Infinity);
      result.meshes.forEach(mesh => {
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
        position.y - modelBottomY,
        position.z - modelCenterZ,
      );

      (instRoot as any)._baseScale = pNormScale;
      (instRoot as any)._modelName = model.name; // Store source model name for cross-model textures

      placedInstancesRef.current.push(instRoot);
      setObjectsPlaced(prev => prev + 1);
      selectInstance(instRoot);
      setStatus(`${model.name} piazzato!`);
      log('INFO', `Piazzato: ${instName} baseScale=${pNormScale.toFixed(4)}`);
    } catch (err: any) {
      log('ERROR', `Errore piazzamento: ${err.message}`);
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

  // ========== CROSS-MODEL TEXTURE: Collect meshes from ALL placed instances + preview ==========
  const refreshMeshList = useCallback((target?: TransformNode | null) => {
    const list: MeshListEntry[] = [];
    const excludeNames = new Set(['__root__', 'shadowGround', 'hitTestMarker', 'arGrid']);

    // Collect from all placed instances
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
        // Avoid duplicates (if a placed instance shares the same mesh)
        if (!list.some(e => e.mesh === m)) {
          list.push({name: m.name || `preview_${i}`, mesh: m, sourceName});
        }
      });
    }

    // If a specific target was given and it's not in the list yet (e.g., selected instance only)
    if (target && !list.some(e => target.getChildMeshes().includes(e.mesh as any))) {
      const sourceName = (target as any)._modelName || target.name;
      const meshes = target.getChildMeshes().filter(
        m => m.material && !excludeNames.has(m.name),
      );
      meshes.forEach((m, i) => {
        list.push({name: m.name || `mesh_${i}`, mesh: m, sourceName});
      });
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

      // Normalize
      let minVec = new Vector3(Infinity, Infinity, Infinity);
      let maxVec = new Vector3(-Infinity, -Infinity, -Infinity);
      result.meshes.forEach(mesh => {
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
      newScene.setRenderingAutoClearDepthStencil(1, false);
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

      // Hit-test reticle
      const reticle = MeshBuilder.CreateTorus('hitTestMarker', {diameter: 0.20, thickness: 0.015, tessellation: 32}, newScene);
      const reticleMat = new StandardMaterial('hitTestMarkerMat', newScene);
      reticleMat.diffuseColor = new Color3(0, 1, 0);
      reticleMat.emissiveColor = new Color3(0, 1, 0);
      reticleMat.alpha = 0.9;
      reticleMat.backFaceCulling = false;
      reticle.material = reticleMat;
      reticle.isVisible = false;
      reticle.isPickable = false;
      reticle.renderingGroupId = 1;
      hitTestMarkerRef.current = reticle;

      // Pointer / tap handler
      newScene.onPointerObservable.add(evtData => {
        if (evtData.type !== PointerEventTypes.POINTERTAP) return;
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
            m.name.startsWith('detectedPlane_') || m.name === 'vrSkyDome',
          ).forEach(m => m.dispose());
        }

        // Clean up detected planes
        detectedPlaneMeshesRef.current.forEach(m => {
          try {
            const occ = (m as any)._occluderMesh as Mesh | undefined;
            if (occ) occ.dispose();
            const edge = (m as any)._edgeMesh as Mesh | undefined;
            if (edge) edge.dispose();
            m.dispose();
          } catch (e) {}
        });
        detectedPlaneMeshesRef.current.clear();

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
          if (mat) { mat.alpha = 1; mat.diffuseColor = new Color3(0.3, 0.3, 0.35); }
        }

        if (modelRootRef.current) modelRootRef.current.setEnabled(true);
        scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

        if (gyroSubRef.current) {
          gyroSubRef.current.unsubscribe();
          gyroSubRef.current = null;
        }

        if (xrSession) await xrSession.exitXRAsync();
        vrActiveRef.current = false;
        setXrSession(undefined);
        log('INFO', `Sessione ${viewerMode} terminata`);
        setStatus(`${viewerMode} disattivata.`);
        return;
      }

      // ===== ENTERING =====
      const mode = viewerMode;
      log('INFO', `--- AVVIO ${mode} ---`);
      setStatus(`Avvio ${mode} in corso...`);

      if (mode === 'VR') {
        // ===== VR MODE =====
        vrActiveRef.current = true;

        if (modelRootRef.current) modelRootRef.current.setEnabled(false);

        // Configure camera for VR
        const vrCam = scene.activeCamera as ArcRotateCamera;
        if (vrCam) {
          vrCam.target = new Vector3(0, GROUND_Y + 1.6, 0);
          vrCam.beta = Math.PI / 2;
          vrCam.radius = 5;
          vrCam.lowerRadiusLimit = 2;
          vrCam.upperRadiusLimit = 30;
          vrCam.lowerBetaLimit = 0.2;
          vrCam.upperBetaLimit = Math.PI - 0.1;
          vrCam.detachControl();
          vrCam.inputs.clear();

          const headingRad = (compassHeading * Math.PI) / 180;
          vrCam.alpha = -(headingRad) - Math.PI / 2;

          setUpdateIntervalForType(SensorTypes.gyroscope, 16);
          gyroSubRef.current = gyroscope.subscribe(({x, y, z}) => {
            const sensitivity = 0.035;
            vrCam.alpha += y * sensitivity;
            vrCam.beta += x * sensitivity;
            const lb = vrCam.lowerBetaLimit;
            const ub = vrCam.upperBetaLimit;
            if (lb != null && vrCam.beta < lb) vrCam.beta = lb;
            if (ub != null && vrCam.beta > ub) vrCam.beta = ub;
          });
          log('INFO', 'VR: Camera con giroscopio attivata');
        }

        // Create VR world (sky, mountains, trees, clouds)
        const vrGridPlane = createVRWorld(scene, shadowGenRef.current);
        groundPlaneRef.current = vrGridPlane;

        surfaceDetectedRef.current = true;
        setSurfaceDetected(true);

        // Reticle
        if (hitTestMarkerRef.current) hitTestMarkerRef.current.isVisible = true;
        lastHitPosRef.current = new Vector3(0, GROUND_Y, -2);
        if (hitTestMarkerRef.current) {
          hitTestMarkerRef.current.position.set(0, GROUND_Y + 0.005, -2);
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
              hitTestMarkerRef.current.position.set(hitX, GROUND_Y + 0.005, hitZ);
              lastHitPosRef.current = new Vector3(hitX, GROUND_Y, hitZ);
            }
          }
          if (!lastHitPosRef.current) {
            const fwdFlat = new Vector3(camForward.x, 0, camForward.z).normalize();
            lastHitPosRef.current = camPos.add(fwdFlat.scale(3));
            lastHitPosRef.current.y = GROUND_Y;
          }
        });
        vrBeforeRenderRef.current = vrObserver;

        // Sun sphere
        try {
          sunSphereRef.current = createSunSphere(scene, deviceLatRef.current, deviceLonRef.current, dirLightRef.current, false);
        } catch (sunErr: any) {
          log('WARN', `VR: Errore sole: ${sunErr.message}`);
        }

        setXrSession({exitXRAsync: async () => {}} as any);
        setStatus('VR ATTIVA! Mondo virtuale senza fotocamera.');
        log('INFO', '=== VR COMPLETAMENTE OPERATIVA ===');
        return;
      }

      // ===== AR MODE =====
      const xr = await scene.createDefaultXRExperienceAsync({
        disableDefaultUI: true,
        disableTeleportation: true,
        optionalFeatures: ['hit-test', 'plane-detection', 'mesh-detection', 'anchors'],
      });
      xrRef.current = xr;

      const session = await xr.baseExperience.enterXRAsync('immersive-ar', 'unbounded', xr.renderTarget);
      log('INFO', 'Sessione AR avviata');

      // AR shadow ground
      const sg = scene.getMeshByName('shadowGround');
      if (sg) {
        sg.receiveShadows = true;
        const mat = sg.material as StandardMaterial;
        if (mat) { mat.diffuseColor = new Color3(0.5, 0.5, 0.5); mat.specularColor = new Color3(0, 0, 0); mat.alpha = 0.35; }
      }

      if (modelRootRef.current) modelRootRef.current.setEnabled(false);

      // AR grid
      const grid = MeshBuilder.CreateGround('arGrid', {width: 20, height: 20, subdivisions: 40}, scene);
      grid.position.y = GROUND_Y;
      const gridMat = new StandardMaterial('gridMat', scene);
      gridMat.diffuseColor = new Color3(0, 0.6, 0.6);
      gridMat.emissiveColor = new Color3(0, 0.15, 0.15);
      gridMat.alpha = 0.15;
      gridMat.wireframe = true;
      gridMat.backFaceCulling = false;
      grid.material = gridMat;
      grid.isPickable = false;
      grid.renderingGroupId = 1;
      groundPlaneRef.current = grid;

      let hitTestTimestamp = 0;

      // WebXR Hit Test
      try {
        const hitTestFeature = xr.baseExperience.featuresManager.enableFeature(
          WebXRFeatureName.HIT_TEST, 'latest',
          {offsetRay: new Vector3(0, 0, 0), entityTypes: ['plane', 'point']},
        ) as WebXRHitTest;

        if (hitTestFeature) {
          log('INFO', 'AR: WebXR HitTest abilitato');
          hitTestFeature.onHitTestResultObservable.add((results) => {
            if (results.length > 0) {
              const hit = results[0];
              hitTestTimestamp = Date.now();
              if (!surfaceDetectedRef.current) {
                surfaceDetectedRef.current = true;
                setSurfaceDetected(true);
                log('INFO', 'AR: Superficie rilevata via HitTest');
              }
              if (hitTestMarkerRef.current) {
                hitTestMarkerRef.current.isVisible = true;
                hitTestMarkerRef.current.position.copyFrom(hit.position);
                hitTestMarkerRef.current.position.y += 0.005;
              }
              lastHitPosRef.current = hit.position.clone();
            }
          });
        }
      } catch (htErr: any) {
        log('WARN', `AR: WebXR HitTest non disponibile: ${htErr.message}`);
      }

      // Occlusion rendering groups
      scene.setRenderingAutoClearDepthStencil(0, true, true, true);
      scene.setRenderingAutoClearDepthStencil(1, false, false, false);
      log('INFO', 'AR: Occlusion rendering groups configurati');

      // Plane detection (refactored module — with false-positive fixes)
      const planeDetectionActive = setupPlaneDetection(xr, scene, detectedPlaneMeshesRef, surfaceDetectedRef, setSurfaceDetected);
      if (!planeDetectionActive) {
        log('INFO', 'AR: Plane detection non attivo, fallback solo HitTest');
      }

      // Mesh detection
      setupMeshDetection(xr, scene);

      // Camera raycast fallback
      surfaceDetectedRef.current = true;
      setSurfaceDetected(true);
      log('INFO', 'AR: Raycast camera fallback attivo');

      xr.baseExperience.sessionManager.onXRFrameObservable.add(() => {
        if (!hitTestMarkerRef.current || !xr.baseExperience.camera) return;
        const cam = xr.baseExperience.camera;
        const now = Date.now();
        const hitTestRecentlyActive = (now - hitTestTimestamp) < 500;

        if (!hitTestRecentlyActive) {
          const camForward = cam.getDirection(Vector3.Forward());
          const camPos = cam.globalPosition.clone();
          let bestHitPos: Vector3 | null = null;

          if (detectedPlaneMeshesRef.current.size > 0) {
            const ray = new Ray(camPos, camForward, 15);
            let closestDist = Infinity;
            detectedPlaneMeshesRef.current.forEach((planeMesh) => {
              if (!planeMesh.isDisposed()) {
                const pickInfo = ray.intersectsMesh(planeMesh, false);
                if (pickInfo.hit && pickInfo.pickedPoint && pickInfo.distance < closestDist) {
                  closestDist = pickInfo.distance;
                  bestHitPos = pickInfo.pickedPoint.clone();
                }
              }
            });
          }

          if (bestHitPos) {
            const hp = bestHitPos as Vector3;
            hitTestMarkerRef.current.isVisible = true;
            hitTestMarkerRef.current.position.set(hp.x, hp.y + 0.005, hp.z);
            lastHitPosRef.current = hp;
          } else if (Math.abs(camForward.y) > 0.001) {
            const t = (GROUND_Y - camPos.y) / camForward.y;
            if (t > 0.2 && t < 15) {
              const hitX = camPos.x + t * camForward.x;
              const hitZ = camPos.z + t * camForward.z;
              hitTestMarkerRef.current.isVisible = true;
              hitTestMarkerRef.current.position.set(hitX, GROUND_Y + 0.005, hitZ);
              lastHitPosRef.current = new Vector3(hitX, GROUND_Y, hitZ);
            }
          }
        }
      });

      // Sun sphere for AR
      try {
        sunSphereRef.current = createSunSphere(scene, deviceLatRef.current, deviceLonRef.current, dirLightRef.current, true);
      } catch (sunErr: any) {
        log('WARN', `Errore posizione sole: ${sunErr.message}`);
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
        setStatus('AR terminata.');
        // After the native XR session has ended, perform the heavy cleanup safely.
        try { scheduleDeferredCleanup(); } catch (e) { }
      });

      // Tracking state
      const xrCam = xr.baseExperience.camera;
      xrCam.onTrackingStateChanged.add((newState: WebXRTrackingState) => {
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

      setStatus('AR ATTIVA! Usa i controlli per manipolare il modello.');
      log('INFO', '=== AR COMPLETAMENTE OPERATIVA ===');
    } catch (error: any) {
      log('ERROR', `Errore ${viewerMode}: ${error.message}\n${error.stack || ''}`);
      setStatus(`Errore ${viewerMode}: ${error.message}`);
      setXrSession(undefined);
      Alert.alert(`Errore ${viewerMode}`, `Impossibile avviare la sessione ${viewerMode}:\n${error.message}`);
    }
  }, [scene, rootNode, xrSession, viewerMode, compassHeading]);

  // Perform heavy cleanup (dispose meshes, scene, reset refs/state).
  const scheduleDeferredCleanup = useCallback(() => {
    // Defer heavy disposal to next tick (after native XR fully ends)
    setTimeout(() => {
      try { loadedMeshesRef.current.forEach(m => { try { m.dispose(); } catch (e) {} }); } catch (e) {}
      loadedMeshesRef.current = [];
      try { if (modelRootRef.current) { modelRootRef.current.dispose(); modelRootRef.current = null; } } catch (e) {}
      try { placedInstancesRef.current.forEach(n => { n.getChildMeshes().forEach(m => m.dispose()); n.dispose(); }); } catch (e) {}
      placedInstancesRef.current = [];
      try { detectedPlaneMeshesRef.current.forEach(m => { const occ = (m as any)._occluderMesh as Mesh | undefined; if (occ) occ.dispose(); m.dispose(); }); } catch (e) {}
      detectedPlaneMeshesRef.current.clear();
      try { if (compassRootRef.current) { compassRootRef.current.getChildMeshes().forEach(m => m.dispose()); compassRootRef.current.dispose(); compassRootRef.current = null; } } catch (e) {}
      try { if (sunSphereRef.current) { sunSphereRef.current.dispose(); sunSphereRef.current = null; } } catch (e) {}
      try { if (sceneRef.current) { sceneRef.current.dispose(); sceneRef.current = null; } } catch (e) {}

      xrRef.current = null;
      shadowGenRef.current = null;
      dirLightRef.current = null;
      groundPlaneRef.current = null;
      hitTestMarkerRef.current = null;
      originalMaterialsRef.current.clear();

      // Also reset React state here after native cleanup to avoid racing with XR session end
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
      setStatus('Inizializzazione motore 3D...');
      log('INFO', 'Cleanup completo (deferred)');
    }, 100);
  }, []);

  // Auto-start XR/VR
  useEffect(() => {
    if (sceneReady && modelLoaded && !xrSession && !vrActiveRef.current) {
      const t = setTimeout(() => {
        if (!xrSession && !vrActiveRef.current) {
          toggleXR().catch((e) => log('ERROR', `Auto-start XR failed: ${e?.message || e}`));
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [sceneReady, modelLoaded, xrSession, toggleXR]);

  // ========== BACK TO GALLERY ==========
  const goBackToGallery = useCallback(() => {
    log('INFO', 'goBackToGallery chiamato');

    // IMMEDIATELY switch to gallery screen (unmounts EngineView first)
    setCurrentScreen('gallery');
    setSelectedModel(null);

    // Clean up VR gyro/observers
    if (vrBeforeRenderRef.current && sceneRef.current) {
      sceneRef.current.onBeforeRenderObservable.remove(vrBeforeRenderRef.current);
      vrBeforeRenderRef.current = null;
    }
    if (gyroSubRef.current) {
      gyroSubRef.current.unsubscribe();
      gyroSubRef.current = null;
    }

    // If an XR session is active and we're in AR, do NOT dispose scene/meshes here:
    // disposing while native XR is still active can crash the native/JS thread.
    if (xrSession && !vrActiveRef.current) {
      if (viewerMode === 'VR') {
        try { xrSession.exitXRAsync().catch(() => {}); } catch (e) {}
        vrActiveRef.current = false;
        // schedule cleanup after VR exit
        try { scheduleDeferredCleanup(); } catch (e) {}
      } else {
        log('INFO', 'AR active: skipping explicit exit/cleanup; waiting for session end');
        // leave heavy cleanup to session.onXRSessionEnded handler
      }
      log('INFO', 'Tornato alla galleria (XR still ending)');
      return;
    }

    // No XR session: perform cleanup now
    try { scheduleDeferredCleanup(); } catch (e) {}
    log('INFO', 'Tornato alla galleria (cleanup scheduled)');
  }, [xrSession, viewerMode, scheduleDeferredCleanup]);

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
    if (!sceneRef.current || !selectedModel) return;
    const hitPos = lastHitPosRef.current;
    if (hitPos && surfaceDetectedRef.current) {
      placeModelAt(hitPos, sceneRef.current, selectedModel);
    } else {
      log('WARN', 'Nessuna posizione reticle disponibile per il piazzamento');
      setStatus('Punta la camera verso il pavimento per piazzare!');
    }
  }, [selectedModel, placeModelAt]);

  // ========== RENDER ==========
  if (currentScreen === 'gallery') {
    return <GalleryScreen onOpenModel={openModel} />;
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
    />
  );
};

export default App;
