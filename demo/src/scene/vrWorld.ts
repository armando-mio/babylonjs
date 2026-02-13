import {
  Scene,
  Vector3,
  Color3,
  Color4,
  ArcRotateCamera,
  MeshBuilder,
  StandardMaterial,
  ShadowGenerator,
  Mesh,
} from '@babylonjs/core';
import {log} from '../logger';
import {GROUND_Y} from '../constants';

export function createVRWorld(scene: Scene, shadowGen: ShadowGenerator | null): Mesh {
  // Sky background
  scene.clearColor = new Color4(0.45, 0.7, 0.95, 1);

  // Sky dome
  const skyDome = MeshBuilder.CreateSphere('vrSkyDome', {diameter: 100, segments: 16}, scene);
  skyDome.position.y = GROUND_Y + 1.6;
  const skyMat = new StandardMaterial('vrSkyDomeMat', scene);
  skyMat.diffuseColor = new Color3(0.45, 0.7, 0.95);
  skyMat.emissiveColor = new Color3(0.35, 0.55, 0.85);
  skyMat.specularColor = Color3.Black();
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = false;
  skyDome.material = skyMat;
  skyDome.isPickable = false;
  skyDome.renderingGroupId = 0; // Render before group 1 (models)

  // Ground (reuse shadowGround)
  const sg = scene.getMeshByName('shadowGround');
  if (sg) {
    sg.receiveShadows = true;
    const mat = sg.material as StandardMaterial;
    if (mat) {
      mat.diffuseColor = new Color3(0.3, 0.6, 0.25);
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      mat.alpha = 1;
    }
    sg.isVisible = true;
  }

  // VR grid
  const vrGrid = MeshBuilder.CreateGround('arGrid', {width: 50, height: 50, subdivisions: 50}, scene);
  vrGrid.position.y = GROUND_Y + 0.01;
  const vrGridMat = new StandardMaterial('vrGridMat', scene);
  vrGridMat.diffuseColor = new Color3(0.2, 0.45, 0.15);
  vrGridMat.emissiveColor = new Color3(0.02, 0.05, 0.02);
  vrGridMat.alpha = 0.25;
  vrGridMat.wireframe = true;
  vrGridMat.backFaceCulling = false;
  vrGrid.material = vrGridMat;
  vrGrid.isPickable = false;
  vrGrid.renderingGroupId = 1;

  // Mountains
  const mountainColors = [
    new Color3(0.35, 0.45, 0.35),
    new Color3(0.3, 0.4, 0.3),
    new Color3(0.4, 0.5, 0.35),
  ];
  const mountainPositions = [
    {x: -15, z: -20, h: 8, r: 6}, {x: 5, z: -25, h: 12, r: 8},
    {x: 20, z: -18, h: 7, r: 5}, {x: -25, z: -15, h: 10, r: 7},
    {x: 30, z: -22, h: 9, r: 6}, {x: -8, z: -30, h: 14, r: 9},
    {x: 12, z: -28, h: 6, r: 5}, {x: 0, z: 25, h: 10, r: 7},
    {x: -20, z: 18, h: 8, r: 6}, {x: 18, z: 22, h: 11, r: 7},
  ];
  mountainPositions.forEach((mp, i) => {
    const mountain = MeshBuilder.CreateCylinder(
      `vrMountain_${i}`,
      {diameterTop: 0.5, diameterBottom: mp.r * 2, height: mp.h, tessellation: 8},
      scene,
    );
    mountain.position.set(mp.x, GROUND_Y + mp.h / 2, mp.z);
    const mMat = new StandardMaterial(`vrMountainMat_${i}`, scene);
    mMat.diffuseColor = mountainColors[i % mountainColors.length];
    mMat.specularColor = new Color3(0.05, 0.05, 0.05);
    mountain.material = mMat;
    mountain.isPickable = false;
    mountain.renderingGroupId = 1;
    if (shadowGen) shadowGen.addShadowCaster(mountain);
  });

  // Trees
  const treePositions = [
    {x: -6, z: -8}, {x: 8, z: -5}, {x: -3, z: -12},
    {x: 12, z: -10}, {x: -10, z: -6}, {x: 4, z: -15},
    {x: 5, z: 7}, {x: -7, z: 10}, {x: 10, z: 4},
  ];
  treePositions.forEach((tp, i) => {
    const trunk = MeshBuilder.CreateCylinder(
      `vrTrunk_${i}`, {diameter: 0.2, height: 1.5, tessellation: 6}, scene,
    );
    trunk.position.set(tp.x, GROUND_Y + 0.75, tp.z);
    const trunkMat = new StandardMaterial(`vrTrunkMat_${i}`, scene);
    trunkMat.diffuseColor = new Color3(0.4, 0.25, 0.1);
    trunk.material = trunkMat;
    trunk.isPickable = false;
    trunk.renderingGroupId = 1;
    const crown = MeshBuilder.CreateSphere(
      `vrCrown_${i}`, {diameter: 1.2, segments: 6}, scene,
    );
    crown.position.set(tp.x, GROUND_Y + 1.8, tp.z);
    const crownMat = new StandardMaterial(`vrCrownMat_${i}`, scene);
    crownMat.diffuseColor = new Color3(0.15, 0.5 + Math.random() * 0.2, 0.1);
    crown.material = crownMat;
    crown.isPickable = false;
    crown.renderingGroupId = 1;
    if (shadowGen) {
      shadowGen.addShadowCaster(trunk);
      shadowGen.addShadowCaster(crown);
    }
  });

  // Clouds
  for (let ci = 0; ci < 10; ci++) {
    const cloud = MeshBuilder.CreateSphere(
      `vrCloud_${ci}`, {diameter: 3 + Math.random() * 3, segments: 6}, scene,
    );
    const angle = (ci / 10) * Math.PI * 2;
    cloud.position.set(
      Math.cos(angle) * (15 + Math.random() * 15),
      GROUND_Y + 10 + Math.random() * 6,
      Math.sin(angle) * (15 + Math.random() * 15),
    );
    cloud.scaling = new Vector3(1.5, 0.4, 1);
    const cloudMat = new StandardMaterial(`vrCloudMat_${ci}`, scene);
    cloudMat.diffuseColor = new Color3(0.95, 0.95, 0.95);
    cloudMat.emissiveColor = new Color3(0.4, 0.4, 0.45);
    cloudMat.alpha = 0.7;
    cloudMat.disableLighting = true;
    cloud.material = cloudMat;
    cloud.isPickable = false;
    cloud.renderingGroupId = 1;
  }

  log('INFO', 'VR: mondo virtuale creato (cielo, terreno, montagne, alberi, nuvole)');

  return vrGrid; // Return grid as the "ground plane" reference
}
