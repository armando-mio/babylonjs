import {useEffect, useState} from 'react';
import * as FileSystem from 'expo-file-system';

const DEVICE_ID_FILE = `${FileSystem.documentDirectory}device_id.json`;

/** Genera un UUID v4 semplice */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Restituisce un deviceId persistente, generato al primo avvio */
export async function getDeviceId(): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(DEVICE_ID_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(DEVICE_ID_FILE);
      const data = JSON.parse(content);
      if (data.deviceId) return data.deviceId;
    }
  } catch (_) {}

  const deviceId = generateUUID();
  await FileSystem.writeAsStringAsync(DEVICE_ID_FILE, JSON.stringify({deviceId}));
  return deviceId;
}

/** Hook React per ottenere il deviceId */
export function useDeviceId(): string | null {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  return deviceId;
}
