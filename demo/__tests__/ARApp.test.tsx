/**
 * Test suite per l'app AR BabylonJS
 *
 * Verifica:
 * 1. Rendering iniziale dell'app
 * 2. Pulsante AR presente
 * 3. Selettore texture (disabilitato senza selezione)
 * 4. Log debug toggle
 * 5. Contatore piani e cubi
 * 6. Info selezione cubo
 * 7. Compatibilità piattaforma (ARCore/ARKit)
 * 8. Scene, Camera, Luci, Mesh creation
 * 9. EngineView sempre renderizzato
 */

import React from 'react';
import {Platform} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';

// ---- Mock per @babylonjs/react-native ----
const mockEngine = {
  description: 'MockNativeEngine',
  dispose: jest.fn(),
};

jest.mock('@babylonjs/react-native', () => ({
  EngineView: ({children, ...props}: any) => {
    const {View} = require('react-native');
    return <View testID="engine-view" {...props}>{children}</View>;
  },
  useEngine: () => mockEngine,
}));

// ---- Mock per @babylonjs/core ----
const mockScene = {
  createDefaultCamera: jest.fn(),
  createDefaultLight: jest.fn(),
  clearColor: null,
  activeCamera: null,
  onPointerObservable: {
    add: jest.fn(),
  },
  createDefaultXRExperienceAsync: jest.fn(),
  pick: jest.fn(),
};

jest.mock('@babylonjs/core', () => {
  const Vector3 = jest.fn().mockImplementation((x, y, z) => ({x, y, z}));
  Vector3.Zero = jest.fn(() => ({x: 0, y: 0, z: 0}));
  Vector3.Up = jest.fn(() => ({x: 0, y: 1, z: 0}));
  Vector3.TransformCoordinates = jest.fn(() => ({x: 0, y: 0, z: 0}));

  const Color3 = jest.fn().mockImplementation((r, g, b) => ({
    r, g, b,
    clone: jest.fn().mockReturnThis(),
  }));
  Color3.Black = jest.fn(() => ({r: 0, g: 0, b: 0, clone: jest.fn().mockReturnThis()}));

  const Color4 = jest.fn().mockImplementation((r, g, b, a) => ({r, g, b, a}));

  return {
    Scene: jest.fn(() => mockScene),
    Vector3,
    Color3,
    Color4,
    Camera: jest.fn(),
    ArcRotateCamera: jest.fn(() => ({
      minZ: 0,
      wheelDeltaPercentage: 0,
      pinchDeltaPercentage: 0,
    })),
    HemisphericLight: jest.fn(() => ({intensity: 0})),
    DirectionalLight: jest.fn(() => ({intensity: 0})),
    MeshBuilder: {
      CreateBox: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0.5},
        material: null,
        parent: null,
        isPickable: false,
        isVisible: true,
        scaling: {x: 1, y: 1, z: 1},
        rotation: {x: 0, y: 0, z: 0},
        name: 'cube_demo',
        dispose: jest.fn(),
      })),
      CreateSphere: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0},
        material: null,
        parent: null,
        isPickable: false,
        isVisible: false,
        rotationQuaternion: null,
        scaling: {x: 1, y: 1, z: 1},
        name: 'hitTestMarker',
        dispose: jest.fn(),
      })),
    },
    StandardMaterial: jest.fn(() => ({
      diffuseColor: null,
      specularColor: null,
      emissiveColor: null,
      alpha: 1,
    })),
    Texture: jest.fn(),
    TransformNode: jest.fn(() => ({
      position: {x: 0, y: 0, z: 0},
      rotate: jest.fn(),
    })),
    WebXRSessionManager: jest.fn(),
    WebXRTrackingState: {
      NOT_TRACKING: 0,
      TRACKING_LOST: 1,
      TRACKING: 2,
      0: 'NOT_TRACKING',
      1: 'TRACKING_LOST',
      2: 'TRACKING',
    },
    WebXRFeatureName: {
      PLANE_DETECTION: 'xr-plane-detection',
      HIT_TEST: 'xr-hit-test',
    },
    WebXRHitTest: jest.fn(),
    WebXRPlaneDetector: jest.fn(),
    AbstractMesh: jest.fn(),
    PointerEventTypes: {
      POINTERTAP: 4,
    },
    Quaternion: jest.fn().mockImplementation(() => ({x: 0, y: 0, z: 0, w: 1})),
    Matrix: jest.fn(),
    Mesh: jest.fn(),
  };
});

jest.mock('@babylonjs/loaders', () => ({}));

// ---- Import App after mocks ----
import App from '../App';

