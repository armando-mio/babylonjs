import {useEffect, useRef, useState} from 'react';
// @ts-ignore — react-native-compass-heading types not resolved with current moduleResolution
import CompassHeading from 'react-native-compass-heading';
import {log} from '../logger';

export function useCompass() {
  const [compassHeading, setCompassHeading] = useState(0);
  const compassSubActiveRef = useRef(false);

  useEffect(() => {
    const degreeUpdateRate = 3;
    CompassHeading.start(degreeUpdateRate, ({heading}: {heading: number; accuracy: number}) => {
      setCompassHeading(heading);
    });
    compassSubActiveRef.current = true;
    log('INFO', '🧭 Compass heading listener avviato');
    return () => {
      CompassHeading.stop();
      compassSubActiveRef.current = false;
    };
  }, []);

  return {compassHeading, compassSubActiveRef};
}
