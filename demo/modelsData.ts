// ================= MODELS DATA =================
export interface ModelData {
  id: string;
  name: string;
  fileName: string; // GLB filename in android/app/src/main/assets/
  thumbnail: string; // emoji placeholder
  description: string;
  scale: number; // default scale multiplier
  url?: string; // Optional URL for remote models (e.g., from RoomScan server)
}

export const AR_MODELS: ModelData[] = [
  {
    id: 'football_ball',
    name: 'Football Ball',
    fileName: 'football_ball.glb',
    thumbnail: '⚽',
    description: '3D Football (ball)',
    scale: 1.0,
  },
  {
    id: 'football_shirt_barcelona',
    name: 'FC Barcelona Shirt',
    fileName: 'football_shirt_fc_barcelona.glb',
    thumbnail: '👕',
    description: 'FC Barcelona football shirt',
    scale: 1.0,
  },
];
