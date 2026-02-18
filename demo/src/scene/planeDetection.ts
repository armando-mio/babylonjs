/**
 * planeDetection.ts — WebXR Plane Detection
 *
 * Detects and visualises real-world planes (horizontal + vertical).
 *
 * • Horizontal planes (floors, tables) are placement targets.
 *   They do NOT get occluder meshes — this prevents placed objects
 *   from being hidden "behind the floor."
 *
 * • Vertical planes (walls) optionally get depth-only occluders
 *   so objects behind them are hidden, giving realistic AR occlusion.
 *
 * The module exposes a simple functional API that returns a
 * PlaneDetectionResult object with a dispose() method for cleanup.
 */

import {
  Scene,
  Vector3,
  Color3,
  Matrix,
  Mesh,
  Quaternion,
  VertexData,
  MeshBuilder,
  StandardMaterial,
  WebXRFeatureName,
  WebXRPlaneDetector,
} from '@babylonjs/core';
import {log} from '../logger';

// ——— Configuration ———
const MIN_AREA = 0.04; // m² — small enough for tables, large enough to reject noise
const MIN_VERTICES = 3; // accept triangles
const MAX_PLANES = 50; // increased for better coverage
const OCCLUDER_Z_OFFSET = 4; // depth bias so objects sitting on a surface win the depth test
const FLOOR_ELEVATION_THRESHOLD = 0.35; // m — horizontal planes above floorY + this are "elevated" (hidden)
// Horizontal plane upward-normal threshold (dot product with world up).
// A genuinely horizontal surface has its normal pointing nearly straight up (≈1.0).
// We require > 0.5 (i.e. < 60° from vertical) to reject tilted/spurious planes.
const HORIZ_NORMAL_THRESHOLD = 0.5;
// Furthest above the camera a horizontal plane may appear (m).
// Planes floating more than this above the camera are almost certainly false detections.
const MAX_PLANE_ABOVE_CAMERA = 1.0;

// ——— Public types ———
export interface DetectedPlane {
  visualMesh: Mesh;
  edgeMesh: Mesh;
  occluder: Mesh | null;
  orientation: 'horizontal' | 'vertical' | 'unknown';
  /** 'floor' = floor-level horizontal, 'wall' = vertical, 'elevated' = above-floor horizontal (table etc.) */
  classification: 'floor' | 'wall' | 'elevated';
  area: number;
}

export interface PlaneDetectionResult {
  /** Live map — mutated by the observables. Read it any time. */
  planes: Map<number, DetectedPlane>;
  /** Estimated AR floor height. NaN until a horizontal plane is seen. */
  getFloorY: () => number;
  /** True once at least one plane has been accepted. */
  isSurfaceDetected: () => boolean;
  /** Dispose all created meshes and stop tracking. */
  dispose: () => void;
  /** Current camera Y — used for plane plausibility checks (set each frame). */
  setCameraY: (y: number) => void;
}

// ——————————————————————— Geometry helpers ———————————————————————

function computePolygonArea(
  verts: {x: number; y: number; z: number}[],
): number {
  let area = 0;
  for (let i = 1; i < verts.length - 1; i++) {
    const v0 = verts[0],
      v1 = verts[i],
      v2 = verts[i + 1];
    const ax = v1.x - v0.x,
      ay = v1.y - v0.y,
      az = v1.z - v0.z;
    const bx = v2.x - v0.x,
      by = v2.y - v0.y,
      bz = v2.z - v0.z;
    const cx = ay * bz - az * by,
      cy = az * bx - ax * bz,
      cz = ax * by - ay * bx;
    area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
  }
  return area;
}

function polygonToVertexData(verts: {x: number; y: number; z: number}[]): {
  positions: number[];
  indices: number[];
} {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const v of verts) {
    positions.push(v.x, v.y, v.z);
  }
  for (let i = 1; i < verts.length - 1; i++) {
    indices.push(0, i, i + 1);
  }
  return {positions, indices};
}

// ——————————————————————— Mesh builders ———————————————————————

