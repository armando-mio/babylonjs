// ================= MODELS DATA =================
export interface ModelData {
  id: string;
  name: string;
  fileName: string; // GLB filename in android/app/src/main/assets/
  thumbnail: string; // emoji placeholder
  description: string;
  scale: number; // default scale multiplier
  url?: string; // Optional URL for remote models (e.g., from RoomScan server)
  isHardcoded?: boolean;
}

export const AR_MODELS: ModelData[] = [];
