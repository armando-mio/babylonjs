import React, {useState} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView // Aggiunto per le card texture
} from 'react-native';
import {EngineView} from '@babylonjs/react-native';
import {Camera, WebXRTrackingState, AbstractMesh, TransformNode} from '@babylonjs/core';
import {
  ArrowLeft, Palette, Trash2, SlidersHorizontal, Plus, X, Rotate3d, Move
} from 'lucide-react-native';

import {ModelData} from '../../modelsData';
import {MeshListEntry} from '../types';
import {TEXTURE_PRESETS, MATERIAL_PRESETS} from '../constants';
import {styles} from '../styles';
import {MarqueeText} from './GalleryScreen';

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
  toggleManipulator?: () => void; 
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
  // Stato locale per evidenziare il preset attivo (per il bordo viola)
  const [activePresetIndex, setActivePresetIndex] = useState<number | null>(null);

  // MODIFICATO: Logica apertura Dimensioni (chiude Aspetto)
  const handleToggleManipulator = () => {
    if (!selectedInstance) return;
    setShowTexturePanel(false); // Chiude l'altro pannello
    setManipProperty(null); 
    setManipProperty('scala');
  };

  // MODIFICATO: Logica apertura Aspetto (chiude Dimensioni)
  const handleToggleTexture = () => {
    refreshMeshList();
    setManipProperty(null); // Chiude l'altro pannello
    setShowTexturePanel((prev: boolean) => !prev);
    setActivePresetIndex(null); // Reset selezione visiva
  };

  // Applicazione preset con aggiornamento stato locale
  const handleApplyPreset = (i: number) => {
    setActivePresetIndex(i);
    if (textureTab === 'texture') {
      applyTexturePreset(i);
    } else {
      applyMaterialStylePreset(i);
    }
  };

  const hasSelection = !!selectedInstance;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.sceneContainer}>
        <EngineView
          style={styles.engineView}
          camera={camera}
          displayFrameRate={false} 
          antiAliasing={2}
        />

        {loadingModel && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Caricamento...</Text>
          </View>
        )}

        <View style={styles.statusBar}>
          <View style={styles.statusLeft}>
            <TouchableOpacity style={styles.backButton} onPress={goBackToGallery}>
              <ArrowLeft color="#fff" size={20} />
            </TouchableOpacity>
            <View style={{flex: 1}}>
                 <MarqueeText text={selectedModel?.name || ''} style={styles.modelTitle} />
            </View>
          </View>
          
          <View style={styles.statusRight}>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>{viewerMode}</Text>
            </View>
            {trackingState !== undefined && (
              <View style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: trackingState === WebXRTrackingState.TRACKING ? '#22c55e' : '#ef4444'
              }} />
            )}
          </View>
        </View>

        {xrSession && (
          <View style={styles.compassContainer}>
            <View style={styles.compassOuter}>
              <View style={[
                styles.compassRose,
                {transform: [{rotate: `${-compassHeading}deg`}]},
              ]}>
                <View style={[styles.compassLine, styles.compassLineNS]} />
                <View style={[styles.compassLine, styles.compassLineEW]} />
                
                <View style={[styles.compassCardinal, styles.compassN]}><Text style={styles.compassN}>N</Text></View>
                <View style={[styles.compassCardinal, styles.compassS]}><Text style={styles.compassS}>S</Text></View>
                <View style={[styles.compassCardinal, styles.compassE]}><Text style={styles.compassE}>E</Text></View>
                <View style={[styles.compassCardinal, styles.compassW]}><Text style={styles.compassW}>O</Text></View>
                
                {/* Freccia rossa spostata (vedi styles) */}
                <View style={styles.compassNorthPointer} />
              </View>
              <View style={styles.compassCenterDot} />
              <View style={styles.compassFixedArrow} />
            </View>
            <Text style={styles.compassDegreeText}>{Math.round(compassHeading)}°</Text>
          </View>
        )}

        <View style={styles.controls}>
          {xrSession ? (
            <TouchableOpacity style={styles.createBtn} onPress={createAtCenter}>
              <Plus color="#fff" size={32} strokeWidth={3} />
            </TouchableOpacity>
          ) : <View style={{width: 60}} />} 

          <View style={styles.actionGroup}>
            <TouchableOpacity 
              style={[styles.iconBtn, hasSelection && styles.iconBtnDestructive, !hasSelection && styles.iconBtnDisabled]} 
              onPress={removeSelectedInstance}
              disabled={!hasSelection}>
              <Trash2 color={hasSelection ? "#ef4444" : "#888"} size={24} />
            </TouchableOpacity>

            {/* MODIFICATO: Disabilitato se !hasSelection */}
            <TouchableOpacity
              style={[
                styles.iconBtn, 
                showTexturePanel && styles.iconBtnActive,
                !hasSelection && styles.iconBtnDisabled
              ]}
              onPress={handleToggleTexture}
              disabled={!hasSelection}>
              <Palette color={showTexturePanel ? "#3b82f6" : "#fff"} size={24} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.iconBtn,
                (showManipulator && !!manipProperty) && styles.iconBtnActive,
                !hasSelection && styles.iconBtnDisabled
              ]}
              onPress={handleToggleManipulator}
              disabled={!hasSelection}>
              <SlidersHorizontal color={(showManipulator && !!manipProperty) ? "#3b82f6" : "#fff"} size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {showTexturePanel && meshListForTexture.length > 0 && (
          <View style={styles.texturePanel}>
            <View style={styles.texturePanelHeader}>
              <Text style={styles.texturePanelTitle}>Aspetto</Text>
              <TouchableOpacity onPress={() => setShowTexturePanel(false)}>
                <X color="#fff" size={24} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabBtn, textureTab === 'texture' && styles.tabBtnActive]}
                onPress={() => { setTextureTab('texture'); setActivePresetIndex(null); }}>
                <Text style={[styles.tabBtnText, textureTab === 'texture' && styles.tabBtnTextActive]}>Texture</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, textureTab === 'material' && styles.tabBtnActive]}
                onPress={() => { setTextureTab('material'); setActivePresetIndex(null); }}>
                <Text style={[styles.tabBtnText, textureTab === 'material' && styles.tabBtnTextActive]}>Materiale</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.meshSelectorRow}>
              <TouchableOpacity
                style={styles.meshNavBtn}
                onPress={() => setSelectedMeshIdx((prev: number) => Math.max(0, prev - 1))}>
                <ArrowLeft color="#fff" size={16} />
              </TouchableOpacity>
              <Text style={styles.meshNameText} numberOfLines={1}>
                {meshListForTexture[selectedMeshIdx]?.name || '?'}
              </Text>
              <TouchableOpacity
                style={styles.meshNavBtn}
                onPress={() => setSelectedMeshIdx((prev: number) => Math.min(meshListForTexture.length - 1, prev + 1))}>
                <ArrowLeft color="#fff" size={16} style={{transform: [{rotate: '180deg'}]}} />
              </TouchableOpacity>
            </View>

            {/* MODIFICATO: ScrollView Orizzontale + Stile selezione */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScrollView}>
              <View style={styles.presetGrid}>
                {(textureTab === 'texture' ? TEXTURE_PRESETS : MATERIAL_PRESETS).map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.presetBtn,
                      // Bordo viola solo se selezionato
                      activePresetIndex === i && styles.presetBtnSelected
                    ]}
                    onPress={() => handleApplyPreset(i)}>
                    <Text style={styles.presetEmoji}>{p.emoji}</Text> 
                    <Text style={styles.presetBtnText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {showManipulator && manipProperty && modelLoaded && (
          <View style={styles.manipulatorPanel}>
             <TouchableOpacity style={styles.closeManipBtn} onPress={() => setManipProperty(null)}>
                <X color="#fff" size={16} />
             </TouchableOpacity>

            <View style={styles.manipActiveRow}>
              <TouchableOpacity
                style={styles.manipStepBtn}
                onPress={() => manipStep(manipProperty, -1)}>
                <Text style={styles.manipStepBtnText}>-</Text>
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
                    return `Rot X ${(((t?.rotation?.x || 0) * 180) / Math.PI).toFixed(0)}°`;
                  if (manipProperty === 'rotY')
                    return `Rot Y ${(((t?.rotation?.y || 0) * 180) / Math.PI).toFixed(0)}°`;
                  return `Alt Y ${(t?.position?.y || 0).toFixed(2)}m`;
                })()}
              </Text>
              
              <TouchableOpacity
                style={styles.manipStepBtn}
                onPress={() => manipStep(manipProperty, 1)}>
                <Text style={styles.manipStepBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Sottomenu con Rot X aggiunto */}
            <View style={styles.manipBtnRow}>
                 <TouchableOpacity style={styles.manipPropBtn} onPress={() => setManipProperty('scala')}>
                    <Text style={styles.manipPropBtnText}>Scala</Text>
                 </TouchableOpacity>
                 
                 {/* MODIFICATO: Aggiunto Rot X */}
                 <TouchableOpacity style={styles.manipPropBtn} onPress={() => setManipProperty('rotX')}>
                    <Text style={styles.manipPropBtnText}>Rot X</Text>
                 </TouchableOpacity>
                 
                 <TouchableOpacity style={styles.manipPropBtn} onPress={() => setManipProperty('rotY')}>
                    <Text style={styles.manipPropBtnText}>Rot Y</Text>
                 </TouchableOpacity>
                 
                 <TouchableOpacity style={styles.manipPropBtn} onPress={() => setManipProperty('posY')}>
                    <Text style={styles.manipPropBtnText}>Alt Y</Text>
                 </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};