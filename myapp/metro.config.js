const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // AGGIUNTA CHIRURGICA:
    // Manteniamo le estensioni standard (png, jpg, ecc.) e aggiungiamo SOLO quelle 3D.
    // Usiamo filter per evitare duplicati che rompono la build.
    assetExts: [...assetExts.filter(ext => ext !== 'glb' && ext !== 'gltf'), 'glb', 'gltf'],
    
    // Non tocchiamo sourceExts (React Native 0.76 lo gestisce già bene)
    sourceExts: sourceExts,

    // Questo blocco serve per evitare il crash "ENOENT" su Linux
    blockList: [
      /\/android\/build\/.*/,
      /\/android\/app\/build\/.*/,
      /\/node_modules\/.*\/android\/build\/.*/
    ]
  },
};

module.exports = mergeConfig(defaultConfig, config);