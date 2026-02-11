import {
  Scene,
  Vector3,
  Color3,
  Color4,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  ShadowGenerator,
  Camera,
  Mesh,
} from '@babylonjs/core';
import {log} from '../logger';
import {GROUND_Y} from '../constants';

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
  log('INFO', 'Camera creata');

  // Hemispheric light
  const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), newScene);
  hemiLight.intensity = 0.5;
  hemiLight.groundColor = new Color3(0.2, 0.2, 0.25);

  // Directional light
  const dirLight = new DirectionalLight('dirLight', new Vector3(-1, -3, -1.5), newScene);
  dirLight.intensity = 1.0;
  dirLight.position = new Vector3(5, 10, 5);
  log('INFO', 'Luci aggiunte alla scena');

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
  dirLight.shadowMinZ = 0.1;
  dirLight.shadowMaxZ = 40;
  dirLight.autoUpdateExtends = true;
  dirLight.autoCalcShadowZBounds = true;
  log('INFO', 'Shadow generator creato (2048px, blur kernel 64, darkness 0.6)');

  // Root node
  const root = new TransformNode('ARRoot', newScene);

  // Shadow-receiving ground
  const shadowGround = MeshBuilder.CreateGround(
    'shadowGround',
    {width: 50, height: 50},
    newScene,
  );
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
