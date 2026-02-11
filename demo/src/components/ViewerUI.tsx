import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {EngineView} from '@babylonjs/react-native';
import {Camera, WebXRTrackingState, AbstractMesh, TransformNode} from '@babylonjs/core';
import {ModelData} from '../../modelsData';
import {MeshListEntry} from '../types';
import {TEXTURE_PRESETS, MATERIAL_PRESETS} from '../constants';
import {styles} from '../styles';

interface ViewerUIProps {
  camera: Camera | undefined;
  selectedModel: ModelData | null;
  viewerMode: string;
  status: string;
  trackingState: WebXRTrackingState | undefined;
  loadingModel: boolean;
  modelLoaded: boolean;
  sceneReady: boolean;
  surfaceDetected: boolean;
  objectsPlaced: number;
  xrSession: any;
  selectedInstance: AbstractMesh | null;
  selectedInstanceRef: React.MutableRefObject<AbstractMesh | null>;
  modelRootRef: React.MutableRefObject<TransformNode | null>;
  compassHeading: number;
  showManipulator: boolean;
  manipProperty: string | null;
  setManipProperty: (p: string | null) => void;
  manipStep: (prop: string, dir: 1 | -1) => void;
  showTexturePanel: boolean;
  setShowTexturePanel: (v: boolean | ((prev: boolean) => boolean)) => void;
  meshListForTexture: MeshListEntry[];
  selectedMeshIdx: number;
  setSelectedMeshIdx: (v: number | ((prev: number) => number)) => void;
  applyMaterialPreset: (idx: number) => void;
  applyTexturePreset: (idx: number) => void;
  applyMaterialStylePreset: (idx: number) => void;
  textureTab: 'texture' | 'material';
  setTextureTab: (tab: 'texture' | 'material') => void;
  refreshMeshList: (target?: TransformNode | null) => void;
  goBackToGallery: () => void;
  createAtCenter: () => void;
  removeSelectedInstance: () => void;
}

