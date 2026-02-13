/// <reference types="jest" />

/**
 * Test suite per i custom hooks: useGPS, useCompass
 *
 * NOTE: useGPS depends on PermissionsAndroid which checks Platform.OS at runtime.
 * The react-native jest preset defaults Platform.OS to 'ios', causing
 * PermissionsAndroid.request to always return DENIED.  We work around this by
 * testing useGPS behavior through its exported refs and mocking at the
 * PermissionsAndroid level.
 */

import React from 'react';
import {View, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';

// ===== Module-level mocks (hoisted by Jest) =====

// Mock @babylonjs/core (needed by constants.ts import chain)
jest.mock('@babylonjs/core', () => {
  const Color3 = jest.fn().mockImplementation((r: number, g: number, b: number) => ({r, g, b}));
  const Vector3 = jest.fn().mockImplementation((x: number, y: number, z: number) => ({x, y, z}));
  return {Color3, Vector3, AbstractMesh: jest.fn(), TransformNode: jest.fn()};
});

// Mock suncalc (imported by constants.ts)
jest.mock('suncalc', () => ({
  getPosition: jest.fn().mockReturnValue({azimuth: 0.5, altitude: 0.8}),
}));

// Mock Geolocation
const mockGetCurrentPosition = jest.fn();
jest.mock('react-native-geolocation-service', () => ({
  getCurrentPosition: mockGetCurrentPosition,
}));

// Mock CompassHeading — store the callback without firing it synchronously
let compassCallback: ((data: {heading: number; accuracy: number}) => void) | null = null;
jest.mock('react-native-compass-heading', () => ({
  start: jest.fn((_rate: number, cb: (data: {heading: number; accuracy: number}) => void) => {
    compassCallback = cb;
  }),
  stop: jest.fn(),
}));

// Mock logger
jest.mock('../src/logger', () => ({log: jest.fn()}));

import {useGPS} from '../src/hooks/useGPS';
import {useCompass} from '../src/hooks/useCompass';

// ====== GPS test helper ======
function GPSTestHelper(props: {onResult: (r: any) => void}) {
  const result = useGPS();
  React.useEffect(() => { props.onResult(result); }, []);
  return <View><Text>GPS</Text></View>;
}

// ====== Compass test helper ======
function CompassTestHelper(props: {onResult: (r: any) => void}) {
  const result = useCompass();
  React.useEffect(() => { props.onResult(result); });
  return <View><Text>{String(result.compassHeading)}</Text></View>;
}

// =====================================================================
//  useGPS
// =====================================================================
describe('useGPS', () => {
  beforeEach(() => {
    mockGetCurrentPosition.mockReset();
  });

  test('restituisce deviceLatRef, deviceLonRef e deviceLocationReady', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<GPSTestHelper onResult={r => { hookResult = r; }} />);
      await new Promise<void>(r => setTimeout(r, 50));
    });
    expect(hookResult).toBeDefined();
    expect(hookResult).toHaveProperty('deviceLatRef');
    expect(hookResult).toHaveProperty('deviceLonRef');
    expect(hookResult).toHaveProperty('deviceLocationReady');
  });

  test('i ref sono oggetti MutableRefObject', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<GPSTestHelper onResult={r => { hookResult = r; }} />);
      await new Promise<void>(r => setTimeout(r, 50));
    });
    expect(hookResult.deviceLatRef).toHaveProperty('current');
    expect(hookResult.deviceLonRef).toHaveProperty('current');
    expect(hookResult.deviceLocationReady).toHaveProperty('current');
  });

  test('valori iniziali sono le coordinate di fallback (Treviso)', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<GPSTestHelper onResult={r => { hookResult = r; }} />);
      await new Promise<void>(r => setTimeout(r, 50));
    });
    expect(hookResult.deviceLatRef.current).toBeCloseTo(45.957, 2);
    expect(hookResult.deviceLonRef.current).toBeCloseTo(12.657, 2);
    expect(hookResult.deviceLocationReady.current).toBe(false);
  });

  test('deviceLatRef e deviceLonRef sono numeri', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<GPSTestHelper onResult={r => { hookResult = r; }} />);
      await new Promise<void>(r => setTimeout(r, 50));
    });
    expect(typeof hookResult.deviceLatRef.current).toBe('number');
    expect(typeof hookResult.deviceLonRef.current).toBe('number');
  });

  test('coordinate fallback sono nel range valido', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<GPSTestHelper onResult={r => { hookResult = r; }} />);
      await new Promise<void>(r => setTimeout(r, 50));
    });
    expect(hookResult.deviceLatRef.current).toBeGreaterThanOrEqual(-90);
    expect(hookResult.deviceLatRef.current).toBeLessThanOrEqual(90);
    expect(hookResult.deviceLonRef.current).toBeGreaterThanOrEqual(-180);
    expect(hookResult.deviceLonRef.current).toBeLessThanOrEqual(180);
  });
});

// NOTE: Integration test per GPS con permesso concesso non è possibile in Jest
// perché PermissionsAndroid usa internamente Platform.OS (auto-mocked come 'ios')
// e il modulo NativePermissionsAndroid non è disponibile nell'ambiente di test.
// La verifica del flusso GPS completo avviene tramite test E2E sul dispositivo.

// =====================================================================
//  useCompass
// =====================================================================
describe('useCompass', () => {
  const CompassHeading = require('react-native-compass-heading');

  beforeEach(() => {
    jest.clearAllMocks();
    compassCallback = null;
  });

  test('restituisce compassHeading e compassSubActiveRef', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<CompassTestHelper onResult={r => { hookResult = r; }} />);
    });
    expect(hookResult).toBeDefined();
    expect(hookResult).toHaveProperty('compassHeading');
    expect(hookResult).toHaveProperty('compassSubActiveRef');
  });

  test('compassHeading iniziale è 0', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<CompassTestHelper onResult={r => { hookResult = r; }} />);
    });
    expect(hookResult.compassHeading).toBe(0);
  });

  test('chiama CompassHeading.start al mount', async () => {
    await act(async () => {
      renderer.create(<CompassTestHelper onResult={() => {}} />);
    });
    expect(CompassHeading.start).toHaveBeenCalledWith(3, expect.any(Function));
  });

  test('aggiorna heading quando riceve dati', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<CompassTestHelper onResult={r => { hookResult = r; }} />);
    });
    expect(hookResult.compassHeading).toBe(0);

    // Simulate compass data arriving
    await act(async () => {
      if (compassCallback) compassCallback({heading: 180, accuracy: 1});
    });
    expect(hookResult.compassHeading).toBe(180);
  });

  test('heading si aggiorna a valori diversi', async () => {
    let hookResult: any;
    await act(async () => {
      renderer.create(<CompassTestHelper onResult={r => { hookResult = r; }} />);
    });

    await act(async () => {
      if (compassCallback) compassCallback({heading: 90, accuracy: 1});
    });
    expect(hookResult.compassHeading).toBe(90);

    await act(async () => {
      if (compassCallback) compassCallback({heading: 270, accuracy: 1});
    });
    expect(hookResult.compassHeading).toBe(270);
  });

  test('chiama CompassHeading.stop all\'unmount', async () => {
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<CompassTestHelper onResult={() => {}} />);
    });
    await act(async () => {
      tree!.unmount();
    });
    expect(CompassHeading.stop).toHaveBeenCalled();
  });
});
