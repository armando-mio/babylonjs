/**
 * Test suite per constants (presets, funzione getSunPosition)
 */

// Mock @babylonjs/core
jest.mock('@babylonjs/core', () => {
  const Color3 = jest.fn().mockImplementation((r: number, g: number, b: number) => ({r, g, b}));
  const Vector3 = jest.fn().mockImplementation((x: number, y: number, z: number) => ({x, y, z}));
  return {Color3, Vector3, Dimensions: undefined};
});

// Mock react-native
jest.mock('react-native', () => ({
  Dimensions: {get: () => ({width: 400, height: 800})},
}));

// Mock suncalc
jest.mock('suncalc', () => ({
  getPosition: jest.fn().mockReturnValue({azimuth: 0.5, altitude: 0.8}),
}));

import {
  GROUND_Y,
  TARGET_MODEL_SIZE,
  SUN_SPHERE_DISTANCE,
  FALLBACK_LATITUDE,
  FALLBACK_LONGITUDE,
  getSunPosition,
  TEXTURE_PRESETS,
  MATERIAL_PRESETS,
  TexturePreset,
  MaterialPreset,
} from '../src/constants';

describe('Constants - valori base', () => {
  test('GROUND_Y è un numero negativo', () => {
    expect(typeof GROUND_Y).toBe('number');
    expect(GROUND_Y).toBeLessThan(0);
  });

  test('TARGET_MODEL_SIZE è un numero positivo', () => {
    expect(typeof TARGET_MODEL_SIZE).toBe('number');
    expect(TARGET_MODEL_SIZE).toBeGreaterThan(0);
  });

  test('SUN_SPHERE_DISTANCE è un numero positivo', () => {
    expect(typeof SUN_SPHERE_DISTANCE).toBe('number');
    expect(SUN_SPHERE_DISTANCE).toBeGreaterThan(0);
  });

  test('FALLBACK coordinate sono valide (Italia)', () => {
    expect(FALLBACK_LATITUDE).toBeGreaterThan(35);
    expect(FALLBACK_LATITUDE).toBeLessThan(48);
    expect(FALLBACK_LONGITUDE).toBeGreaterThan(6);
    expect(FALLBACK_LONGITUDE).toBeLessThan(19);
  });
});

describe('getSunPosition', () => {
  test('restituisce azimuth, altitude, isAboveHorizon', () => {
    const result = getSunPosition(45.0, 12.0, new Date());
    expect(result).toHaveProperty('azimuth');
    expect(result).toHaveProperty('altitude');
    expect(result).toHaveProperty('isAboveHorizon');
    expect(typeof result.azimuth).toBe('number');
    expect(typeof result.altitude).toBe('number');
    expect(typeof result.isAboveHorizon).toBe('boolean');
  });

  test('isAboveHorizon è true quando altitude > 0', () => {
    const SunCalc = require('suncalc');
    SunCalc.getPosition.mockReturnValue({azimuth: 0.5, altitude: 0.3});
    const result = getSunPosition(45.0, 12.0, new Date());
    expect(result.isAboveHorizon).toBe(true);
  });

  test('isAboveHorizon è false quando altitude <= 0', () => {
    const SunCalc = require('suncalc');
    SunCalc.getPosition.mockReturnValue({azimuth: 0.5, altitude: -0.1});
    const result = getSunPosition(45.0, 12.0, new Date());
    expect(result.isAboveHorizon).toBe(false);
  });

  test('azimuth è normalizzato nell\'intervallo [0, 2π)', () => {
    const SunCalc = require('suncalc');
    SunCalc.getPosition.mockReturnValue({azimuth: -1.0, altitude: 0.5});
    const result = getSunPosition(45.0, 12.0, new Date());
    expect(result.azimuth).toBeGreaterThanOrEqual(0);
    expect(result.azimuth).toBeLessThan(2 * Math.PI);
  });
});

