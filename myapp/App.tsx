import React, { useState, useEffect, useCallback } from 'react';
import { View, Button, Text, StyleSheet, PermissionsAndroid, Platform, LogBox } from 'react-native';
// Usa SafeAreaProvider per evitare crash di layout
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { EngineView, useEngine } from '@babylonjs/react-native';
import { Scene, Vector3, Color3, FreeCamera, HemisphericLight, MeshBuilder, StandardMaterial, WebXRFeatureName, Texture, AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders'; 

declare const navigator: any;
if (!navigator.mediaDevices) navigator.mediaDevices = {};
if (!navigator.mediaDevices.getUserMedia) navigator.mediaDevices.getUserMedia = () => Promise.resolve({});
LogBox.ignoreLogs(['SafeAreaView']);

const App = () => {
  const engine = useEngine();
  const [scene, setScene] = useState<Scene | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [status, setStatus] = useState("Controllo Permessi...");
  const [cubeMesh, setCubeMesh] = useState<AbstractMesh | null>(null);

  // 1. Permessi
  useEffect(() => {
    const checkPerms = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          setPermissionGranted(true);
          setStatus("Permessi OK. Caricamento Motore...");
        } else {
          setStatus("ERRORE: Camera negata!");
        }
      } else {
        setPermissionGranted(true);
      }
    };
    checkPerms();
  }, []);

  // 2. Motore Base (No AR all'inizio)
  useEffect(() => {
    if (engine && permissionGranted) {
      try {
        const newScene = new Scene(engine);
        newScene.createDefaultCameraOrLight(true, true, true);
        newScene.clearColor = new Color3(0.2, 0.2, 0.2).toColor4();
        
        const box = MeshBuilder.CreateBox("box", { size: 0.3 }, newScene);
        const mat = new StandardMaterial("mat", newScene);
        mat.diffuseColor = Color3.Red();
        box.material = mat;
        setCubeMesh(box);
        
        setScene(newScene);
        setStatus("MOTORE PRONTO. Premi 'Entra in AR'");
      } catch (e) {
        setStatus("Errore JS: " + e);
      }
    }
  }, [engine, permissionGranted]);

  const startAR = useCallback(async () => {
    if (!scene) return;
    try {
      setStatus("Avvio AR...");
      const xr = await scene.createDefaultXRExperienceAsync({
        uiOptions: { sessionMode: 'immersive-ar' },
        optionalFeatures: true,
      });
      
      const fm = xr.baseExperience.featuresManager;
      try { fm.enableFeature(WebXRFeatureName.PLANE_DETECTION, "latest"); } catch (e) {}
      fm.enableFeature(WebXRFeatureName.HIT_TEST, "latest");

      xr.baseExperience.sessionManager.onXRSessionInit.add(() => {
        setCameraActive(true);
        setStatus("AR ATTIVA! Inquadra il pavimento.");
        if(cubeMesh) cubeMesh.isVisible = false;
      });

      scene.onPointerDown = (evt, pickInfo) => {
        if (pickInfo.hit && pickInfo.pickedPoint && cubeMesh) {
          cubeMesh.position.copyFrom(pickInfo.pickedPoint);
          cubeMesh.isVisible = true;
          setStatus("Cubo Piazzato!");
        }
      };
    } catch (e) {
      setStatus("Errore ARCore: " + e);
    }
  }, [scene, cubeMesh]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
        <View style={{ flex: 1, borderWidth: 2, borderColor: engine ? 'green' : 'red' }}>
          <EngineView camera={undefined} displayFrameRate={true} style={{flex: 1}} />
          <View style={styles.overlay}>
            <Text style={styles.text}>{status}</Text>
            {!cameraActive && (
              <Button title="ENTRA IN AR" onPress={startAR} disabled={!scene} color="#2196F3" />
            )}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  overlay: { position: 'absolute', bottom: 50, left: 20, right: 20, alignItems: 'center', gap: 10 },
  text: { color: 'white', backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 8, textAlign: 'center', fontWeight: 'bold' }
});

export default App;