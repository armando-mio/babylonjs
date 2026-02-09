# Demo AR App

This React Native application showcases a Babylon Native powered augmented reality experience that runs on both Android (ARCore) and iOS (ARKit).

## Features

- Loads and renders a glTF model in an immersive AR session.
- Detects horizontal and vertical planes with visual highlights.
- Places the model at the hit-test position of each screen tap.
- Provides selectable texture presets for the model while in AR.
- Requests camera and motion permissions automatically via `react-native-permissions`.

## Prerequisites

- Node.js 18+
- Yarn or npm (npm is used in the scripts below)
- Android Studio with an ARCore-capable emulator or physical device
- Xcode 15+ with an ARKit-capable device (AR requires a physical device)

## Getting Started

```sh
cd demo
npm install
```

### iOS

```sh
cd ios
pod install
cd ..
npx react-native run-ios --device
```

> Apple requires a real device that supports ARKit; the iOS simulator cannot render AR content.

### Android

```sh
npx react-native run-android
```

Ensure the connected device or emulator supports ARCore. For physical hardware, install Google Play Services for AR if prompted.

## Usage

1. Launch the app; grant the camera and motion permission prompts.
2. Move the device slowly to allow ARCore/ARKit to detect surfaces.
3. Highlighted planes appear as translucent quads. Tap one to place the helmet model.
4. Use the texture buttons to swap surface materials in real time.
5. Tap another plane to reposition the model.

## Notes

- The minimum Android SDK is set to 24 to satisfy ARCore requirements.
- `UIRequiredDeviceCapabilities` includes `arkit`, `camera`, and `gyroscope` so the app only installs on AR-capable iOS devices.
- The AR session is transparent, so other React Native UI can be layered above the Babylon scene.