describe('TEXTURE_PRESETS', () => {
  test('è un array non vuoto', () => {
    expect(Array.isArray(TEXTURE_PRESETS)).toBe(true);
    expect(TEXTURE_PRESETS.length).toBeGreaterThan(0);
  });

  test('contiene 5 preset texture', () => {
    expect(TEXTURE_PRESETS.length).toBe(5);
  });

  test('il primo preset è di tipo "restore"', () => {
    expect(TEXTURE_PRESETS[0].type).toBe('restore');
    expect(TEXTURE_PRESETS[0].label).toBe('Ripristina');
  });

  test('ogni preset ha label, emoji, type, pattern', () => {
    TEXTURE_PRESETS.forEach(preset => {
      expect(preset).toHaveProperty('label');
      expect(preset).toHaveProperty('emoji');
      expect(preset).toHaveProperty('type');
      expect(preset).toHaveProperty('pattern');
      expect(typeof preset.label).toBe('string');
      expect(typeof preset.emoji).toBe('string');
      expect(['restore', 'texture']).toContain(preset.type);
      expect(['solid', 'checker', 'stripes', 'noise']).toContain(preset.pattern);
    });
  });

  test('preset texture (non restore) hanno color1 e color2', () => {
    TEXTURE_PRESETS.filter(p => p.type === 'texture').forEach(preset => {
      expect(preset.color1).toBeDefined();
      expect(preset.color2).toBeDefined();
      expect(preset.color1).toHaveProperty('r');
      expect(preset.color1).toHaveProperty('g');
      expect(preset.color1).toHaveProperty('b');
      expect(preset.color2).toHaveProperty('r');
      expect(preset.color2).toHaveProperty('g');
      expect(preset.color2).toHaveProperty('b');
    });
  });

  test('contiene i preset attesi', () => {
    const labels = TEXTURE_PRESETS.map(p => p.label);
    expect(labels).toContain('Mattoni');
    expect(labels).toContain('Legno');
    expect(labels).toContain('Marmo');
    expect(labels).toContain('Piastrelle');
  });
});

describe('MATERIAL_PRESETS', () => {
  test('è un array non vuoto', () => {
    expect(Array.isArray(MATERIAL_PRESETS)).toBe(true);
    expect(MATERIAL_PRESETS.length).toBeGreaterThan(0);
  });

  test('contiene 5 preset materiali', () => {
    expect(MATERIAL_PRESETS.length).toBe(5);
  });

  test('il primo preset è di tipo "restore"', () => {
    expect(MATERIAL_PRESETS[0].type).toBe('restore');
    expect(MATERIAL_PRESETS[0].label).toBe('Ripristina');
  });

  test('ogni preset ha label, emoji, type', () => {
    MATERIAL_PRESETS.forEach(preset => {
      expect(preset).toHaveProperty('label');
      expect(preset).toHaveProperty('emoji');
      expect(preset).toHaveProperty('type');
      expect(typeof preset.label).toBe('string');
      expect(typeof preset.emoji).toBe('string');
      expect(['restore', 'material']).toContain(preset.type);
    });
  });

  test('contiene i preset attesi: Oro, Vetro, Metallo, Neon', () => {
    const labels = MATERIAL_PRESETS.map(p => p.label);
    expect(labels).toContain('Oro');
    expect(labels).toContain('Vetro');
    expect(labels).toContain('Metallo');
    expect(labels).toContain('Neon');
  });

  test('Vetro ha alpha < 1 e backFaceCulling false', () => {
    const vetro = MATERIAL_PRESETS.find(p => p.label === 'Vetro');
    expect(vetro).toBeDefined();
    expect(vetro!.alpha).toBeLessThan(1);
    expect(vetro!.backFaceCulling).toBe(false);
  });

  test('Oro ha diffuse color dorato', () => {
    const oro = MATERIAL_PRESETS.find(p => p.label === 'Oro');
    expect(oro).toBeDefined();
    expect(oro!.diffuse).toBeDefined();
    expect(oro!.diffuse!.r).toBeGreaterThan(0.7);
    expect(oro!.diffuse!.g).toBeGreaterThan(0.5);
  });
});
