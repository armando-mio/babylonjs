import {Color3, Vector3} from '@babylonjs/core';
import {Dimensions} from 'react-native';
import SunCalc from 'suncalc';

// ================= CONSTANTS =================
export const GROUND_Y = -1.3;
export const SELECTION_EMISSIVE = new Color3(0.3, 0.6, 1);
export const TARGET_MODEL_SIZE = 1.0;
export const {width: SCREEN_WIDTH} = Dimensions.get('window');
export const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

// ================= SOLAR POSITION =================
export const SUN_SPHERE_DISTANCE = 8;
export const FALLBACK_LATITUDE = 45.957;
export const FALLBACK_LONGITUDE = 12.657;

export interface SunPosition {
  azimuth: number;
  altitude: number;
  isAboveHorizon: boolean;
}

export function getSunPosition(lat: number, lon: number, date: Date): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lon);
  const azimuth = (pos.azimuth + Math.PI) % (2 * Math.PI);
  return {
    azimuth,
    altitude: pos.altitude,
    isAboveHorizon: pos.altitude > 0,
  };
}

// ================= TEXTURE PRESETS (procedural textures applied via diffuseColor + pattern) =================
export interface TexturePreset {
  label: string;
  emoji: string;
  // Generator function creates a dynamic texture on the scene and returns it
  // null = restore original
  type: 'restore' | 'texture';
  color1?: {r: number; g: number; b: number};
  color2?: {r: number; g: number; b: number};
  pattern: 'solid' | 'checker' | 'stripes' | 'noise';
}

export const TEXTURE_PRESETS: TexturePreset[] = [
  {label: 'Ripristina', emoji: '↩️', type: 'restore', pattern: 'solid'},
  {label: 'Mattoni', emoji: '🧱', type: 'texture', color1: {r: 0.65, g: 0.25, b: 0.12}, color2: {r: 0.45, g: 0.18, b: 0.08}, pattern: 'checker'},
  {label: 'Legno', emoji: '🪵', type: 'texture', color1: {r: 0.55, g: 0.35, b: 0.17}, color2: {r: 0.40, g: 0.22, b: 0.10}, pattern: 'stripes'},
  {label: 'Marmo', emoji: '🪨', type: 'texture', color1: {r: 0.90, g: 0.88, b: 0.85}, color2: {r: 0.70, g: 0.68, b: 0.65}, pattern: 'noise'},
  {label: 'Piastrelle', emoji: '🔲', type: 'texture', color1: {r: 0.85, g: 0.85, b: 0.88}, color2: {r: 0.50, g: 0.50, b: 0.55}, pattern: 'checker'},
];

// ================= MATERIAL PRESETS =================
export interface MaterialPreset {
  label: string;
  emoji: string;
  type: 'restore' | 'material';
  diffuse?: {r: number; g: number; b: number};
  specular?: {r: number; g: number; b: number};
  emissive?: {r: number; g: number; b: number};
  alpha?: number;
  wireframe?: boolean;
  backFaceCulling?: boolean;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {label: 'Ripristina', emoji: '↩️', type: 'restore'},
  {label: 'Oro', emoji: '✨', type: 'material', diffuse: {r: 0.85, g: 0.65, b: 0.13}, specular: {r: 1, g: 0.85, b: 0.4}, emissive: {r: 0.15, g: 0.10, b: 0.02}},
  {label: 'Vetro', emoji: '🪟', type: 'material', diffuse: {r: 0.6, g: 0.8, b: 0.9}, specular: {r: 1, g: 1, b: 1}, alpha: 0.35, backFaceCulling: false},
  {label: 'Metallo', emoji: '⚙️', type: 'material', diffuse: {r: 0.55, g: 0.56, b: 0.58}, specular: {r: 0.9, g: 0.9, b: 0.95}, emissive: {r: 0.05, g: 0.05, b: 0.07}},
  {label: 'Neon', emoji: '💡', type: 'material', diffuse: {r: 0.1, g: 0.9, b: 0.6}, specular: {r: 0, g: 0, b: 0}, emissive: {r: 0.1, g: 0.9, b: 0.6}},
];
