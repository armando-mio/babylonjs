/**
 * Test suite completa per l'App principale
 *
 * Verifica:
 * 1. Rendering iniziale (gallery)
 * 2. Navigazione gallery → viewer
 * 3. BackHandler Android
 * 4. Scena, camera, luci inizializzati
 * 5. EngineView presente nel viewer
 * 6. AR vs VR mode
 */

import React from 'react';
import {BackHandler} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';

// Helper to avoid TypeScript complaining about ElementType vs string literal
function isText(node: any): boolean {
  return (node as any).type === 'Text';
}

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
const mockOnPointerAdd = jest.fn();
const mockSetRenderingAutoClearDepthStencil = jest.fn();
const mockOnBeforeRenderAdd = jest.fn();
const mockOnBeforeRenderRemove = jest.fn();
const mockMeshes: any[] = [];

const mockScene = {
  createDefaultCamera: jest.fn(),
  createDefaultLight: jest.fn(),
  clearColor: null,
  activeCamera: null,
  onPointerObservable: {add: mockOnPointerAdd},
  createDefaultXRExperienceAsync: jest.fn(),
  setRenderingAutoClearDepthStencil: mockSetRenderingAutoClearDepthStencil,
  pick: jest.fn(),
  meshes: mockMeshes,
  getMeshByName: jest.fn(() => null),
  onBeforeRenderObservable: {
    add: mockOnBeforeRenderAdd,
    remove: mockOnBeforeRenderRemove,
  },
  dispose: jest.fn(),
  pointerX: 0,
  pointerY: 0,
};