export const ViewerUI: React.FC<ViewerUIProps> = ({
  camera,
  selectedModel,
  viewerMode,
  status,
  trackingState,
  loadingModel,
  modelLoaded,
  sceneReady,
  surfaceDetected,
  objectsPlaced,
  xrSession,
  selectedInstance,
  selectedInstanceRef,
  modelRootRef,
  compassHeading,
  showManipulator,
  manipProperty,
  setManipProperty,
  manipStep,
  showTexturePanel,
  setShowTexturePanel,
  meshListForTexture,
  selectedMeshIdx,
  setSelectedMeshIdx,
  applyMaterialPreset,
  applyTexturePreset,
  applyMaterialStylePreset,
  textureTab,
  setTextureTab,
  refreshMeshList,
  goBackToGallery,
  createAtCenter,
  removeSelectedInstance,
}) => {
  // Derive the current source name for visual grouping in the texture panel
  const currentSourceName = meshListForTexture[selectedMeshIdx]?.sourceName || '';
  const prevSourceName = selectedMeshIdx > 0 ? meshListForTexture[selectedMeshIdx - 1]?.sourceName : null;
  const showSourceDivider = currentSourceName !== prevSourceName;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.sceneContainer}>
        <EngineView
          style={styles.engineView}
          camera={camera}
          displayFrameRate={true}
          antiAliasing={2}
        />

        {/* Loading overlay */}
        {loadingModel && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4FC3F7" />
            <Text style={styles.loadingText}>
              Caricamento {selectedModel?.name}...
            </Text>
          </View>
        )}

        {/* Status bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusRow}>
            <TouchableOpacity style={styles.backButton} onPress={goBackToGallery}>
              <Text style={styles.backButtonText}>Galleria</Text>
            </TouchableOpacity>
            <Text style={styles.modelTitle} numberOfLines={1}>
              {selectedModel?.name || ''}
            </Text>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>{viewerMode}</Text>
            </View>
          </View>
          <Text style={styles.statusText}>{status}</Text>
          {trackingState !== undefined && (
            <Text
              style={[
                styles.trackingText,
                {
                  color:
                    trackingState === WebXRTrackingState.TRACKING
                      ? '#00ff88'
                      : trackingState === WebXRTrackingState.NOT_TRACKING
                        ? '#ff4444'
                        : '#ffaa00',
                },
              ]}>
              Tracking: {WebXRTrackingState[trackingState]}
            </Text>
          )}
        </View>

        {/* Info overlay (AR & VR) */}
        {xrSession && (
          <View style={styles.infoBar}>
            <Text style={styles.infoText}>
              {viewerMode === 'AR' ? `Superficie: ${surfaceDetected ? 'Rilevata' : 'Ricerca...'}` : 'VR'}{' | Piazzati: '}{objectsPlaced}
            </Text>
            <Text style={styles.infoText}>
              {'Selezionato: '}{selectedInstance?.name || 'Nessuno'}
            </Text>
          </View>
        )}

        {/* Modern 2D Compass */}
        {xrSession && (
          <View style={styles.compassContainer}>
            <View style={styles.compassOuter}>
              <View style={[
                styles.compassRose,
                {transform: [{rotate: `${-compassHeading}deg`}]},
              ]}>
                <View style={[styles.compassLine, styles.compassLineNS]} />
                <View style={[styles.compassLine, styles.compassLineEW]} />
                <View style={[styles.compassCardinal, {top: 2, left: '50%', marginLeft: -6}]}>
                  <Text style={styles.compassN}>N</Text>
                </View>
                <View style={[styles.compassCardinal, {bottom: 2, left: '50%', marginLeft: -5}]}>
                  <Text style={styles.compassLetter}>S</Text>
                </View>
                <View style={[styles.compassCardinal, {right: 3, top: '50%', marginTop: -8}]}>
                  <Text style={styles.compassLetter}>E</Text>
                </View>
                <View style={[styles.compassCardinal, {left: 2, top: '50%', marginTop: -8}]}>
                  <Text style={styles.compassLetter}>W</Text>
                </View>
                <View style={styles.compassNorthPointer} />
              </View>
              <View style={styles.compassCenterDot} />
              <View style={styles.compassFixedArrow} />
            </View>
            <Text style={styles.compassDegreeText}>{Math.round(compassHeading)}°</Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[
              styles.xrButton,
              styles.xrButtonActive,
              (!sceneReady || loadingModel) && styles.xrButtonDisabled,
            ]}
            onPress={goBackToGallery}
            disabled={!sceneReady || loadingModel}>
            <Text style={styles.xrButtonText}>
              {!sceneReady || loadingModel ? '⏳' : '⬅️'}
            </Text>
          </TouchableOpacity>

          {xrSession && (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={createAtCenter}>
              <Text style={styles.createBtnText}>{'➕'}</Text>
            </TouchableOpacity>
          )}

          {xrSession && selectedInstance && (
            <View style={styles.instanceActionsRow}>
              <TouchableOpacity style={styles.actionBtnEqual} onPress={removeSelectedInstance}>
                <Text style={styles.iconBtnText}>{'🗑️'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnEqual, styles.textureBtnBg]}
                onPress={() => {
                  refreshMeshList();
                  setShowTexturePanel((prev: boolean) => !prev);
                }}>
                <Text style={styles.iconBtnText}>{'🎨'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {modelLoaded && !selectedInstance && (
            <TouchableOpacity
              style={[styles.actionBtnEqual, styles.textureBtnBg]}
              onPress={() => {
                refreshMeshList(modelRootRef.current);
                setShowTexturePanel((prev: boolean) => !prev);
              }}>
              <Text style={styles.iconBtnText}>{'🎨'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Texture / Material selection panel — tabbed */}
        {showTexturePanel && meshListForTexture.length > 0 && (
          <View style={styles.texturePanel}>
            <View style={styles.texturePanelHeader}>
              <Text style={styles.texturePanelTitle}>Cambia Aspetto</Text>
              <TouchableOpacity onPress={() => setShowTexturePanel(false)}>
                <Text style={styles.texturePanelClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Tab bar */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabBtn, textureTab === 'texture' && styles.tabBtnActive]}
                onPress={() => setTextureTab('texture')}>
                <Text style={[styles.tabBtnText, textureTab === 'texture' && styles.tabBtnTextActive]}>
                  🎨 Texture
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, textureTab === 'material' && styles.tabBtnActive]}
                onPress={() => setTextureTab('material')}>
                <Text style={[styles.tabBtnText, textureTab === 'material' && styles.tabBtnTextActive]}>
                  ✨ Materiale
                </Text>
              </TouchableOpacity>
            </View>

            {/* Source model label */}
            {currentSourceName ? (
              <View style={styles.sourceHeader}>
                <Text style={styles.sourceHeaderText}>📦 {currentSourceName}</Text>
              </View>
            ) : null}

            {/* Mesh selector */}
            <View style={styles.meshSelectorRow}>
              <TouchableOpacity
                style={styles.meshNavBtn}
                onPress={() => setSelectedMeshIdx((prev: number) => Math.max(0, prev - 1))}>
                <Text style={styles.meshNavBtnText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.meshNameText} numberOfLines={1}>
                {meshListForTexture[selectedMeshIdx]?.name || '?'}
              </Text>
              <Text style={styles.meshCountText}>
                {selectedMeshIdx + 1}/{meshListForTexture.length}
              </Text>
              <TouchableOpacity
                style={styles.meshNavBtn}
                onPress={() => setSelectedMeshIdx((prev: number) => Math.min(meshListForTexture.length - 1, prev + 1))}>
                <Text style={styles.meshNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Texture presets grid */}
            {textureTab === 'texture' && (
              <View style={styles.presetGrid}>
                {TEXTURE_PRESETS.map((p, i) => (
                  <TouchableOpacity
                    key={`tex_${i}`}
                    style={[
                      styles.presetBtn,
                      p.type === 'restore' ? styles.presetRestoreBg : styles.presetTextureBg,
                    ]}
                    onPress={() => applyTexturePreset(i)}>
                    <Text style={styles.presetEmoji}>{p.emoji}</Text>
                    <Text style={styles.presetBtnText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Material presets grid */}
            {textureTab === 'material' && (
              <View style={styles.presetGrid}>
                {MATERIAL_PRESETS.map((p, i) => (
                  <TouchableOpacity
                    key={`mat_${i}`}
                    style={[
                      styles.presetBtn,
                      p.type === 'restore' ? styles.presetRestoreBg : styles.presetMaterialBg,
                    ]}
                    onPress={() => applyMaterialStylePreset(i)}>
                    <Text style={styles.presetEmoji}>{p.emoji}</Text>
                    <Text style={styles.presetBtnText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Manipulation panel */}
        {showManipulator && modelLoaded && (
          <View style={styles.manipulatorPanel}>
            {!manipProperty && (
              <View style={styles.manipBtnRow}>
                {[
                  {key: 'scala', label: 'Scala'},
                  {key: 'rotX', label: 'Rot X'},
                  {key: 'rotY', label: 'Rot Y'},
                  {key: 'posY', label: 'Alt Y'},
                ].map(item => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.manipPropBtn}
                    onPress={() => setManipProperty(item.key)}>
                    <Text style={styles.manipPropBtnText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {manipProperty && (
              <View style={styles.manipActiveRow}>
                <TouchableOpacity
                  style={styles.manipStepBtn}
                  onPress={() => manipStep(manipProperty, -1)}>
                  <Text style={styles.manipStepBtnText}>{' - '}</Text>
                </TouchableOpacity>
                <Text style={styles.manipActiveLabel}>
                  {(() => {
                    const t = selectedInstanceRef.current || modelRootRef.current;
                    if (manipProperty === 'scala') {
                      const baseScale = (t as any)?._baseScale || 1;
                      const pct = (((t?.scaling?.x || baseScale) / baseScale) * 100).toFixed(0);
                      return `Scala ${pct}%`;
                    }
                    if (manipProperty === 'rotX')
                      return `Rot X ${(((t?.rotation?.x || 0) * 180) / Math.PI).toFixed(0)} deg`;
                    if (manipProperty === 'rotY')
                      return `Rot Y ${(((t?.rotation?.y || 0) * 180) / Math.PI).toFixed(0)} deg`;
                    return `Alt Y ${(t?.position?.y || 0).toFixed(2)}m`;
                  })()}
                </Text>
                <TouchableOpacity
                  style={styles.manipStepBtn}
                  onPress={() => manipStep(manipProperty, 1)}>
                  <Text style={styles.manipStepBtnText}>{' + '}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deselectBtn}
                  onPress={() => setManipProperty(null)}>
                  <Text style={styles.deselectBtnText}>{'X'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};
