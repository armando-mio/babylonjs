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
  AbstractMesh,
  WebXRPlaneDetector
} from '@babylonjs/core';
import '@babylonjs/loaders'; 

// --- 1. FIX PER EVITARE CRASH SU REACT NATIVE ---
// Definiamo navigator per TypeScript
declare const navigator: any;

// Creiamo un "finto" browser environment perché Babylon native lo cerca all'avvio
if (!navigator.mediaDevices) {
  navigator.mediaDevices = {};
}
if (!navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices.getUserMedia = () => Promise.resolve({});
}

// Ignoriamo i warning non critici della UI
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);


const App = () => {
  const engine = useEngine();
  const [cameraActive, setCameraActive] = useState(false);
  const [modelMesh, setModelMesh] = useState<AbstractMesh | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [statusText, setStatusText] = useState("Inizializzazione...");

  // --- 2. GESTIONE PERMESSI ANDROID ---
  useEffect(() => {
    const checkPerms = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        setPermissionGranted(granted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setPermissionGranted(true); // iOS gestisce i permessi via Info.plist
      }
    };
    checkPerms();
  }, []);

  // --- 3. INIZIALIZZAZIONE MOTORE 3D E AR ---
  useEffect(() => {
    if (engine && permissionGranted) {
      const scene = new Scene(engine);

      // A. Camera & Luce (Necessari per vedere qualcosa)
      const camera = new FreeCamera('camera1', new Vector3(0, 5, -10), scene);
      camera.setTarget(Vector3.Zero());
      const light = new HemisphericLight('light1', new Vector3(0, 1, 0), scene);
      light.intensity = 1.0;

      // B. Creazione Modello (Inizialmente nascosto)
      // Usiamo un cubo per il test, ma qui potresti usare SceneLoader.ImportMesh per un GLB
      const box = MeshBuilder.CreateBox("box", { size: 0.2 }, scene);
      box.isVisible = false; 
      
      // Materiale Iniziale (Rosso)
      const material = new StandardMaterial("boxMat", scene);
      material.diffuseColor = Color3.Red();
      box.material = material;
      
      setModelMesh(box);

      // C. Setup AR (ARCore / ARKit)
      const initAR = async () => {
        try {
          setStatusText("Avvio AR in corso...");
          
          const xr = await scene.createDefaultXRExperienceAsync({
            uiOptions: { sessionMode: 'immersive-ar' },
            optionalFeatures: true, // Richiede features extra come HitTest
          });

          const fm = xr.baseExperience.featuresManager;

          // FEATURE: Rilevamento Superfici (Plane Detection)
          // Questo farà apparire dei poligoni sulle superfici rilevate
          try {
            const planes = fm.enableFeature(WebXRFeatureName.PLANE_DETECTION, "latest");
            // Opzionale: puoi nascondere i piani se vuoi solo l'hit test, ma per debug è utile vederli
          } catch (e) {
            console.log("Plane detection non supportata");
          }

          // FEATURE: Hit Test (Posizionamento al Click)
          const hitTest = fm.enableFeature(WebXRFeatureName.HIT_TEST, "latest");

          // Quando la sessione AR è pronta e attiva
          xr.baseExperience.sessionManager.onXRSessionInit.add(() => {
            setCameraActive(true);
            setStatusText("Inquadra il pavimento e tocca per piazzare");
          });

          // D. Logica di Posizionamento (Click)
          scene.onPointerDown = (evt, pickInfo) => {
            if (pickInfo.hit && pickInfo.pickedPoint) {
                // Sposta il cubo dove abbiamo cliccato
                box.position.copyFrom(pickInfo.pickedPoint);
                
                // Ruota il cubo se necessario (opzionale)
                // box.rotationQuaternion = ... 

                // Rendilo visibile
                box.isVisible = true;
                
                setStatusText("Oggetto piazzato!");
            }
          };

        } catch (e) {
          console.error("Errore critico AR:", e);
          setStatusText("Errore avvio AR: " + e);
        }
      };

      initAR();
    }
  }, [engine, permissionGranted]);

  // --- 4. FUNZIONE CAMBIO TEXTURE (Virtual Environment) ---
  const changeTexture = () => {
    if (modelMesh && modelMesh.material) {
        const mat = modelMesh.material as StandardMaterial;
        
        // Carica una texture da URL (Esempio: Pavimento di legno)
        // Nota: Assicurati di avere internet sul telefono
        const urlTexture = "https://www.babylonjs-playground.com/textures/wood.jpg";
        
        const newTexture = new Texture(urlTexture, modelMesh.getScene());
        
        // Applica la texture
        mat.diffuseTexture = newTexture;
        
        // Resetta il colore a bianco per non alterare la texture
        mat.diffuseColor = new Color3(1, 1, 1);
        
        setStatusText("Texture modificata: Legno");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
      <View style={{ flex: 1 }}>
        {/* VIEW 3D: Questa è la finestra su ARKit/ARCore */}
        <EngineView camera={undefined} displayFrameRate={true} />
        
        {/* UI OVERLAY: I controlli React Native */}
        <View style={styles.uiContainer}>
            <Text style={styles.statusText}>{statusText}</Text>
            
            <View style={styles.buttonContainer}>
              <Button 
                title="Cambia Texture" 
                onPress={changeTexture} 
                color="#841584"
                disabled={!cameraActive} // Attivo solo quando l'AR è partita
              />
            </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  uiContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
  }, 
  statusText: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'white',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    textAlign: 'center'
  },
  buttonContainer: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 5,
    elevation: 5
  } 
}); 

export default App;