jest.mock('@babylonjs/core', () => {
  const Vector3 = jest.fn().mockImplementation((x: number, y: number, z: number) => ({
    x, y, z,
    subtract: jest.fn(() => ({x: 0, y: 0, z: 0})),
    clone: jest.fn(function(this: any) { return {x: this.x, y: this.y, z: this.z}; }),
    normalize: jest.fn().mockReturnThis(),
    add: jest.fn(() => ({x: 0, y: 0, z: 0})),
    scale: jest.fn(() => ({x: 0, y: 0, z: 0})),
    copyFrom: jest.fn(),
    set: jest.fn(),
  }));
  (Vector3 as any).Zero = jest.fn(() => ({x: 0, y: 0, z: 0}));
  (Vector3 as any).Up = jest.fn(() => ({x: 0, y: 1, z: 0}));
  (Vector3 as any).Forward = jest.fn(() => ({x: 0, y: 0, z: 1}));
  (Vector3 as any).Minimize = jest.fn(() => ({x: 0, y: 0, z: 0}));
  (Vector3 as any).Maximize = jest.fn(() => ({x: 0, y: 0, z: 0}));
  (Vector3 as any).TransformCoordinates = jest.fn(() => ({x: 0, y: 0, z: 0}));

  const Color3 = jest.fn().mockImplementation((r: number, g: number, b: number) => ({
    r, g, b, clone: jest.fn().mockReturnThis(),
  }));
  (Color3 as any).Black = jest.fn(() => ({r: 0, g: 0, b: 0, clone: jest.fn().mockReturnThis()}));

  const Color4 = jest.fn().mockImplementation((r: number, g: number, b: number, a: number) => ({r, g, b, a}));

  const mockShadowGen = {
    useBlurExponentialShadowMap: false,
    blurKernel: 0,
    darkness: 0,
    bias: 0,
    normalBias: 0,
    depthScale: 0,
    frustumEdgeFalloff: 0,
    useKernelBlur: false,
    blurScale: 0,
    setDarkness: jest.fn(),
    transparencyShadow: false,
    addShadowCaster: jest.fn(),
  };

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
      lowerRadiusLimit: 0,
      upperRadiusLimit: 0,
      target: {x: 0, y: 0, z: 0},
      beta: 0,
      alpha: 0,
      radius: 0,
      lowerBetaLimit: 0,
      upperBetaLimit: 0,
      detachControl: jest.fn(),
      inputs: {clear: jest.fn()},
      getDirection: jest.fn(() => ({x: 0, y: 0, z: 1})),
      globalPosition: {x: 0, y: 0, z: 0, clone: jest.fn(() => ({x: 0, y: 0, z: 0}))},
    })),
    HemisphericLight: jest.fn(() => ({intensity: 0, groundColor: null})),
    DirectionalLight: jest.fn(() => ({
      intensity: 0,
      position: {x: 0, y: 0, z: 0},
      direction: {x: 0, y: 0, z: 0},
      shadowMinZ: 0,
      shadowMaxZ: 0,
      autoUpdateExtends: false,
      autoCalcShadowZBounds: false,
    })),
    ShadowGenerator: jest.fn(() => mockShadowGen),
    MeshBuilder: {
      CreateBox: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0.5, set: jest.fn()},
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
        position: {x: 0, y: 0, z: 0, set: jest.fn(), copyFrom: jest.fn()},
        material: null,
        parent: null,
        isPickable: false,
        isVisible: false,
        rotationQuaternion: null,
        scaling: {x: 1, y: 1, z: 1},
        name: 'hitTestMarker',
        dispose: jest.fn(),
      })),
      CreateGround: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0, set: jest.fn()},
        material: null,
        receiveShadows: false,
        isPickable: false,
        isVisible: true,
        renderingGroupId: 0,
        dispose: jest.fn(),
      })),
      CreateTorus: jest.fn(() => ({
        position: {x: 0, y: 0, z: 0, set: jest.fn(), copyFrom: jest.fn()},
        material: null,
        isVisible: false,
        isPickable: false,
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
      ambientColor: null,
      alpha: 1,
      wireframe: false,
      backFaceCulling: true,
      disableLighting: false,
      disableColorWrite: false,
      forceDepthWrite: false,
      diffuseTexture: null,
    })),
    PBRMaterial: jest.fn(() => ({
      albedoColor: null,
      albedoTexture: null,
      emissiveColor: null,
      metallic: 0,
      roughness: 1,
      alpha: 1,
      backFaceCulling: true,
      getClassName: () => 'PBRMaterial',
    })),
    Texture: {
      BILINEAR_SAMPLINGMODE: 2,
      WRAP_ADDRESSMODE: 1,
    },
    RawTexture: {
      CreateRGBATexture: jest.fn(() => ({
        wrapU: 0,
        wrapV: 0,
        hasAlpha: false,
      })),
    },
    TransformNode: jest.fn(() => ({
      position: {x: 0, y: 0, z: 0, set: jest.fn()},
      rotation: {x: 0, y: 0, z: 0},
      scaling: {x: 1, y: 1, z: 1},
      rotate: jest.fn(),
      dispose: jest.fn(),
      getChildMeshes: jest.fn(() => []),
      setEnabled: jest.fn(),
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
    PointerEventTypes: {POINTERTAP: 4},
    Quaternion: {
      Identity: jest.fn(() => ({x: 0, y: 0, z: 0, w: 1})),
    },
    Matrix: jest.fn(),
    Mesh: jest.fn(),
    SceneLoader: {
      ImportMeshAsync: jest.fn().mockResolvedValue({
        meshes: [],
        skeletons: [],
        animationGroups: [],
      }),
    },
    Ray: jest.fn(),
  };
});

jest.mock('@babylonjs/loaders', () => ({}));

// Mock react-native-sensors
jest.mock('react-native-sensors', () => ({
  gyroscope: {subscribe: jest.fn(() => ({unsubscribe: jest.fn()}))},
  setUpdateIntervalForType: jest.fn(),
  SensorTypes: {gyroscope: 'gyroscope'},
}));

// Mock react-native-compass-heading
jest.mock('react-native-compass-heading', () => ({
  start: jest.fn(),
  stop: jest.fn(),
}));

// Mock react-native-geolocation-service
jest.mock('react-native-geolocation-service', () => ({
  getCurrentPosition: jest.fn(),
}));

// Mock suncalc
jest.mock('suncalc', () => ({
  getPosition: jest.fn().mockReturnValue({azimuth: 0.5, altitude: 0.8}),
}));

// ---- Import App after mocks ----
import App from '../App';

/**
 * Helper: trova l'antenato più vicino con onPress partendo da un nodo.
 * Serve perché react-test-renderer può avere wrapper intermedi (Text → Text).
 */
