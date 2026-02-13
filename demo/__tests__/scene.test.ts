/**
 * Test suite per i moduli di scena: sunSphere, vrWorld
 */

// Mock logger
jest.mock('../src/logger', () => ({
  log: jest.fn(),
}));

// Mock suncalc
jest.mock('suncalc', () => ({
  getPosition: jest.fn().mockReturnValue({azimuth: 0.5, altitude: 0.3}),
}));

// Mock @babylonjs/core
const mockMeshes: any[] = [];
const mockGetMeshByName = jest.fn((name: string) => {
  if (name === 'shadowGround') {
    return {
      receiveShadows: false,
      isVisible: true,
      material: {
        diffuseColor: null,
        specularColor: null,
        alpha: 1,
      },
    };
  }
  return null;
});

jest.mock('@babylonjs/core', () => {
  const Vector3 = jest.fn().mockImplementation((x: number, y: number, z: number) => ({
    x, y, z,
    set: jest.fn(),
    copyFrom: jest.fn(),
    normalize: jest.fn().mockReturnThis(),
  }));
  (Vector3 as any).Zero = jest.fn(() => ({x: 0, y: 0, z: 0}));

  const Color3 = jest.fn().mockImplementation((r: number, g: number, b: number) => ({r, g, b}));
  (Color3 as any).Black = jest.fn(() => ({r: 0, g: 0, b: 0}));

  const Color4 = jest.fn().mockImplementation((r: number, g: number, b: number, a: number) => ({r, g, b, a}));

  return {
    Scene: jest.fn(() => ({
      clearColor: null,
      meshes: mockMeshes,
      getMeshByName: mockGetMeshByName,
    })),
    Vector3,
    Color3,
    Color4,
    MeshBuilder: {
      CreateSphere: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0, set: jest.fn(), copyFrom: jest.fn()},
        material: null,
        isPickable: false,
        isVisible: true,
        renderingGroupId: 0,
        infiniteDistance: false,
        dispose: jest.fn(),
      })),
      CreateGround: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0, set: jest.fn()},
        material: null,
        isPickable: false,
        isVisible: true,
        renderingGroupId: 0,
        dispose: jest.fn(),
      })),
      CreateCylinder: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0, set: jest.fn()},
        material: null,
        isPickable: false,
        dispose: jest.fn(),
      })),
      CreateLines: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0},
        color: null,
        isPickable: false,
        renderingGroupId: 0,
        dispose: jest.fn(),
      })),
    },
    StandardMaterial: jest.fn(() => ({
      diffuseColor: null,
      specularColor: null,
      emissiveColor: null,
      alpha: 1,
      disableLighting: false,
      backFaceCulling: true,
      wireframe: false,
      disableColorWrite: false,
      forceDepthWrite: false,
    })),
    ArcRotateCamera: jest.fn(),
    ShadowGenerator: jest.fn(() => ({
      addShadowCaster: jest.fn(),
    })),
    Mesh: jest.fn(),
    DirectionalLight: jest.fn(),
    Quaternion: {Identity: jest.fn(() => ({x: 0, y: 0, z: 0, w: 1}))},
    VertexData: jest.fn(),
    WebXRFeatureName: {PLANE_DETECTION: 'xr-plane-detection'},
    WebXRPlaneDetector: jest.fn(),
  };
});

import {createSunSphere} from '../src/scene/sunSphere';
import {createVRWorld} from '../src/scene/vrWorld';
import {MeshBuilder, StandardMaterial, Scene} from '@babylonjs/core';

describe('createSunSphere', () => {
  let scene: any;

  beforeEach(() => {
    jest.clearAllMocks();
    scene = new Scene(null as any);
  });

  test('crea la sfera del sole', () => {
    const result = createSunSphere(scene, 45.0, 12.0, null, false);
    expect(MeshBuilder.CreateSphere).toHaveBeenCalledWith(
      'sunSphere',
      expect.objectContaining({diameter: expect.any(Number)}),
      scene,
    );
    expect(result).toBeDefined();
  });

  test('crea anche il glow attorno al sole', () => {
    createSunSphere(scene, 45.0, 12.0, null, false);
    expect(MeshBuilder.CreateSphere).toHaveBeenCalledWith(
      'sunGlow',
      expect.objectContaining({diameter: expect.any(Number)}),
      scene,
    );
  });

  test('crea materiali per sole e glow', () => {
    createSunSphere(scene, 45.0, 12.0, null, false);
    expect(StandardMaterial).toHaveBeenCalledWith('sunMat', scene);
    expect(StandardMaterial).toHaveBeenCalledWith('sunGlowMat', scene);
  });

  test('allinea luce direzionale al sole quando fornita', () => {
    const dirLight = {
      direction: {x: 0, y: 0, z: 0},
      position: {x: 0, y: 0, z: 0},
      intensity: 0,
    };
    createSunSphere(scene, 45.0, 12.0, dirLight as any, false);
    // Direction should have been set
    expect(dirLight.intensity).toBeGreaterThan(0);
  });

  test('in modalità AR imposta renderingGroupId=1', () => {
    const sphere = createSunSphere(scene, 45.0, 12.0, null, true);
    expect(sphere.renderingGroupId).toBe(1);
  });
});

describe('createVRWorld', () => {
  let scene: any;

  beforeEach(() => {
    jest.clearAllMocks();
    scene = new Scene(null as any);
  });

  test('crea il mondo VR senza crash', () => {
    const result = createVRWorld(scene, null);
    expect(result).toBeDefined();
  });

  test('crea sky dome', () => {
    createVRWorld(scene, null);
    expect(MeshBuilder.CreateSphere).toHaveBeenCalledWith(
      'vrSkyDome',
      expect.any(Object),
      scene,
    );
  });

  test('crea montagne (10)', () => {
    createVRWorld(scene, null);
    for (let i = 0; i < 10; i++) {
      expect(MeshBuilder.CreateCylinder).toHaveBeenCalledWith(
        `vrMountain_${i}`,
        expect.any(Object),
        scene,
      );
    }
  });

  test('crea alberi (tronchi e chiome)', () => {
    createVRWorld(scene, null);
    // 9 trees = 9 trunks + 9 crowns
    for (let i = 0; i < 9; i++) {
      expect(MeshBuilder.CreateCylinder).toHaveBeenCalledWith(
        `vrTrunk_${i}`,
        expect.any(Object),
        scene,
      );
      expect(MeshBuilder.CreateSphere).toHaveBeenCalledWith(
        `vrCrown_${i}`,
        expect.any(Object),
        scene,
      );
    }
  });

  test('crea nuvole (10)', () => {
    createVRWorld(scene, null);
    for (let i = 0; i < 10; i++) {
      expect(MeshBuilder.CreateSphere).toHaveBeenCalledWith(
        `vrCloud_${i}`,
        expect.any(Object),
        scene,
      );
    }
  });

  test('crea griglia VR', () => {
    createVRWorld(scene, null);
    expect(MeshBuilder.CreateGround).toHaveBeenCalledWith(
      'arGrid',
      expect.any(Object),
      scene,
    );
  });

  test('imposta colore cielo', () => {
    createVRWorld(scene, null);
    expect(scene.clearColor).toBeDefined();
  });

  test('usa shadowGen quando fornito', () => {
    const mockShadowGen = {addShadowCaster: jest.fn()};
    createVRWorld(scene, mockShadowGen as any);
    // Mountains, trunks, crowns all added as shadow casters
    expect(mockShadowGen.addShadowCaster).toHaveBeenCalled();
  });
});
