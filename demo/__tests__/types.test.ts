/**
 * Test suite per i tipi TypeScript (types.ts)
 *
 * Verifica che i tipi siano esportati correttamente e usabili
 */

// Mock @babylonjs/core
jest.mock('@babylonjs/core', () => ({
  AbstractMesh: jest.fn(),
  TransformNode: jest.fn(),
}));

import {AppScreen, ViewerMode, MeshListEntry} from '../src/types';

describe('Types', () => {
  test('AppScreen accetta "gallery" e "viewer"', () => {
    const gallery: AppScreen = 'gallery';
    const viewer: AppScreen = 'viewer';
    expect(gallery).toBe('gallery');
    expect(viewer).toBe('viewer');
  });

  test('ViewerMode accetta "AR" e "VR"', () => {
    const ar: ViewerMode = 'AR';
    const vr: ViewerMode = 'VR';
    expect(ar).toBe('AR');
    expect(vr).toBe('VR');
  });

  test('MeshListEntry ha la struttura corretta', () => {
    const entry: MeshListEntry = {
      name: 'test_mesh',
      mesh: {} as any,
      sourceName: 'TestModel',
    };
    expect(entry.name).toBe('test_mesh');
    expect(entry.sourceName).toBe('TestModel');
    expect(entry).toHaveProperty('mesh');
  });
});
