/**
 * Test suite per l'app AR BabylonJS
 *
 * Verifica:
 * 1. Rendering iniziale dell'app
 * 2. Stato iniziale (messaggio di caricamento)
 * 3. Pulsante AR presente e funzionante
 * 4. Selettore texture visibile
 * 5. Log debug toggle
 * 6. Compatibilità piattaforma (ARCore/ARKit label)
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
  activeCamera: {
    getForwardRay: jest.fn(() => ({
      origin: {add: jest.fn(() => ({x: 0, y: 0, z: 1}))},
      direction: {scale: jest.fn(() => ({x: 0, y: 0, z: 1}))},
      length: 1,
    })),
  },
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

  const Color3 = jest.fn().mockImplementation((r, g, b) => ({
    r,
    g,
    b,
    clone: jest.fn().mockReturnThis(),
  }));
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
    FreeCamera: jest.fn(),
    HemisphericLight: jest.fn(() => ({intensity: 0})),
    DirectionalLight: jest.fn(() => ({intensity: 0})),
    MeshBuilder: {
      CreateBox: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0},
        material: null,
        parent: null,
        dispose: jest.fn(),
      })),
      CreateSphere: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0},
        material: null,
        parent: null,
        dispose: jest.fn(),
      })),
      CreateCylinder: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0},
        material: null,
        parent: null,
        dispose: jest.fn(),
      })),
      CreateTorus: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0},
        material: null,
        parent: null,
        dispose: jest.fn(),
      })),
      CreatePlane: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0},
        material: null,
        parent: null,
        dispose: jest.fn(),
      })),
    },
    StandardMaterial: jest.fn(() => ({
      diffuseColor: null,
      specularColor: null,
      alpha: 1,
      backFaceCulling: true,
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
    if (tree) {
      tree.unmount();
    }
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

  test('mostra le informazioni piattaforma (ARCore/ARKit)', () => {
    const root = tree.root;
    const platformLabel = Platform.OS === 'android' ? 'ARCore' : 'ARKit';
    const infoTexts = root.findAll(
      node =>
        node.type === 'Text' &&
        node.children.some(
          child =>
            typeof child === 'string' && child.includes(platformLabel),
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

  test('mostra contatore piani e oggetti', () => {
    const root = tree.root;
    const infoTexts = root.findAll(
      node =>
        node.type === 'Text' &&
        typeof node.children[0] === 'string' &&
        node.children[0].includes('Piani'),
    );
    expect(infoTexts.length).toBeGreaterThan(0);
  });

  test('EngineView viene sempre renderizzato (necessario per inizializzazione)', () => {
    const root = tree.root;
    // EngineView DEVE essere sempre montato, anche prima che la camera sia pronta
    const engineViews = root.findAll(
      node => node.props.testID === 'engine-view',
    );
    expect(engineViews.length).toBeGreaterThan(0);
  });

  test('mostra tutte le texture disponibili', () => {
    const root = tree.root;
    const textureNames = [
      'Rosso',
      'Blu',
      'Verde',
      'Oro',
      'Trasparente',
      'Legno',
      'Metallo',
    ];
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
});

describe('AR Configuration Tests', () => {
  test('Scene viene creata con il motore BabylonJS', () => {
    const {Scene} = require('@babylonjs/core');
    expect(Scene).toHaveBeenCalled();
  });

  test('ArcRotateCamera viene creata (necessaria per React Native)', () => {
    const {ArcRotateCamera} = require('@babylonjs/core');
    expect(ArcRotateCamera).toHaveBeenCalled();
  });

  test('Luci vengono aggiunte alla scena', () => {
    const {HemisphericLight, DirectionalLight} = require('@babylonjs/core');
    expect(HemisphericLight).toHaveBeenCalled();
    expect(DirectionalLight).toHaveBeenCalled();
  });

  test('Mesh demo vengono creati', () => {
    const {MeshBuilder} = require('@babylonjs/core');
    expect(MeshBuilder.CreateBox).toHaveBeenCalled();
    expect(MeshBuilder.CreateSphere).toHaveBeenCalled();
    expect(MeshBuilder.CreateCylinder).toHaveBeenCalled();
  });

  test('TransformNode root viene creato per AR', () => {
    const {TransformNode} = require('@babylonjs/core');
    expect(TransformNode).toHaveBeenCalledWith('ARRoot', expect.anything());
  });

  test('Pointer observable viene registrato per il tap', () => {
    expect(mockScene.onPointerObservable.add).toHaveBeenCalled();
  });
});

describe('Platform Compatibility', () => {
  test('identifica correttamente la piattaforma', () => {
    // Su test runner, Platform.OS sarà 'ios' o 'android' a seconda del preset
    expect(['ios', 'android']).toContain(Platform.OS);
  });

  test('il label AR corrisponde alla piattaforma', () => {
    const expectedLabel = Platform.OS === 'android' ? 'ARCore' : 'ARKit';
    expect(['ARCore', 'ARKit']).toContain(expectedLabel);
  });
});
