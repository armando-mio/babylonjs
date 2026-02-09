import React, { useState, useEffect } from 'react';
import { 
  View, 
  Button, 
  StyleSheet, 
  Text, 
  SafeAreaView, 
  PermissionsAndroid, 
  Platform,
  LogBox 
} from 'react-native';
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
  Texture,
  AbstractMesh
} from '@babylonjs/core';
import '@babylonjs/loaders'; 

// --- FIX ANTI-CRASH PER BABYLON ---
declare const navigator: any;
if (!navigator.mediaDevices) {
  navigator.mediaDevices = {};
}
if (!navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices.getUserMedia = () => Promise.resolve({});
}

// Nascondiamo i warning della UI
LogBox.ignoreLogs(['SafeAreaView']);

const App = () => {
  const engine = useEngine();
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [status, setStatus] = useState("Richiesta permessi...");
  const [cubeMesh, setCubeMesh] = useState<AbstractMesh | null>(null);

  // 1. GESTIONE PERMESSI (Android)
  useEffect(() => {
    const getPerms = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            setPermissionGranted(true);
            setStatus("Avvio Motore 3D...");
        } else {
            setStatus("Permesso negato! Impossibile usare AR.");
        }
      } else {
        setPermissionGranted(true);
      }
    };
    getPerms();
  }, []);

  // 2. LOGICA 3D E AR
  useEffect(() => {
    if (engine && permissionGranted) {
      const scene = new Scene(engine);

      // Camera e Luce (Base)
      const camera = new FreeCamera('camera1', new Vector3(0, 5, -10), scene);
      camera.setTarget(Vector3.Zero());
      const light = new HemisphericLight('light1', new Vector3(0, 1, 0), scene);
      light.intensity = 1.0;

      // Oggetto Cubo (Invisibile all'inizio)
      const box = MeshBuilder.CreateBox("box", { size: 0.2 }, scene);
      box.isVisible = false; 
      
      const mat = new StandardMaterial("mat", scene);
      mat.diffuseColor = Color3.Red();
      box.material = mat;
      setCubeMesh(box);

      // AVVIO SESSIONE AR
      const initAR = async () => {
        try {
          const xr = await scene.createDefaultXRExperienceAsync({
            uiOptions: { sessionMode: 'immersive-ar' },
            optionalFeatures: true,
          });

          const fm = xr.baseExperience.featuresManager;

          // A. Plane Detection (Visualizza i piani)
          try {
            fm.enableFeature(WebXRFeatureName.PLANE_DETECTION, "latest");
          } catch (e) { console.log("Plane detection non disponibile"); }

          // B. Hit Test (Rileva tocco su superfici)
          const hitTest = fm.enableFeature(WebXRFeatureName.HIT_TEST, "latest");

          // Quando l'AR è pronta
          xr.baseExperience.sessionManager.onXRSessionInit.add(() => {
            setCameraActive(true);
            setStatus("Inquadra il pavimento e tocca!");
          });

          // C. Gestione Tocco (Piazzamento)
          scene.onPointerDown = (evt, pickInfo) => {
            if (pickInfo.hit && pickInfo.pickedPoint) {
              box.position.copyFrom(pickInfo.pickedPoint);
              box.isVisible = true;
              setStatus("Oggetto piazzato!");
            }
          };

        } catch (e) {
          setStatus("Errore AR (Manca ARCore?): " + e);
        }
      };

      initAR();
    }
  }, [engine, permissionGranted]);

  // 3. CAMBIO TEXTURE
  const changeTexture = () => {
    if (cubeMesh && cubeMesh.material) {
        const mat = cubeMesh.material as StandardMaterial;
        // Carica texture legno
        const tex = new Texture("https://www.babylonjs-playground.com/textures/wood.jpg", cubeMesh.getScene());
        mat.diffuseTexture = tex;
        mat.diffuseColor = Color3.White(); 
        setStatus("Texture cambiata: Legno");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
      <View style={{ flex: 1 }}>
        <EngineView camera={undefined} displayFrameRate={true} />
        
        <View style={styles.overlay}>
            <Text style={styles.text}>{status}</Text>
            <Button 
                title="Cambia Texture" 
                onPress={changeTexture} 
                disabled={!cameraActive}
                color="#841584"
            />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center'
  },
  text: {
    color: 'white',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 16,
    fontWeight: 'bold'
  }
});

export default App;