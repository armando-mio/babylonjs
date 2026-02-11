import {useEffect, useRef} from 'react';
import {PermissionsAndroid} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {log} from '../logger';
import {FALLBACK_LATITUDE, FALLBACK_LONGITUDE} from '../constants';

export function useGPS() {
  const deviceLatRef = useRef(FALLBACK_LATITUDE);
  const deviceLonRef = useRef(FALLBACK_LONGITUDE);
  const deviceLocationReady = useRef(false);

  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Permesso Posizione',
            message: "L'app ha bisogno della tua posizione per la posizione del sole e la bussola.",
            buttonPositive: 'OK',
          },
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
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
            {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000},
          );
        } else {
          log('WARN', 'GPS permesso negato, uso coordinate fallback');
        }
      } catch (err: any) {
        log('WARN', `GPS permesso errore: ${err.message}`);
      }
    };
    requestLocationPermission();
  }, []);

  return {deviceLatRef, deviceLonRef, deviceLocationReady};
}
