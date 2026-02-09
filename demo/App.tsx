import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView, View, Text, StyleSheet, PermissionsAndroid, Platform } from 'react-native';
import { EngineView, useEngine } from '@babylonjs/react-native';
import { 
  Scene, 
  Vector3, 
  Color3, 
  FreeCamera, 
  HemisphericLight, 
  MeshBuilder, 
  StandardMaterial, 
  WebXRFeatureName,
  Quaternion
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const App = () => {
  const engine = useEngine();
  const [camera, setCamera] = useState<FreeCamera | null>(null);
  const [status, setStatus] = useState('Avvio in corso...');
  const sceneRef = useRef<Scene | null>(null);

  useEffect(() => {
    // 1. Richiesta permessi brutale all'avvio
    const setup = async () => {
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      }
    };
    setup();
  }, []);

  useEffect(() => {
    if (!engine) return;

    // 2. Creazione scena immediata
    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.createDefaultCameraOrLight(true, true, true);
    
    // Camera base per vedere subito qualcosa (anti-black screen)
    const fallbackCam = new FreeCamera("fallback", new Vector3(0, 1, -5), scene);
    fallbackCam.setTarget(Vector3.Zero());
    setCamera(fallbackCam);

    // Luce
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // 3. Oggetti di test (Cubo Rosso) - Così vedi se funziona anche senza internet
    const box = MeshBuilder.CreateBox("box", { size: 0.2 }, scene);
    box.position = new Vector3(0, 0, 1); // Davanti a te
    const mat = new StandardMaterial("boxMat", scene);
    mat.diffuseColor = new Color3(1, 0, 0); // Rosso
    box.material = mat;

    setStatus('Motore 3D pronto. Avvio AR...');

    // 4. Avvio AR sicuro
    const startAR = async () => {
      try {
        const xr = await scene.createDefaultXRExperienceAsync({
          disableDefaultUI: true,
          disableTeleportation: true,
          uiOptions: {
            sessionMode: 'immersive-ar',
            referenceSpaceType: 'local-floor',
          },
        });

        // Se siamo qui, l'AR è partita
        setCamera(xr.baseExperience.camera);
        setStatus('AR ATTIVA! Inquadra il pavimento.');
        
        // Piano detection semplice
        const fm = xr.baseExperience.featuresManager;
        const xrPlanes = fm.enableFeature(WebXRFeatureName.PLANE_DETECTION, "latest");
        
        // Hit test semplificato
        const xrHitTest = fm.enableFeature(WebXRFeatureName.HIT_TEST, "latest");
        
        if (xrHitTest) {
            xrHitTest.onHitTestResultObservable.add((results) => {
                if (results.length) {
                    box.position.copyFrom(results[0].position);
                    box.rotationQuaternion = results[0].rotationQuaternion;
                    setStatus('Oggetto posizionato!');
                }
            });
        }

      } catch (e) {
        console.error("AR Error:", e);
        setStatus('AR non disponibile. Modalità 3D semplice.');
        // Non facciamo nulla, resta la camera 3D base così l'app non crasha
      }
    };

    // Ritardo tattico per dare tempo al motore di "scaldarsi"
    setTimeout(startAR, 1000);

  }, [engine]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
      <View style={{ flex: 1 }}>
        {/* Renderizza SEMPRE se c'è camera o engine, per evitare il loop */}
        {camera && (
            <EngineView style={{ flex: 1 }} camera={camera} androidView="SurfaceView" />
        )}
        
        <View style={styles.overlay}>
          <Text style={styles.text}>{status}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold'
  }
});

export default App;