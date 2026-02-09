import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EngineView, useEngine } from '@babylonjs/react-native';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import {
  Color3,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  SceneLoader,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience';
import { WebXRFeatureName } from '@babylonjs/core/XR/webXRFeaturesManager';
import type { IWebXRPlane } from '@babylonjs/core/XR/features/WebXRPlaneDetector';
import { WebXRPlaneDetector } from '@babylonjs/core/XR/features/WebXRPlaneDetector';
import { WebXRHitTest } from '@babylonjs/core/XR/features/WebXRHitTest';
import '@babylonjs/loaders/glTF';

type TextureOption = {
  id: string;
  label: string;
  url?: string;
};

const TEXTURE_OPTIONS: TextureOption[] = [
  { id: 'original', label: 'Original' },
  {
    id: 'carbon',
    label: 'Carbon',
    url: 'https://assets.babylonjs.com/environments/carbonFiber.png',
  },
  {
    id: 'fabric',
    label: 'Fabric',
    url: 'https://assets.babylonjs.com/environments/fabric.jpg',
  },
  {
    id: 'rust',
    label: 'Rust',
    url: 'https://assets.babylonjs.com/textures/rustediron2_basecolor.png',
  },
];

const MODEL_ASSET = {
  rootUrl: 'https://assets.babylonjs.com/meshes/',
  fileName: 'DamagedHelmet.glb',
};

const App = () => {
  const engine = useEngine();
  const [scene, setScene] = useState<Scene | null>(null);
  const [camera, setCamera] = useState<Camera>();
  const [status, setStatus] = useState('Preparing AR session…');
  const [planeCount, setPlaneCount] = useState(0);
  const [selectedTextureId, setSelectedTextureId] = useState<TextureOption['id']>('original');
  const [modelReady, setModelReady] = useState(false);

  const modelRootRef = useRef<TransformNode | null>(null);
  const materialsRef = useRef<PBRMaterial[]>([]);
  const originalAlbedoRef = useRef<Map<number, BaseTexture | null>>(new Map());
  const texturesCacheRef = useRef<Record<string, Texture>>({});
  const planeMeshesRef = useRef<Map<number, Mesh>>(new Map());
  const planeMaterialRef = useRef<StandardMaterial | null>(null);
  const xrExperienceRef = useRef<WebXRDefaultExperience | null>(null);
  const planeDetectorRef = useRef<WebXRPlaneDetector | null>(null);
  const hitTestRef = useRef<WebXRHitTest | null>(null);
  const pendingPlacementRef = useRef(false);

  const ensurePlaneMaterial = useCallback((currentScene: Scene) => {
    if (!planeMaterialRef.current) {
      const material = new StandardMaterial('xr-plane-material', currentScene);
      material.diffuseColor = new Color3(0.2, 0.6, 1.0);
      material.alpha = 0.25;
      material.backFaceCulling = false;
      planeMaterialRef.current = material;
    }
    return planeMaterialRef.current;
  }, []);

  const disposePlaneMeshes = useCallback(() => {
    planeMeshesRef.current.forEach(mesh => mesh.dispose());
    planeMeshesRef.current.clear();
    setPlaneCount(0);
  }, []);

  const updatePlaneMesh = useCallback((mesh: Mesh, plane: IWebXRPlane) => {
    const polygon = plane.polygonDefinition;
    if (!polygon || polygon.length === 0) {
      mesh.setEnabled(false);
      return;
    }

    mesh.setEnabled(true);
    const centroid = polygon
      .reduce((acc, point) => acc.add(point), new Vector3(0, 0, 0))
      .scale(1 / polygon.length);
    const worldMatrix = plane.transformationMatrix;
    const worldPosition = Vector3.TransformCoordinates(centroid, worldMatrix);
    mesh.position.copyFrom(worldPosition);

    const normal = Vector3.TransformNormal(Vector3.Up(), worldMatrix).normalize();
    if (normal.lengthSquared() < 1e-4) {
      normal.copyFrom(Vector3.Up());
    }
    mesh.lookAt(worldPosition.add(normal));

    const maxDistance = polygon.reduce((max, point) => {
      const distance = Vector3.Distance(centroid, point);
      return distance > max ? distance : max;
    }, 0.1);
    mesh.scaling.copyFromFloats(maxDistance * 2, maxDistance * 2, 1);
  }, []);

  const upsertPlaneMesh = useCallback(
    (currentScene: Scene, plane: IWebXRPlane) => {
      const cached = planeMeshesRef.current.get(plane.id);
      const mesh =
        cached ??
        MeshBuilder.CreatePlane(`xr-plane-${plane.id}`, { size: 0.5 }, currentScene);
      mesh.isPickable = false;
      mesh.material = ensurePlaneMaterial(currentScene);
      updatePlaneMesh(mesh, plane);

      if (!cached) {
        planeMeshesRef.current.set(plane.id, mesh);
      }
    },
    [ensurePlaneMaterial, updatePlaneMesh],
  );

  useEffect(() => {
    if (!engine) {
      return;
    }

    const activeScene = new Scene(engine);
    setScene(activeScene);
    const light = new HemisphericLight('scene-light', new Vector3(0, 1, 0), activeScene);
    light.intensity = 1.1;

    const root = new TransformNode('model-root', activeScene);
    root.rotationQuaternion = Quaternion.Identity();
    root.setEnabled(false);
    modelRootRef.current = root;

    let cancelled = false;

    (async () => {
      try {
        setStatus('Loading model…');
        const result = await SceneLoader.ImportMeshAsync(
          '',
          MODEL_ASSET.rootUrl,
          MODEL_ASSET.fileName,
          activeScene,
        );

        result.meshes
          .filter(mesh => mesh !== activeScene.getMeshByName('__root__'))
          .forEach(mesh => {
            mesh.setParent(root);
            mesh.isPickable = false;
          });

        root.scaling = new Vector3(1.4, 1.4, 1.4);

        const materials: PBRMaterial[] = [];
        const originals = new Map<number, BaseTexture | null>();
        root.getChildMeshes().forEach(mesh => {
          const material = mesh.material;
          if (material && material instanceof PBRMaterial) {
            materials.push(material);
            originals.set(material.uniqueId, material.albedoTexture ?? null);
          }
        });

        if (!cancelled) {
          materialsRef.current = materials;
          originalAlbedoRef.current = originals;
          setModelReady(true);
          setStatus('Move your device to detect surfaces.');
        }
      } catch (error) {
        console.error('Model load failed', error);
        if (!cancelled) {
          setStatus('Unable to load the AR asset.');
        }
      }
    })();

    return () => {
      cancelled = true;
      disposePlaneMeshes();
      Object.values(texturesCacheRef.current).forEach(texture => texture.dispose());
      texturesCacheRef.current = {};
      materialsRef.current = [];
      originalAlbedoRef.current.clear();
      planeMaterialRef.current?.dispose();
      planeMaterialRef.current = null;
      modelRootRef.current = null;
      activeScene.dispose();
      setScene(previous => (previous === activeScene ? null : previous));
    };
  }, [disposePlaneMeshes, engine]);

  useEffect(() => {
    if (!scene) {
      return;
    }

    materialsRef.current.forEach(material => {
      if (selectedTextureId === 'original') {
        const original = originalAlbedoRef.current.get(material.uniqueId) ?? null;
        material.albedoTexture = original;
      } else {
        const option = TEXTURE_OPTIONS.find(candidate => candidate.id === selectedTextureId);
        if (!option || !option.url) {
          return;
        }
        let texture = texturesCacheRef.current[selectedTextureId];
        if (!texture) {
          texture = new Texture(option.url, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
          texturesCacheRef.current[selectedTextureId] = texture;
        }
        material.albedoTexture = texture;
      }
      material.markDirty(0);
    });
  }, [scene, selectedTextureId]);

  useEffect(() => {
    if (!scene) {
      return;
    }

    const pointerObserver = scene.onPointerObservable.add(pointerInfo => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        pendingPlacementRef.current = true;
      }
    });

    return () => {
      if (pointerObserver) {
        scene.onPointerObservable.remove(pointerObserver);
      }
    };
  }, [scene]);

  useEffect(() => {
    if (!scene || !modelRootRef.current || xrExperienceRef.current) {
      return;
    }

    let disposed = false;

    const startXR = async () => {
      try {
        setStatus('Requesting AR session…');
        const experience = await scene.createDefaultXRExperienceAsync({
          disableDefaultUI: true,
          disablePointerSelection: true,
          disableTeleportation: true,
          ignoreNativeCameraTransformation: true,
          optionalFeatures: [
            WebXRFeatureName.HIT_TEST,
            WebXRFeatureName.PLANE_DETECTION,
          ],
          uiOptions: {
            sessionMode: 'immersive-ar',
            referenceSpaceType: 'local-floor',
          },
        });

        if (disposed) {
          experience.dispose();
          return;
        }

        xrExperienceRef.current = experience;
        const featuresManager = experience.baseExperience.featuresManager;

        const planeDetector = featuresManager.enableFeature(
          WebXRFeatureName.PLANE_DETECTION,
          'latest',
          {},
        ) as WebXRPlaneDetector;
        planeDetectorRef.current = planeDetector;

        const hitTest = featuresManager.enableFeature(
          WebXRFeatureName.HIT_TEST,
          'latest',
          {
            enableTransientHitTest: true,
            transientHitTestProfile: 'generic-touchscreen',
          },
        ) as WebXRHitTest;
        hitTestRef.current = hitTest;

        planeDetector.onPlaneAddedObservable.add(plane => {
          upsertPlaneMesh(scene, plane);
          setPlaneCount(planeMeshesRef.current.size);
          setStatus('Tap a detected plane to place the object.');
        });
        planeDetector.onPlaneUpdatedObservable.add(plane => {
          const mesh = planeMeshesRef.current.get(plane.id);
          if (mesh) {
            updatePlaneMesh(mesh, plane);
          }
        });
        planeDetector.onPlaneRemovedObservable.add(plane => {
          const mesh = planeMeshesRef.current.get(plane.id);
          if (mesh) {
            mesh.dispose();
            planeMeshesRef.current.delete(plane.id);
            setPlaneCount(planeMeshesRef.current.size);
          }
        });

        hitTest.onHitTestResultObservable.add(results => {
          if (!pendingPlacementRef.current || results.length === 0) {
            return;
          }
          pendingPlacementRef.current = false;
          const result = results[0];
          const root = modelRootRef.current;
          if (!root) {
            return;
          }

          root.setEnabled(true);
          root.position.copyFrom(result.position);
          root.rotationQuaternion = result.rotationQuaternion ?? Quaternion.Identity();
          root.rotate(Vector3.Up(), Math.PI);
          setStatus('Object placed. Tap again to move it or pick a new texture.');
        });

        await experience.baseExperience.enterXRAsync(
          'immersive-ar',
          'local-floor',
          experience.renderTarget,
        );

        setCamera(experience.baseExperience.camera);
      } catch (error) {
        console.error('XR initialization failed', error);
        if (!disposed) {
          setStatus('AR session unavailable on this device.');
        }
      }
    };

    startXR();

    return () => {
      disposed = true;
      hitTestRef.current?.dispose();
      planeDetectorRef.current?.dispose();
      xrExperienceRef.current?.dispose();
      hitTestRef.current = null;
      planeDetectorRef.current = null;
      xrExperienceRef.current = null;
    };
  }, [scene, updatePlaneMesh, upsertPlaneMesh]);

  const availableTextures = useMemo(() => TEXTURE_OPTIONS, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.engineContainer}>
        {camera ? (
          <EngineView
            style={styles.engineView}
            camera={camera}
            isTransparent
            androidView="SurfaceView"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Initializing camera…</Text>
          </View>
        )}

        <View pointerEvents="none" style={styles.hud}>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.subStatus}>
            {planeCount > 0
              ? `${planeCount} plane${planeCount === 1 ? '' : 's'} detected`
              : 'Scanning for horizontal or vertical surfaces'}
          </Text>
        </View>

        {modelReady && (
          <View style={styles.texturePalette}>
            {availableTextures.map(option => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.textureButton,
                  selectedTextureId === option.id && styles.textureButtonActive,
                ]}
                onPress={() => setSelectedTextureId(option.id)}
              >
                <Text
                  style={[
                    styles.textureButtonLabel,
                    selectedTextureId === option.id && styles.textureButtonLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  engineContainer: {
    flex: 1,
  },
  engineView: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  placeholderText: {
    color: '#ffffff',
    fontSize: 16,
  },
  hud: {
    position: 'absolute',
    top: 24,
    left: 16,
    right: 16,
    backgroundColor: '#00000080',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  status: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  subStatus: {
    color: '#d0d0d0',
    marginTop: 4,
    fontSize: 14,
  },
  texturePalette: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  textureButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffffff70',
    backgroundColor: '#00000090',
    marginHorizontal: 8,
    marginVertical: 6,
  },
  textureButtonActive: {
    borderColor: '#66ccff',
    backgroundColor: '#1a3b54',
  },
  textureButtonLabel: {
    color: '#ffffff',
    fontSize: 14,
  },
  textureButtonLabelActive: {
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default App;
