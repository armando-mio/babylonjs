import {
  Scene, Vector3, Color3, Color4, ArcRotateCamera,
  HemisphericLight, DirectionalLight, MeshBuilder,
  StandardMaterial, TransformNode,
  ShadowGenerator, Camera, Mesh,
} from '@babylonjs/core';
import {log} from '../logger';
import {GROUND_Y} from '../constants';
import { ShadowOnlyMaterial } from '@babylonjs/materials';

export interface SceneSetupResult {
  scene: Scene;
  camera: Camera;
  root: TransformNode;
  shadowGen: ShadowGenerator;
  dirLight: DirectionalLight;
  shadowGround: Mesh;
  hitTestMarker: Mesh;
}

export function createScene(engine: any): SceneSetupResult {
  const newScene = new Scene(engine);
  newScene.clearColor = new Color4(0.1, 0.1, 0.15, 1);
  newScene.setRenderingAutoClearDepthStencil(1, false);

  // Camera
  const cam = new ArcRotateCamera('mainCamera', -Math.PI / 2, Math.PI / 3, 3, new Vector3(0, 0, 0), newScene);
  cam.minZ = 0.01; cam.wheelDeltaPercentage = 0.01; cam.pinchDeltaPercentage = 0.01;
  cam.lowerRadiusLimit = 0.5; cam.upperRadiusLimit = 20;

  // Hemispheric light
  const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), newScene);
  hemiLight.intensity = 0.5;
  hemiLight.groundColor = new Color3(0.2, 0.2, 0.25);

  // Directional light (Sarà poi mossa da sunSphere.ts)
  const dirLight = new DirectionalLight('dirLight', new Vector3(-1, -3, -1.5), newScene);
  dirLight.intensity = 1.0;
  dirLight.position = new Vector3(5, 10, 5);

  // Riduciamo la risoluzione a 1024 e usiamo PCF, molto più stabile e compatibile su React Native
  const shadowGen = new ShadowGenerator(1024, dirLight);
  shadowGen.usePercentageCloserFiltering = true; // Algoritmo compatibile col mobile
  shadowGen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadowGen.darkness = 0.6;
  shadowGen.transparencyShadow = true;
  
  dirLight.shadowMinZ = 0.1;
  dirLight.shadowMaxZ = 40;
  dirLight.autoUpdateExtends = true;
  dirLight.autoCalcShadowZBounds = true;
  log('INFO', 'Shadow generator creato (1024px, PCF, darkness 0.6)');

  // Aggiungiamo i modelli 3D alle ombre assicurandoci di prendere SOLO le mesh vere
  // (I file .glb contengono nodi vuoti che fanno crashare le ombre se inseriti)
  newScene.onNewMeshAddedObservable.add((mesh) => {
    if (
      mesh instanceof Mesh && // <-- FONDAMENTALE: esclude i TransformNode vuoti
      mesh.name !== 'shadowGround' &&
      mesh.name !== 'hitTestMarker' &&
      !mesh.name.startsWith('sun') &&
      !mesh.name.startsWith('vr')
    ) {
      shadowGen.addShadowCaster(mesh, true);
    }
  });

  // Root node
  const root = new TransformNode('ARRoot', newScene);

  // Shadow-receiving ground (Pavimento AR)
  const shadowGround = MeshBuilder.CreateGround(
    'shadowGround',
    {width: 50, height: 50},
    newScene,
  );
  shadowGround.receiveShadows = true;
  
  // --- USIAMO IL MATERIALE SPECIFICO PER L'AR ---
  const shadowGroundMat = new ShadowOnlyMaterial('shadowGroundMat', newScene);
  
  // FONDAMENTALE: Diciamo al materiale qual è la luce che proietta l'ombra
  shadowGroundMat.activeLight = dirLight; 
  
  // Con questo materiale, l'alpha regola l'intensità dell'ombra visibile
  // (0.6 è un'ombra morbida, 1.0 è un'ombra nerissima)
  shadowGroundMat.alpha = 0.6; 
  
  shadowGround.material = shadowGroundMat;
  shadowGround.isPickable = false;
  shadowGround.renderingGroupId = 1;

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
  reticle.renderingGroupId = 1;

  // --- IL TRUCCO MAGICO PER L'AR ---
  // Prima di ogni frame, se il mirino AR sta rilevando una superficie (tavolo, pavimento), 
  // spostiamo il piano delle ombre esattamente a quell'altezza.
  newScene.onBeforeRenderObservable.add(() => {
    if (reticle.isVisible) {
      shadowGround.position.y = reticle.position.y;
    }
  });

  log('INFO', 'Scena completamente inizializzata');

  return {
    scene: newScene,
    camera: cam,
    root,
    shadowGen,
    dirLight,
    shadowGround,
    hitTestMarker: reticle,
  };
}