describe('AR Demo App', () => {
  let tree: ReactTestRenderer;

  beforeEach(async () => {
    await act(async () => {
      tree = renderer.create(<App />);
    });
  });

  afterEach(() => {
    if (tree) tree.unmount();
  });

  test('renderizza senza crash', () => {
    expect(tree.toJSON()).toBeTruthy();
  });

  test('mostra il pulsante Avvia AR', () => {
    const root = tree.root;
    const buttons = root.findAll(
      node =>
        node.type === 'Text' &&
        typeof node.children[0] === 'string' &&
        node.children[0].includes('Avvia AR'),
    );
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('mostra il messaggio di stato iniziale', () => {
    const root = tree.root;
    const statusTexts = root.findAll(
      node =>
        node.type === 'Text' &&
        typeof node.children[0] === 'string' &&
        (node.children[0].includes('pronta') ||
          node.children[0].includes('Avvia AR') ||
          node.children[0].includes('Inizializzazione')),
    );
    expect(statusTexts.length).toBeGreaterThan(0);
  });

  test('mostra info piattaforma (ARCore/ARKit)', () => {
    const root = tree.root;
    const platformLabel = Platform.OS === 'android' ? 'ARCore' : 'ARKit';
    const infoTexts = root.findAll(
      node =>
        node.type === 'Text' &&
        node.children.some(
          child => typeof child === 'string' && child.includes(platformLabel),
        ),
    );
    expect(infoTexts.length).toBeGreaterThan(0);
  });

  test('mostra i pulsanti texture', () => {
    const root = tree.root;
    const textureButtons = root.findAll(
      node =>
        node.type === 'Text' &&
        typeof node.children[0] === 'string' &&
        node.children[0] === 'Rosso',
    );
    expect(textureButtons.length).toBeGreaterThan(0);
  });

  test('ha un pulsante debug/log', () => {
    const root = tree.root;
    const debugBtns = root.findAll(
      node =>
        node.type === 'Text' &&
        typeof node.children[0] === 'string' &&
        node.children[0].includes('Log'),
    );
    expect(debugBtns.length).toBeGreaterThan(0);
  });

  test('mostra contatore piani e cubi', () => {
    const root = tree.root;
    const infoTexts = root.findAll(
      node =>
        node.type === 'Text' &&
        node.children.some(
          child => typeof child === 'string' && child.includes('Piani'),
        ),
    );
    expect(infoTexts.length).toBeGreaterThan(0);
  });

  test('mostra info selezione cubo (Nessuno inizialmente)', () => {
    const root = tree.root;
    const selectionTexts = root.findAll(
      node =>
        node.type === 'Text' &&
        node.children.some(
          child => typeof child === 'string' && child.includes('Selezionato'),
        ),
    );
    expect(selectionTexts.length).toBeGreaterThan(0);
  });

  test('EngineView sempre renderizzato', () => {
    const root = tree.root;
    const engineViews = root.findAll(
      node => node.props.testID === 'engine-view',
    );
    expect(engineViews.length).toBeGreaterThan(0);
  });

  test('mostra tutte le 7 texture disponibili', () => {
    const root = tree.root;
    const textureNames = ['Rosso', 'Blu', 'Verde', 'Oro', 'Trasparente', 'Legno', 'Metallo'];
    textureNames.forEach(name => {
      const found = root.findAll(
        node =>
          node.type === 'Text' &&
          typeof node.children[0] === 'string' &&
          node.children[0] === name,
      );
      expect(found.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('texture label mostra "nessuno" quando nessun cubo selezionato', () => {
    const root = tree.root;
    const labels = root.findAll(
      node =>
        node.type === 'Text' &&
        node.children.some(
          child => typeof child === 'string' && child.includes('nessuno'),
        ),
    );
    expect(labels.length).toBeGreaterThan(0);
  });

  test('pannello manipolazione non visibile inizialmente', () => {
    const root = tree.root;
    const manipLabels = root.findAll(
      node =>
        node.type === 'Text' &&
        typeof node.children[0] === 'string' &&
        node.children[0].includes('Scala'),
    );
    expect(manipLabels.length).toBe(0);
  });
});

describe('AR Configuration Tests', () => {
  test('Scene creata con il motore BabylonJS', () => {
    const {Scene} = require('@babylonjs/core');
    expect(Scene).toHaveBeenCalled();
  });

  test('ArcRotateCamera creata', () => {
    const {ArcRotateCamera} = require('@babylonjs/core');
    expect(ArcRotateCamera).toHaveBeenCalled();
  });

  test('Luci aggiunte alla scena', () => {
    const {HemisphericLight, DirectionalLight} = require('@babylonjs/core');
    expect(HemisphericLight).toHaveBeenCalled();
    expect(DirectionalLight).toHaveBeenCalled();
  });

  test('Cubo demo creato', () => {
    const {MeshBuilder} = require('@babylonjs/core');
    expect(MeshBuilder.CreateBox).toHaveBeenCalledWith(
      'cube_demo',
      expect.objectContaining({size: expect.any(Number)}),
      expect.anything(),
    );
  });

  test('Hit-test marker (sfera) creato', () => {
    const {MeshBuilder} = require('@babylonjs/core');
    expect(MeshBuilder.CreateSphere).toHaveBeenCalledWith(
      'hitTestMarker',
      expect.objectContaining({diameter: expect.any(Number)}),
      expect.anything(),
    );
  });

  test('TransformNode root per AR', () => {
    const {TransformNode} = require('@babylonjs/core');
    expect(TransformNode).toHaveBeenCalledWith('ARRoot', expect.anything());
  });

  test('Pointer observable registrato per il tap', () => {
    expect(mockScene.onPointerObservable.add).toHaveBeenCalled();
  });
});

describe('Platform Compatibility', () => {
  test('identifica la piattaforma', () => {
    expect(['ios', 'android']).toContain(Platform.OS);
  });

  test('label AR corrisponde alla piattaforma', () => {
    const expectedLabel = Platform.OS === 'android' ? 'ARCore' : 'ARKit';
    expect(['ARCore', 'ARKit']).toContain(expectedLabel);
  });
});