function createVisualMesh(
  id: number,
  verts: any[],
  isVertical: boolean,
  scene: Scene,
): Mesh {
  const {positions, indices} = polygonToVertexData(verts);

  const mesh = new Mesh(`plane_vis_${id}`, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  mesh.createNormals(false);

  const mat = new StandardMaterial(`plane_vis_mat_${id}`, scene);
  if (isVertical) {
    mat.diffuseColor = new Color3(0.3, 0.5, 1.0);
    mat.emissiveColor = new Color3(0.08, 0.15, 0.3);
  } else {
    mat.diffuseColor = new Color3(0.0, 0.8, 0.5);
    mat.emissiveColor = new Color3(0.0, 0.2, 0.1);
  }
  mat.alpha = 0.22;
  mat.backFaceCulling = false;
  mat.disableLighting = true;
  mat.disableDepthWrite = true;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;

  return mesh;
}

function createEdgeMesh(
  id: number,
  verts: any[],
  isVertical: boolean,
  scene: Scene,
): Mesh {
  const points = verts.map((v: any) => new Vector3(v.x, v.y, v.z));
  points.push(new Vector3(verts[0].x, verts[0].y, verts[0].z)); // close loop

  const mesh = MeshBuilder.CreateLines(
    `plane_edge_${id}`,
    {points},
    scene,
  );
  mesh.color = isVertical
    ? new Color3(0.5, 0.7, 1.0)
    : new Color3(0.0, 1.0, 0.7);
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;
  mesh.alpha = 0.6;

  return mesh;
}

function createOccluderMesh(
  id: number,
  verts: any[],
  scene: Scene,
): Mesh {
  const {positions, indices} = polygonToVertexData(verts);

  const mesh = new Mesh(`plane_occ_${id}`, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  mesh.createNormals(false);

  const mat = new StandardMaterial(`plane_occ_mat_${id}`, scene);
  mat.disableColorWrite = true;
  mat.forceDepthWrite = true;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.zOffset = OCCLUDER_Z_OFFSET;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.renderingGroupId = 0; // same group as camera feed so depth is shared

  return mesh;
}

// ——————————————————————— Transform helper ———————————————————————

function applyTransform(
  planeData: any,
  ...meshes: (Mesh | null)[]
): void {
  for (const m of meshes) {
    if (!m) {
      continue;
    }
    m.rotationQuaternion = m.rotationQuaternion || Quaternion.Identity();
    planeData.transformationMatrix.decompose(
      m.scaling,
      m.rotationQuaternion,
      m.position,
    );
  }
}

// ——————————————————————— Disposal helper ———————————————————————

function disposePlane(plane: DetectedPlane): void {
  if (!plane.visualMesh.isDisposed()) {
    plane.visualMesh.dispose();
  }
  if (!plane.edgeMesh.isDisposed()) {
    plane.edgeMesh.dispose();
  }
  if (plane.occluder && !plane.occluder.isDisposed()) {
    plane.occluder.dispose();
  }
}

// ——————————————————————— Main entry point ———————————————————————

export function setupPlaneDetection(config: {
  xr: any;
  scene: Scene;
  /** Create depth-only occluders for vertical planes (default: true). */
  enableOccluders?: boolean;
}): PlaneDetectionResult {
  const {xr, scene} = config;
  const enableOccluders = config.enableOccluders !== false;

  const planes = new Map<number, DetectedPlane>();
  let floorY = NaN;
  let surfaceDetected = false;
  let cameraY = 0; // set each frame by App.tsx for plausibility checks

  // ——— Enable the WebXR feature ———
  const featureOptions = {
    worldParentNode: undefined,
    doNotRemovePlanesOnSessionEnded: false,
    preferredDetectorOptions: {
      allow: ['horizontal', 'vertical', 'any'],
    },
  };

  let detector: WebXRPlaneDetector | null = null;
  try {
    detector = xr.baseExperience.featuresManager.enableFeature(
      WebXRFeatureName.PLANE_DETECTION,
      'stable',
      featureOptions,
    ) as WebXRPlaneDetector;
  } catch {
    try {
      detector = xr.baseExperience.featuresManager.enableFeature(
        WebXRFeatureName.PLANE_DETECTION,
        'latest',
        featureOptions,
      ) as WebXRPlaneDetector;
    } catch (e: any) {
      log('WARN', `Plane detection unavailable: ${e?.message || e}`);
    }
  }

  // If the feature isn't available, return a no-op result
  if (!detector) {
    return {
      planes,
      getFloorY: () => floorY,
      isSurfaceDetected: () => surfaceDetected,
      setCameraY: (_y: number) => {},
      dispose: () => {},
    };
  }

  log('INFO', 'AR: Plane detection enabled');

  // ——— Normal-vector extraction from transform matrix ———
  // Returns the world-space up-vector of the plane (i.e. the plane's local Y axis).
  function getPlaneNormal(planeData: any): Vector3 {
    try {
      const mat: Matrix = planeData.transformationMatrix;
      // Column 1 of the rotation part = local Y axis = plane normal
      const n = new Vector3(mat.m[4], mat.m[5], mat.m[6]);
      return n.normalize();
    } catch {
      return Vector3.Up(); // safe fallback
    }
  }

  // ——— Plausibility check for horizontal planes ———
  // Returns true if this plane should be accepted.
  function isPlausibleHorizontalPlane(planeData: any): boolean {
    const normal = getPlaneNormal(planeData);
    // Normal must point predominantly upward
    const upDot = Vector3.Dot(normal, Vector3.Up());
    if (upDot < HORIZ_NORMAL_THRESHOLD) {
      log('INFO', `AR: Rejected plane (tilt, upDot=${upDot.toFixed(2)})`);
      return false;
    }
    return true;
  }

  // ——— Build / rebuild a plane from XR data ———
  function buildPlane(planeData: any): DetectedPlane | null {
    const verts = planeData.polygonDefinition;
    if (!verts || verts.length < MIN_VERTICES) {
      return null;
    }

    const area = computePolygonArea(verts);
    if (area < MIN_AREA) {
      return null;
    }

    const isVertical = planeData.xrPlane?.orientation === 'vertical';
    const orientation: DetectedPlane['orientation'] =
      planeData.xrPlane?.orientation === 'vertical'
        ? 'vertical'
        : planeData.xrPlane?.orientation === 'horizontal'
          ? 'horizontal'
          : 'unknown';

    // ——— Plausibility gate for non-vertical planes ———
    if (!isVertical) {
      // Reject planes with bad normals (tilted walls masquerading as horizontal)
      if (!isPlausibleHorizontalPlane(planeData)) {
        return null;
      }
    }

    const vis = createVisualMesh(planeData.id, verts, isVertical, scene);
    const edge = createEdgeMesh(planeData.id, verts, isVertical, scene);

    // Occluders only for VERTICAL planes.
    // Horizontal occluders would write depth at the floor level and hide
    // objects that are placed exactly on that surface.
    const occ =
      enableOccluders && isVertical
        ? createOccluderMesh(planeData.id, verts, scene)
        : null;

    applyTransform(planeData, vis, edge, occ);

    // ——— Camera-height plausibility check for horizontal planes ———
    // Reject horizontal planes that float more than MAX_PLANE_ABOVE_CAMERA above the camera.
    // This eliminates the most common class of mid-air false detections.
    if (!isVertical) {
      const planeY = vis.position.y;
      if (planeY > cameraY + MAX_PLANE_ABOVE_CAMERA) {
        log('INFO', `AR: Rejected floating horizontal plane id=${planeData.id} y=${planeY.toFixed(2)} cameraY=${cameraY.toFixed(2)}`);
        vis.dispose();
        edge.dispose();
        if (occ) occ.dispose();
        return null;
      }
    }

    // Classify the plane
    let classification: DetectedPlane['classification'];
    if (orientation === 'vertical') {
      classification = 'wall';
    } else {
      const y = vis.position.y;
      if (!Number.isFinite(floorY) || y <= floorY + FLOOR_ELEVATION_THRESHOLD) {
        classification = 'floor';
      } else {
        classification = 'elevated';
      }
    }

    // Only show visual overlays for floor + wall planes (not elevated surfaces like tables)
    if (classification === 'elevated') {
      vis.isVisible = false;
      edge.isVisible = false;
    }

    return {visualMesh: vis, edgeMesh: edge, occluder: occ, orientation, classification, area};
  }

  // ——— Reclassify all planes based on current floorY ———
  function reclassifyPlanes(): void {
    planes.forEach((p) => {
      if (p.orientation === 'vertical') return;
      const y = p.visualMesh.position.y;
      if (Number.isFinite(floorY) && y > floorY + FLOOR_ELEVATION_THRESHOLD) {
        p.classification = 'elevated';
        if (!p.visualMesh.isDisposed()) p.visualMesh.isVisible = false;
        if (!p.edgeMesh.isDisposed()) p.edgeMesh.isVisible = false;
      } else {
        p.classification = 'floor';
        if (!p.visualMesh.isDisposed()) p.visualMesh.isVisible = true;
        if (!p.edgeMesh.isDisposed()) p.edgeMesh.isVisible = true;
      }
    });
  }

  // ——— Floor Y estimation ———
  function updateFloorY(plane: DetectedPlane): void {
    if (plane.orientation === 'vertical') {
      return;
    }
    const y = plane.visualMesh.position.y;
    const prevFloorY = floorY;
    if (!Number.isFinite(floorY)) {
      // First horizontal plane — use as floor estimate
      floorY = y;
    } else if (y < floorY - 0.05) {
      // Found a lower plane — likely the actual floor
      floorY = y;
    } else if (Math.abs(y - floorY) < 0.15) {
      // Close to current floor estimate — average for stability
      floorY = (floorY + y) / 2;
    }
    // Reclassify existing planes if floorY changed
    if (prevFloorY !== floorY) {
      reclassifyPlanes();
    }
  }

  // ——— Observables ———

  detector.onPlaneAddedObservable.add((planeData: any) => {
    if (planes.size >= MAX_PLANES) {
      return;
    }

    const p = buildPlane(planeData);
    if (!p) {
      return;
    }

    planes.set(planeData.id, p);
    surfaceDetected = true;
    updateFloorY(p);
    log(
      'INFO',
      `AR: Plane added id=${planeData.id} ${p.orientation} ` +
        `area=${p.area.toFixed(2)}m² y=${p.visualMesh.position.y.toFixed(2)}`,
    );
  });

  detector.onPlaneUpdatedObservable.add((planeData: any) => {
    // Dispose old representation if it exists
    const existing = planes.get(planeData.id);
    if (existing) {
      disposePlane(existing);
      planes.delete(planeData.id);
    }

    if (planes.size >= MAX_PLANES) {
      return;
    }

    const p = buildPlane(planeData);
    if (!p) {
      return;
    }

    planes.set(planeData.id, p);
    updateFloorY(p);
  });

  detector.onPlaneRemovedObservable.add((planeData: any) => {
    const existing = planes.get(planeData.id);
    if (existing) {
      disposePlane(existing);
      planes.delete(planeData.id);
    }
    log('INFO', `AR: Plane removed id=${planeData.id}`);
  });

  // ——— Periodic status log ———
  let frameCount = 0;
  xr.baseExperience.sessionManager.onXRFrameObservable.add(() => {
    if (++frameCount % 300 === 0) {
      log(
        'INFO',
        `AR: Planes=${planes.size} floorY=${
          Number.isFinite(floorY) ? floorY.toFixed(2) : '?'
        }`,
      );
    }
  });

  // ——— Return result ———
  return {
    planes,
    getFloorY: () => floorY,
    isSurfaceDetected: () => surfaceDetected,
    setCameraY: (y: number) => { cameraY = y; },
    dispose: () => {
      planes.forEach(p => disposePlane(p));
      planes.clear();
      log('INFO', 'Plane detection disposed');
    },
  };
}