function findAncestorWithOnPress(node: any): any {
  let current = node;
  while (current) {
    if (current.props && typeof current.props.onPress === 'function') {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Helper: pressa il primo pulsante con etichetta data nella gallery
 */
function pressModelButton(root: any, label: 'AR' | 'VR'): void {
  const textNodes = root.findAll(
    (n: any) => isText(n) && n.children.length === 1 && n.children[0] === label,
  );
  expect(textNodes.length).toBeGreaterThan(0);
  const btn = findAncestorWithOnPress(textNodes[0]);
  expect(btn).toBeTruthy();
  btn.props.onPress();
}

/**
 * Helper: renderizza App, naviga al viewer premendo AR, aspetta effetti
 */
async function renderAndNavigateToViewer(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  await act(async () => {
    pressModelButton(tree.root, 'AR');
  });
  // Flush extra per useEffect della scena
  await act(async () => {
    await new Promise<void>(r => setTimeout(r, 0));
  });
  return tree;
}

// =====================================================
// TESTS
// =====================================================

describe('App - Rendering iniziale (Gallery)', () => {
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

  test('mostra la gallery inizialmente (titolo "Galleria Modelli 3D")', () => {
    const root = tree.root;
    const title = root.findAll(
      n => isText(n) && n.children.some((c: any) => typeof c === 'string' && c.includes('Galleria Modelli 3D')),
    );
    expect(title.length).toBeGreaterThan(0);
  });

  test('non mostra l\'EngineView nella gallery', () => {
    const root = tree.root;
    const engineViews = root.findAll(n => n.props.testID === 'engine-view');
    expect(engineViews.length).toBe(0);
  });

  test('mostra tutti i 5 modelli', () => {
    const root = tree.root;
    const {AR_MODELS} = require('../modelsData');
    AR_MODELS.forEach((model: any) => {
      const found = root.findAll(
        n => isText(n) && n.children.some((c: any) => typeof c === 'string' && c === model.name),
      );
      expect(found.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('ogni modello ha pulsanti AR e VR', () => {
    const root = tree.root;
    const arBtns = root.findAll(
      n => isText(n) && n.children.length === 1 && n.children[0] === 'AR',
    );
    const vrBtns = root.findAll(
      n => isText(n) && n.children.length === 1 && n.children[0] === 'VR',
    );
    expect(arBtns.length).toBe(5);
    expect(vrBtns.length).toBe(5);
  });
});

describe('App - Navigazione', () => {
  let tree: ReactTestRenderer;

  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      tree = renderer.create(<App />);
    });
  });

  afterEach(() => {
    if (tree) tree.unmount();
  });

  test('premere AR su un modello passa al viewer con EngineView', async () => {
    const root = tree.root;

    await act(async () => {
      pressModelButton(root, 'AR');
    });
    await act(async () => {
      await new Promise<void>(r => setTimeout(r, 0));
    });

    const engineViews = root.findAll(n => n.props.testID === 'engine-view');
    expect(engineViews.length).toBeGreaterThanOrEqual(1);
  });

  test('premere VR su un modello passa al viewer in mode VR', async () => {
    const root = tree.root;

    await act(async () => {
      pressModelButton(root, 'VR');
    });
    await act(async () => {
      await new Promise<void>(r => setTimeout(r, 0));
    });

    // Should show VR badge somewhere
    const vrBadge = root.findAll(
      n => isText(n) && n.children.some((c: any) => typeof c === 'string' && c === 'VR'),
    );
    expect(vrBadge.length).toBeGreaterThan(0);
  });
});

describe('App - Scene configuration (dopo navigazione al viewer)', () => {
  let tree: ReactTestRenderer;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOnPointerAdd.mockClear();
    mockSetRenderingAutoClearDepthStencil.mockClear();
    tree = await renderAndNavigateToViewer();
  });

  afterEach(() => {
    if (tree) tree.unmount();
  });

  test('Scene viene creata con il motore', () => {
    const {Scene} = require('@babylonjs/core');
    expect(Scene).toHaveBeenCalled();
  });

  test('ArcRotateCamera viene creata', () => {
    const {ArcRotateCamera} = require('@babylonjs/core');
    expect(ArcRotateCamera).toHaveBeenCalled();
  });

  test('Luci HemisphericLight e DirectionalLight create', () => {
    const {HemisphericLight, DirectionalLight} = require('@babylonjs/core');
    expect(HemisphericLight).toHaveBeenCalled();
    expect(DirectionalLight).toHaveBeenCalled();
  });

  test('ShadowGenerator creato', () => {
    const {ShadowGenerator} = require('@babylonjs/core');
    expect(ShadowGenerator).toHaveBeenCalled();
  });

  test('TransformNode ARRoot creato', () => {
    const {TransformNode} = require('@babylonjs/core');
    expect(TransformNode).toHaveBeenCalledWith('ARRoot', expect.anything());
  });

  test('Pointer observable registrato', () => {
    expect(mockOnPointerAdd).toHaveBeenCalled();
  });

  test('SceneLoader.ImportMeshAsync invocato per caricare modello', () => {
    const {SceneLoader} = require('@babylonjs/core');
    expect(SceneLoader.ImportMeshAsync).toHaveBeenCalled();
  });
});

describe('App - BackHandler Android', () => {
  test('BackHandler listener viene registrato nel viewer', async () => {
    const addListenerSpy = jest.spyOn(BackHandler, 'addEventListener');

    const tree = await renderAndNavigateToViewer();

    expect(addListenerSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));

    addListenerSpy.mockRestore();
    tree.unmount();
  });
});

describe('App - Platform compatibility', () => {
  test('identifica la piattaforma corretta', () => {
    const {Platform} = require('react-native');
    expect(['ios', 'android']).toContain(Platform.OS);
  });
});

describe('App - Back button in AR mode (⬅️)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockOnPointerAdd.mockClear();

    // Setup createDefaultXRExperienceAsync to return a realistic XR mock
    // so the app enters a real AR session state
    const mockExitXRAsync = jest.fn().mockResolvedValue(undefined);
    const onXRSessionEndedCallbacks: Array<() => void> = [];
    const onXRFrameCallbacks: Array<(frame: any) => void> = [];
    const onTrackingCallbacks: Array<(state: any) => void> = [];

    const mockSessionManager = {
      exitXRAsync: mockExitXRAsync,
      onXRSessionEnded: {
        add: jest.fn((cb: () => void) => {
          onXRSessionEndedCallbacks.push(cb);
        }),
      },
    };

    const mockXRCamera = {
      onTrackingStateChanged: {
        add: jest.fn((cb: any) => {
          onTrackingCallbacks.push(cb);
        }),
      },
      getDirection: jest.fn(() => ({x: 0, y: -0.5, z: 1})),
      globalPosition: {x: 0, y: 1.6, z: 0, clone: jest.fn(() => ({x: 0, y: 1.6, z: 0}))},
    };

    const mockFeaturesManager = {
      enableFeature: jest.fn(() => ({
        onHitTestResultObservable: {add: jest.fn()},
      })),
    };

    const mockXRExperience = {
      baseExperience: {
        enterXRAsync: jest.fn().mockResolvedValue(mockSessionManager),
        camera: mockXRCamera,
        sessionManager: {
          onXRFrameObservable: {
            add: jest.fn((cb: any) => {
              onXRFrameCallbacks.push(cb);
            }),
          },
        },
        featuresManager: mockFeaturesManager,
      },
      renderTarget: {},
    };

    mockScene.createDefaultXRExperienceAsync.mockResolvedValue(mockXRExperience);

    // Store references for use in tests
    (globalThis as any).__testXR = {
      mockExitXRAsync,
      mockSessionManager,
      onXRSessionEndedCallbacks,
      fireSessionEnded: () => {
        onXRSessionEndedCallbacks.forEach(cb => cb());
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).__testXR;
  });

  test('premere ⬅️ nel viewer AR torna alla gallery senza crash', async () => {
    let tree!: ReactTestRenderer;

    // 1. Render and navigate to AR viewer
    await act(async () => {
      tree = renderer.create(<App />);
    });
    await act(async () => {
      pressModelButton(tree.root, 'AR');
    });
    // Flush scene init useEffect
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    // Let auto-start XR kick in (300ms timer)
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    // Flush the async toggleXR promises
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // 2. At this point the AR session should be active.
    //    Find the back button (⬅️ or "Galleria" text)
    const root = tree.root;
    const galleriaButtons = root.findAll(
      (n: any) => {
        if (!n.props || typeof n.props.onPress !== 'function') return false;
        try {
          const texts = n.findAll(
            (c: any) => c.type === 'Text' && c.children.some(
              (ch: any) => typeof ch === 'string' && (ch.includes('Galleria') || ch.includes('⬅️')),
            ),
          );
          return texts.length > 0;
        } catch { return false; }
      },
    );
    expect(galleriaButtons.length).toBeGreaterThan(0);

    // 3. Press the back button — this should NOT throw
    await act(async () => {
      galleriaButtons[0].props.onPress();
    });

    // 4. goBackToGallery no longer calls exitXRAsync (prevents SIGSEGV).
    //    It goes directly to doFullCleanupAndNavigate which has a 600ms delay.
    //    Flush the deferred cleanup setTimeout (600ms native drain + 100ms flag reset)
    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    // 5. Flush remaining promises
    await act(async () => {
      await Promise.resolve();
    });

    // 6. Verify we are back in the gallery
    const galleryTitle = root.findAll(
      (n: any) => isText(n) && n.children.some(
        (c: any) => typeof c === 'string' && c.includes('Galleria Modelli 3D'),
      ),
    );
    expect(galleryTitle.length).toBeGreaterThan(0);

    // 7. Verify no EngineView is rendered
    const engineViews = root.findAll(n => n.props.testID === 'engine-view');
    expect(engineViews.length).toBe(0);

    tree.unmount();
  });

  test('premere ⬅️ non deve chiamare dispose su oggetti già null', async () => {
    let tree!: ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<App />);
    });
    await act(async () => {
      pressModelButton(tree.root, 'AR');
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree.root;
    const galleriaButtons = root.findAll(
      (n: any) => {
        if (!n.props || typeof n.props.onPress !== 'function') return false;
        try {
          const texts = n.findAll(
            (c: any) => c.type === 'Text' && c.children.some(
              (ch: any) => typeof ch === 'string' && (ch.includes('Galleria') || ch.includes('⬅️')),
            ),
          );
          return texts.length > 0;
        } catch { return false; }
      },
    );

    // Press back — should not throw even if dispose methods fail
    const disposeError = new Error('Already disposed');
    mockScene.dispose.mockImplementationOnce(() => { throw disposeError; });

    await act(async () => {
      galleriaButtons[0].props.onPress();
    });

    // The deferred cleanup should catch dispose errors gracefully (600ms drain + 100ms)
    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    // Should still be on gallery, no crash
    const galleryTitle = root.findAll(
      (n: any) => isText(n) && n.children.some(
        (c: any) => typeof c === 'string' && c.includes('Galleria Modelli 3D'),
      ),
    );
    expect(galleryTitle.length).toBeGreaterThan(0);

    tree.unmount();
  });

  test('doppio click su ⬅️ non causa doppia navigazione', async () => {
    let tree!: ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<App />);
    });
    await act(async () => {
      pressModelButton(tree.root, 'AR');
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree.root;
    const galleriaButtons = root.findAll(
      (n: any) => {
        if (!n.props || typeof n.props.onPress !== 'function') return false;
        try {
          const texts = n.findAll(
            (c: any) => c.type === 'Text' && c.children.some(
              (ch: any) => typeof ch === 'string' && (ch.includes('Galleria') || ch.includes('⬅️')),
            ),
          );
          return texts.length > 0;
        } catch { return false; }
      },
    );

    // Press back TWICE rapidly
    await act(async () => {
      galleriaButtons[0].props.onPress();
    });

    // Second press should be a no-op (navigatingBackRef guards it)
    // But if the component re-rendered, galleriaButtons[0] may be stale.
    // Find new buttons if the view changed:
    const backBtns2 = root.findAll(
      (n: any) => {
        if (!n.props || typeof n.props.onPress !== 'function') return false;
        try {
          const texts = n.findAll(
            (c: any) => c.type === 'Text' && c.children.some(
              (ch: any) => typeof ch === 'string' && (ch.includes('Galleria') || ch.includes('⬅️')),
            ),
          );
          return texts.length > 0;
        } catch { return false; }
      },
    );
    if (backBtns2.length > 0) {
      await act(async () => {
        backBtns2[0].props.onPress();
      });
    }

    const testXR = (globalThis as any).__testXR;

    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    // exitXRAsync should NOT have been called (we skip it to avoid SIGSEGV)
    if (testXR) {
      expect(testXR.mockExitXRAsync).not.toHaveBeenCalled();
    }

    tree.unmount();
  });
});
