const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Aggiungi qui le estensioni per i modelli 3D e texture
    assetExts: [...defaultConfig.resolver.assetExts, 'glb', 'gltf', 'png', 'jpg'],
    sourceExts: [...defaultConfig.resolver.sourceExts, 'js', 'jsx', 'json', 'ts', 'tsx'],
  },
};
module.exports = mergeConfig(getDefaultConfig(__dirname), config);
 a