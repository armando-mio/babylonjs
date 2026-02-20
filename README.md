# BabylonJS React Native AR/VR Experience

A cross-platform mobile application demonstrating the power of **Babylon Native** combined with **React Native**. This project acts as a proof-of-concept for building immersive Mixed Reality experiences on iOS and Android.

## 🌟 Key Features

* **Hybrid Viewer**: Seamlessly toggle between **Augmented Reality** (ARCore/ARKit) and a generated **Virtual Reality** world.
* **Plane Detection**: Automatically detects horizontal and vertical surfaces for placing 3D objects.
* **Model Manipulation**: Select, move, rotate, and scale .glb models using touch gestures.
* **Runtime Customization**: Edit textures and materials of placed objects in real-time.
* **Geo-Lighting**: Calculates the sun's position based on your device's **GPS coordinates** and **Compass heading** for realistic lighting.

## 📂 Project Structure

* **`demo/`**: Contains the main React Native application source code, including the BabylonJS engine setup and UI components.

## 🚀 Getting Started

The application logic is located in the `demo` directory. To run the app:

1.  **Navigate to the demo folder:**
    ```bash
    cd demo
    npm install
    ```

2.  **Run on iOS:**
    ```bash
    cd ios && pod install && cd ..
    npx react-native run-ios
    ```
    *(Note: AR features require a physical iOS device)*

3.  **Run on Android:**
    ```bash
    npx react-native run-android
    ```

HOW TO BUILD IN XCODE (for iOS): 
- In demo/node_modules/react-native/third-party-podspecs/boost.podspec change url into 'https://archives.boost.io/release/...'
- In XCODE > Pods (blue icon) > TARGETS > React-Core > Change iOS version to '17.0'
- In XCODE > Pods (blue icon) > TARGETS > react-native-compass-heading > Change iOS version to '17.0'
- Activate Metro Server in terminal (only if you are in debug mode, otherwise it starts by itself):
    ```bash
    cd demo
    npx react-native start
    ```
- Delete the app from the iPhone before rebuilding it 
- Compile on XCode

HOW TO REBUILD IN XCODE (for iOS):
- Execute these commands in demo/ios
    ```bash
    rm -rf ~/Library/Developer/Xcode/DerivedData/* // type 'y' when you are asked
    rm -rf Pods
    rm Podfile.lock
    bundle exec pod install
    ```

HOW TO CONNECT TO THE SERVER:
- Start a new terminal and execute 
    ```bash 
    npx ngrok http 3001
    ```
- Copy the URL (e.g. https://a1b2-c3d4.ngrok-free.app).
- Paste the URL in demo/src/constants.ts in this line: export const ROOM_SCAN_SERVER_URL = '...'.
    ```typescript
    export const ROOM_SCAN_SERVER_URL = 'https://a1b2-c3d4.ngrok-free.app';
    ```

For detailed prerequisites and troubleshooting, please refer to the [Demo README](demo/README.md).
