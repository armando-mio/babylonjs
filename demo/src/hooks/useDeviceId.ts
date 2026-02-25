import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'my_app_persistent_device_id';

// Funzione che genera un UUID casuale
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  try {
    // 1. Prova a leggere l'ID dal portachiavi di sistema (sopravvive agli aggiornamenti)
    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    
    // 2. Se non esiste, crealo e salvalo in cassaforte
    if (!deviceId) {
      deviceId = generateUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }
    
    return deviceId;
  } catch (error) {
    console.warn('Errore SecureStore:', error);
    return 'unknown-device';
  }
}

export function useDeviceId(): string | null {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  return deviceId;
}