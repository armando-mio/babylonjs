/**
 * occlusion.ts — AR / VR Rendering-Group Configuration
 *
 * BabylonJS uses "rendering groups" to control draw order and depth
 * buffer management.  This module centralises the configuration so
 * it is consistent across AR entry, VR entry, and XR exit.
 *
 * Layout
 * ──────
 *   Group 0  Camera feed / background sky
 *            Vertical-plane occluders live here (depth-only, no colour).
 *
 *   Group 1  All 3-D content: placed objects, plane visuals, AR grid,
 *            shadow ground, VR world elements.
 *
 *   Group 2  UI overlays (hit-test reticle) — always rendered on top.
 *
 * AR mode
 * ───────
 *   Group 0 auto-clears normally.
 *   Group 1 does NOT clear depth → content respects occluder depth
 *   from group 0, giving wall occlusion while still rendering
 *   on top of the camera feed.
 *   Group 2 auto-clears → reticle drawn on top of everything.
 *
 * VR mode
 * ───────
 *   All groups auto-clear (standard rendering).
 */

import {Scene} from '@babylonjs/core';
import {log} from '../logger';

/**
 * Configure rendering groups for AR.
 */
export function configureARRendering(scene: Scene): void {
  scene.setRenderingAutoClearDepthStencil(0, true, true, true);
  scene.setRenderingAutoClearDepthStencil(1, false, false, false);
  scene.setRenderingAutoClearDepthStencil(2, true, true, true);
  log('INFO', 'AR: Rendering groups configured for occlusion');
}

/**
 * Configure rendering groups for VR.
 */
export function configureVRRendering(scene: Scene): void {
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;
  scene.setRenderingAutoClearDepthStencil(0, true, true, true);
  scene.setRenderingAutoClearDepthStencil(1, true, true, true);
  scene.setRenderingAutoClearDepthStencil(2, true, true, true);
  log('INFO', 'VR: Rendering groups configured');
}

/**
 * Reset rendering groups to default (all auto-clear).
 * Call when exiting any XR mode.
 */
export function resetRendering(scene: Scene): void {
  scene.setRenderingAutoClearDepthStencil(0, true, true, true);
  scene.setRenderingAutoClearDepthStencil(1, true, true, true);
  scene.setRenderingAutoClearDepthStencil(2, true, true, true);
}
