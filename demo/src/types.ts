import {AbstractMesh, TransformNode} from '@babylonjs/core';

export type AppScreen = 'gallery' | 'viewer' | 'roomscan';
export type ViewerMode = 'AR' | 'VR';

export interface MeshListEntry {
  name: string;
  mesh: AbstractMesh;
  sourceName: string; // which model this mesh comes from
}
