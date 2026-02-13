import {
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  DirectionalLight,
} from '@babylonjs/core';
import {log} from '../logger';
import {GROUND_Y, SUN_SPHERE_DISTANCE, getSunPosition} from '../constants';

export function createSunSphere(
  scene: Scene,
  lat: number,
  lon: number,
  dirLight: DirectionalLight | null,
  isAR: boolean,
): Mesh {
  const now = new Date();
  const sunPos = getSunPosition(lat, lon, now);
  const sunX = SUN_SPHERE_DISTANCE * Math.cos(sunPos.altitude) * Math.sin(sunPos.azimuth);
  const sunZ = -SUN_SPHERE_DISTANCE * Math.cos(sunPos.altitude) * Math.cos(sunPos.azimuth);
  const sunY = GROUND_Y + SUN_SPHERE_DISTANCE * Math.sin(sunPos.altitude);
  // Enforce a minimum height
  const minVisibleHeight = GROUND_Y + SUN_SPHERE_DISTANCE * 0.5; // 50% of distance
  const finalSunY = sunPos.isAboveHorizon ? Math.max(sunY, minVisibleHeight) : GROUND_Y + 0.5;

  const sunSphere = MeshBuilder.CreateSphere('sunSphere', {diameter: 0.6, segments: 16}, scene);
  sunSphere.position.set(sunX, finalSunY, sunZ);
  sunSphere.isPickable = false;
  if (isAR) sunSphere.renderingGroupId = 1;

  const sunMat = new StandardMaterial('sunMat', scene);
  sunMat.diffuseColor = sunPos.isAboveHorizon ? new Color3(1, 0.85, 0.4) : new Color3(0.5, 0.1, 0.05);
  sunMat.emissiveColor = sunPos.isAboveHorizon ? new Color3(1, 0.7, 0.3) : new Color3(0.3, 0.08, 0.03);
  sunMat.disableLighting = true;
  sunSphere.material = sunMat;

  const sunGlow = MeshBuilder.CreateSphere('sunGlow', {diameter: 1.0, segments: 12}, scene);
  sunGlow.position.copyFrom(sunSphere.position);
  sunGlow.isPickable = false;
  if (isAR) sunGlow.renderingGroupId = 1;

  const glowMat = new StandardMaterial('sunGlowMat', scene);
  glowMat.diffuseColor = new Color3(1, 0.7, 0.3);
  glowMat.emissiveColor = new Color3(1, 0.5, 0.2);
  glowMat.alpha = 0.2;
  glowMat.disableLighting = true;
  glowMat.backFaceCulling = false;
  sunGlow.material = glowMat;

  // Align directional light to sun
  if (dirLight) {
    const sunDir = new Vector3(-sunX, -finalSunY + GROUND_Y, -sunZ).normalize();
    dirLight.direction = sunDir;
    dirLight.position = new Vector3(sunX * 0.5, finalSunY * 0.5, sunZ * 0.5);
    dirLight.intensity = sunPos.isAboveHorizon ? 1.2 : 0.3;
    log('INFO', '☀️ Luce direzionale allineata al sole');
  }

  const azDeg = (sunPos.azimuth * 180 / Math.PI).toFixed(1);
  const altDeg = (sunPos.altitude * 180 / Math.PI).toFixed(1);
  log('INFO', `☀️ Sole: az=${azDeg}° alt=${altDeg}°`);

  return sunSphere;
}
