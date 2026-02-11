import {
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  Quaternion,
  VertexData,
  WebXRFeatureName,
  WebXRPlaneDetector,
} from '@babylonjs/core';
import {log} from '../logger';

// ===== FALSE-POSITIVE FILTERS =====
const MIN_PLANE_AREA = 0.12;        // m² — increased from 0.04 to reduce noise
const MIN_PLANE_VERTICES = 4;       // at least 4 vertices to be a real plane
const MAX_PLANES_DISPLAYED = 25;    // cap total displayed planes
const STABILITY_FRAMES = 3;         // require plane to persist N add/update cycles before showing

// Track how many times each plane ID has been observed (stability counter)
const planeObservationCount = new Map<number, number>();

function computeArea(verts: any[]): number {
  let area = 0;
  for (let i = 1; i < verts.length - 1; i++) {
    const v0 = verts[0], v1 = verts[i], v2 = verts[i + 1];
    const ax = v1.x - v0.x, ay = v1.y - v0.y, az = v1.z - v0.z;
    const bx = v2.x - v0.x, by = v2.y - v0.y, bz = v2.z - v0.z;
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
  }
  return area;
}

function buildPlaneMeshes(planeData: any, scene: Scene): Mesh | null {
  const verts = planeData.polygonDefinition;
  if (!verts || verts.length < MIN_PLANE_VERTICES) {
    return null;
  }

  const area = computeArea(verts);
  if (area < MIN_PLANE_AREA) {
    return null;
  }

  const positions: number[] = [];
  const indices: number[] = [];
  for (const v of verts) {
    positions.push(v.x, v.y, v.z);
  }
  for (let i = 1; i < verts.length - 1; i++) {
    indices.push(0, i, i + 1);
  }

  const isVertical = planeData.xrPlane?.orientation === 'vertical';

  // Visible plane mesh
  const visMesh = new Mesh('detectedPlane_' + planeData.id, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.applyToMesh(visMesh);
  visMesh.createNormals(false);

  const visMat = new StandardMaterial('planeMat_' + planeData.id, scene);
  visMat.diffuseColor = isVertical ? new Color3(0.3, 0.5, 1.0) : new Color3(0.0, 0.8, 0.5);
  visMat.emissiveColor = isVertical ? new Color3(0.05, 0.1, 0.2) : new Color3(0.0, 0.15, 0.05);
  visMat.alpha = 0.12;
  visMat.backFaceCulling = false;
  visMat.disableLighting = true;
  visMesh.material = visMat;
  visMesh.isPickable = true;
  visMesh.renderingGroupId = 1;

  // Edge outline
  const edgePoints: Vector3[] = [];
  for (const v of verts) {
    edgePoints.push(new Vector3(v.x, v.y, v.z));
  }
  edgePoints.push(new Vector3(verts[0].x, verts[0].y, verts[0].z));
  const edgeMesh = MeshBuilder.CreateLines('planeEdge_' + planeData.id, {points: edgePoints}, scene);
  edgeMesh.color = isVertical ? new Color3(0.4, 0.6, 1.0) : new Color3(0.0, 1.0, 0.6);
  edgeMesh.isPickable = false;
  edgeMesh.renderingGroupId = 1;
  (visMesh as any)._edgeMesh = edgeMesh;

  // Occluder mesh
  const occMesh = new Mesh('occluder_' + planeData.id, scene);
  const ovd = new VertexData();
  ovd.positions = [...positions];
  ovd.indices = [...indices];
  ovd.applyToMesh(occMesh);
  occMesh.createNormals(false);

  const occMat = new StandardMaterial('occluderMat_' + planeData.id, scene);
  occMat.disableColorWrite = true;
  occMat.forceDepthWrite = true;
  occMat.disableLighting = true;
  occMat.backFaceCulling = false;
  occMesh.material = occMat;
  occMesh.isPickable = false;
  occMesh.renderingGroupId = 0;
  (visMesh as any)._occluderMesh = occMesh;

  return visMesh;
}

function transformPlaneMeshes(planeData: any, visMesh: Mesh): void {
  visMesh.rotationQuaternion = visMesh.rotationQuaternion || Quaternion.Identity();
  planeData.transformationMatrix.decompose(visMesh.scaling, visMesh.rotationQuaternion, visMesh.position);

  const occMesh = (visMesh as any)._occluderMesh as Mesh | undefined;
  if (occMesh) {
    occMesh.rotationQuaternion = occMesh.rotationQuaternion || Quaternion.Identity();
    planeData.transformationMatrix.decompose(occMesh.scaling, occMesh.rotationQuaternion, occMesh.position);
  }
  const edgeMesh = (visMesh as any)._edgeMesh as Mesh | undefined;
  if (edgeMesh) {
    edgeMesh.rotationQuaternion = edgeMesh.rotationQuaternion || Quaternion.Identity();
    planeData.transformationMatrix.decompose(edgeMesh.scaling, edgeMesh.rotationQuaternion, edgeMesh.position);
  }
}

function disposePlaneMesh(mesh: Mesh) {
  const occ = (mesh as any)._occluderMesh as Mesh | undefined;
  if (occ && !occ.isDisposed()) occ.dispose();
  const edge = (mesh as any)._edgeMesh as Mesh | undefined;
  if (edge && !edge.isDisposed()) edge.dispose();
  if (!mesh.isDisposed()) mesh.dispose();
}

export function setupPlaneDetection(
  xr: any,
  scene: Scene,
  detectedPlaneMeshesRef: React.MutableRefObject<Map<number, Mesh>>,
  surfaceDetectedRef: React.MutableRefObject<boolean>,
  setSurfaceDetected: (v: boolean) => void,
): boolean {
  // Clear stability tracking on new setup
  planeObservationCount.clear();

  let planeDetectionActive = false;
  try {
    log('INFO', 'AR: Tentativo abilitazione PlaneDetection...');
    const planeDetector = xr.baseExperience.featuresManager.enableFeature(
      WebXRFeatureName.PLANE_DETECTION,
      'latest',
      {
        worldParentNode: undefined,
        doNotRemovePlanesOnSessionEnded: false,
        preferredDetectorOptions: {
          allow: ['horizontal', 'vertical', 'any'],
        },
      },
    ) as WebXRPlaneDetector;

    if (planeDetector) {
      planeDetectionActive = true;
      log('INFO', 'AR: ✅ WebXR PlaneDetection ABILITATO con successo');

      planeDetector.onPlaneAddedObservable.add((plane: any) => {
        const orient = plane.xrPlane?.orientation || 'unknown';
        const y = plane.transformationMatrix ? 'y=' + plane.transformationMatrix.m[13]?.toFixed(2) : '';

        // Stability check: track observation count
        const count = (planeObservationCount.get(plane.id) || 0) + 1;
        planeObservationCount.set(plane.id, count);

        if (count < STABILITY_FRAMES) {
          log('INFO', `AR: Piano id=${plane.id} osservazione ${count}/${STABILITY_FRAMES}, attesa stabilità`);
          return;
        }

        // Max planes cap
        if (detectedPlaneMeshesRef.current.size >= MAX_PLANES_DISPLAYED) {
          log('INFO', `AR: Max piani raggiunto (${MAX_PLANES_DISPLAYED}), skip id=${plane.id}`);
          return;
        }

        log('INFO', `AR: 🟢 PIANO AGGIUNTO id=${plane.id} orient=${orient} verts=${plane.polygonDefinition?.length || 0} ${y}`);
        const mesh = buildPlaneMeshes(plane, scene);
        if (mesh) {
          transformPlaneMeshes(plane, mesh);
          detectedPlaneMeshesRef.current.set(plane.id, mesh);
          if (!surfaceDetectedRef.current) {
            surfaceDetectedRef.current = true;
            setSurfaceDetected(true);
          }
          log('INFO', `AR: Piano id=${plane.id} mesh pos=(${mesh.position.x.toFixed(2)},${mesh.position.y.toFixed(2)},${mesh.position.z.toFixed(2)})`);
        }
      });

      planeDetector.onPlaneUpdatedObservable.add((plane: any) => {
        // Increment observation count — plane updates also count towards stability
        const count = (planeObservationCount.get(plane.id) || 0) + 1;
        planeObservationCount.set(plane.id, count);

        const existing = detectedPlaneMeshesRef.current.get(plane.id);
        if (existing && !existing.isDisposed()) {
          const verts = plane.polygonDefinition;
          if (verts && verts.length >= MIN_PLANE_VERTICES) {
            const area = computeArea(verts);
            if (area < MIN_PLANE_AREA) {
              disposePlaneMesh(existing);
              detectedPlaneMeshesRef.current.delete(plane.id);
              return;
            }

            const positions: number[] = [];
            const indices: number[] = [];
            for (const v of verts) {
              positions.push(v.x, v.y, v.z);
            }
            for (let i = 1; i < verts.length - 1; i++) {
              indices.push(0, i, i + 1);
            }
            // Update visible mesh
            const vd = new VertexData();
            vd.positions = positions;
            vd.indices = indices;
            vd.applyToMesh(existing, true);
            existing.createNormals(false);
            // Update occluder
            const occMesh = (existing as any)._occluderMesh as Mesh | undefined;
            if (occMesh && !occMesh.isDisposed()) {
              const ovd = new VertexData();
              ovd.positions = [...positions];
              ovd.indices = [...indices];
              ovd.applyToMesh(occMesh, true);
              occMesh.createNormals(false);
            }
            // Rebuild edge lines
            const oldEdge = (existing as any)._edgeMesh as Mesh | undefined;
            if (oldEdge && !oldEdge.isDisposed()) oldEdge.dispose();
            const isVert = plane.xrPlane?.orientation === 'vertical';
            const edgePoints: Vector3[] = [];
            for (const v of verts) {
              edgePoints.push(new Vector3(v.x, v.y, v.z));
            }
            edgePoints.push(new Vector3(verts[0].x, verts[0].y, verts[0].z));
            const newEdge = MeshBuilder.CreateLines('planeEdge_' + plane.id, {points: edgePoints}, scene);
            newEdge.color = isVert ? new Color3(0.4, 0.6, 1.0) : new Color3(0.0, 1.0, 0.6);
            newEdge.isPickable = false;
            newEdge.renderingGroupId = 1;
            (existing as any)._edgeMesh = newEdge;

            transformPlaneMeshes(plane, existing);
          }
        } else if (count >= STABILITY_FRAMES && detectedPlaneMeshesRef.current.size < MAX_PLANES_DISPLAYED) {
          // Plane doesn't exist yet but now stable — build it
          if (existing) disposePlaneMesh(existing);
          const mesh = buildPlaneMeshes(plane, scene);
          if (mesh) {
            transformPlaneMeshes(plane, mesh);
            detectedPlaneMeshesRef.current.set(plane.id, mesh);
            if (!surfaceDetectedRef.current) {
              surfaceDetectedRef.current = true;
              setSurfaceDetected(true);
            }
          }
        }
      });

      planeDetector.onPlaneRemovedObservable.add((plane: any) => {
        const mesh = detectedPlaneMeshesRef.current.get(plane.id);
        if (mesh) {
          disposePlaneMesh(mesh);
          detectedPlaneMeshesRef.current.delete(plane.id);
        }
        planeObservationCount.delete(plane.id);
        log('INFO', `AR: 🔴 PIANO RIMOSSO id=${plane.id}`);
      });

      // Periodic plane count log
      let planeLogCount = 0;
      xr.baseExperience.sessionManager.onXRFrameObservable.add(() => {
        planeLogCount++;
        if (planeLogCount % 300 === 0) {
          log('INFO', `AR: Piani attivi: ${detectedPlaneMeshesRef.current.size}`);
          detectedPlaneMeshesRef.current.forEach((m: Mesh, id: number) => {
            if (!m.isDisposed()) {
              log('INFO', `  piano id=${id} pos=(${m.position.x.toFixed(2)},${m.position.y.toFixed(2)},${m.position.z.toFixed(2)})`);
            }
          });
        }
      });
    } else {
      log('WARN', 'AR: PlaneDetection enableFeature restituito null');
    }
  } catch (pdErr: any) {
    log('WARN', `AR: ❌ WebXR PlaneDetection NON disponibile: ${pdErr.message}`);
  }

  return planeDetectionActive;
}

export function setupMeshDetection(xr: any, scene: Scene): void {
  try {
    log('INFO', 'AR: Tentativo abilitazione MeshDetection...');
    const meshDetector = xr.baseExperience.featuresManager.enableFeature(
      WebXRFeatureName.MESH_DETECTION,
      'latest',
      {convertCoordinateSystems: true},
    ) as any;

    if (meshDetector) {
      log('INFO', 'AR: ✅ WebXR MeshDetection ABILITATO');

      meshDetector.onMeshAddedObservable?.add((xrMesh: any) => {
        try {
          const verts = xrMesh.positions;
          const idx = xrMesh.indices;
          if (!verts || !idx || verts.length < 9) return;

          const mesh = new Mesh('detectedMesh_' + xrMesh.id, scene);
          const vd = new VertexData();
          vd.positions = Array.from(verts);
          vd.indices = Array.from(idx);
          vd.applyToMesh(mesh);
          mesh.createNormals(false);

          const mat = new StandardMaterial('meshDetMat_' + xrMesh.id, scene);
          mat.diffuseColor = new Color3(1.0, 0.5, 0.2);
          mat.emissiveColor = new Color3(0.2, 0.1, 0.05);
          mat.alpha = 0.10;
          mat.wireframe = true;
          mat.backFaceCulling = false;
          mat.disableLighting = true;
          mesh.material = mat;
          mesh.isPickable = false;
          mesh.renderingGroupId = 1;

          // Occluder
          const occMesh = new Mesh('meshDetOcc_' + xrMesh.id, scene);
          const ovd = new VertexData();
          ovd.positions = Array.from(verts);
          ovd.indices = Array.from(idx);
          ovd.applyToMesh(occMesh);
          occMesh.createNormals(false);
          const occMat = new StandardMaterial('meshDetOccMat_' + xrMesh.id, scene);
          occMat.disableColorWrite = true;
          occMat.forceDepthWrite = true;
          occMat.disableLighting = true;
          occMat.backFaceCulling = false;
          occMesh.material = occMat;
          occMesh.isPickable = false;
          occMesh.renderingGroupId = 0;
          (mesh as any)._occluderMesh = occMesh;

          if (xrMesh.transformationMatrix) {
            mesh.rotationQuaternion = mesh.rotationQuaternion || Quaternion.Identity();
            xrMesh.transformationMatrix.decompose(mesh.scaling, mesh.rotationQuaternion, mesh.position);
            occMesh.rotationQuaternion = occMesh.rotationQuaternion || Quaternion.Identity();
            xrMesh.transformationMatrix.decompose(occMesh.scaling, occMesh.rotationQuaternion, occMesh.position);
          }

          log('INFO', `AR: 🟠 MESH RILEVATA id=${xrMesh.id} verts=${verts.length / 3}`);
        } catch (meshErr: any) {
          log('WARN', `AR: Errore mesh detection add: ${meshErr.message}`);
        }
      });

      meshDetector.onMeshRemovedObservable?.add((xrMesh: any) => {
        const mesh = scene.getMeshByName('detectedMesh_' + xrMesh.id);
        if (mesh) {
          const occ = (mesh as any)._occluderMesh;
          if (occ && !occ.isDisposed()) occ.dispose();
          mesh.dispose();
        }
        log('INFO', `AR: 🔴 MESH RIMOSSA id=${xrMesh.id}`);
      });
    } else {
      log('INFO', 'AR: MeshDetection non supportato dal dispositivo');
    }
  } catch (mdErr: any) {
    log('INFO', `AR: MeshDetection non disponibile: ${mdErr.message}`);
  }
}

export {disposePlaneMesh};
