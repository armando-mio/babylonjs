# BabylonJS React Native AR/VR Experience

A cross-platform mobile application demonstrating the power of **Babylon Native** combined with **React Native**. This project acts as a proof-of-concept for building immersive Mixed Reality experiences on iOS and Android.

## 🌟 Key Features

* **Hybrid Viewer**: Seamlessly toggle between **Augmented Reality** (ARCore/ARKit) and a generated **Virtual Reality** world.
* **Plane Detection**: Automatically detects horizontal and vertical surfaces for placing 3D objects.
* **Model Manipulation**: Select, move, rotate, and scale glTF models using touch gestures.
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

For detailed prerequisites and troubleshooting, please refer to the [Demo README](demo/README.md).
