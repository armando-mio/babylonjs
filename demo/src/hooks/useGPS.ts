import {useEffect, useRef} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {log} from '../logger';
import {FALLBACK_LATITUDE, FALLBACK_LONGITUDE} from '../constants';

export function useGPS() {
  const deviceLatRef = useRef(FALLBACK_LATITUDE);
  const deviceLonRef = useRef(FALLBACK_LONGITUDE);
  const deviceLocationReady = useRef(false);

  useEffect(() => {
    // Funzione helper per leggere la posizione (comune a iOS e Android)
    const getLocation = () => {
      Geolocation.getCurrentPosition(
        (position) => {
          deviceLatRef.current = position.coords.latitude;
          deviceLonRef.current = position.coords.longitude;
          deviceLocationReady.current = true;
          log('INFO', `📍 GPS: lat=${position.coords.latitude.toFixed(4)}, lon=${position.coords.longitude.toFixed(4)}`);
        },
        (error) => {
          log('WARN', `GPS errore: ${error.message} - uso coordinate fallback`);
        },
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
      );
    };

    const requestLocationPermission = async () => {
      try {
        if (Platform.OS === 'ios') {
          // --- Logica specifica per iOS ---
          const auth = await Geolocation.requestAuthorization('whenInUse');
          if (auth === 'granted') {
            getLocation();
          } else {
            log('WARN', `GPS permesso negato su iOS: ${auth}`);
          }
        } else {
          // --- Logica Android esistente (spostata nell'else) ---
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Permesso Posizione',
              message: "L'app ha bisogno della tua posizione per la bussola.",
              buttonPositive: 'OK',
            },
          );
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            getLocation();
          } else {
            log('WARN', 'GPS permesso negato su Android');
          }
        }
      } catch (err: any) {
        log('WARN', `GPS permesso errore: ${err.message}`);
      }
    };

    requestLocationPermission();
  }, []);

  return {deviceLatRef, deviceLonRef, deviceLocationReady};
}
