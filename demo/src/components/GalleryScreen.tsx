import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, View, Text, FlatList, TouchableOpacity, Animated, Easing, ActivityIndicator, Alert, TextInput, Modal, Keyboard, TouchableWithoutFeedback} from 'react-native';
import {Eye, Smartphone, ScanLine, Box, Upload, Pencil, Trash2} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import {AR_MODELS, ModelData} from '../../modelsData';
import {ViewerMode} from '../types';
import {styles} from '../styles';
import {ROOM_SCAN_SERVER_URL} from '../constants';
import {useDeviceId} from '../hooks/useDeviceId';

interface GalleryScreenProps {
  onOpenModel: (model: ModelData, mode: ViewerMode) => void;
  onOpenRoomScan?: () => void;
}

export const MarqueeText = ({text, style, containerStyle}: {text: string; style: any; containerStyle?: any}) => {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = React.useState(0);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (animationRef.current) animationRef.current.stop();
    if (textWidth > containerWidth && containerWidth > 0) {
      const duration = textWidth * 30;
      const startAnimation = () => {
        scrollAnim.setValue(0);
        animationRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(scrollAnim, {toValue: -textWidth + containerWidth, duration: duration, easing: Easing.linear, useNativeDriver: true}),
            Animated.delay(1000),
            Animated.timing(scrollAnim, {toValue: 0, duration: duration, easing: Easing.linear, useNativeDriver: true}),
            Animated.delay(1000)
          ])
        );
        animationRef.current.start();
      };
      startAnimation();
    } else {
        scrollAnim.setValue(0);
    }
  }, [textWidth, containerWidth, text]);

  return (
    <View style={[styles.marqueeContainer, containerStyle]} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      <Animated.Text style={[style, {transform: [{translateX: scrollAnim}]}]} numberOfLines={1} onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}>
        {text}
      </Animated.Text>
    </View>
  );
};

export const GalleryScreen: React.FC<GalleryScreenProps> = ({onOpenModel, onOpenRoomScan}) => {
  const [serverModels, setServerModels] = useState<ModelData[]>([]);
  const [localModels, setLocalModels] = useState<ModelData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const deviceId = useDeviceId();

  // Scarica le scansioni dal server
  const fetchServerScans = async () => {
    try {
      // AGGIUNTO L'HEADER MAGICO PER BYPASSARE L'AVVISO DI NGROK
      const deviceQuery = deviceId ? `?deviceId=${deviceId}` : '';
      const res = await fetch(`${ROOM_SCAN_SERVER_URL}/api/scans${deviceQuery}`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'Accept': 'application/json'
        }
      });
      
      const data = await res.json();
      
      if (data.scans) {
        const fetched: ModelData[] = [];
        data.scans.forEach((scan: any) => {
          // Cerca il file GLB tra quelli generati dal server
          const glbFile = scan.files.find((f: any) => f.type === 'glb');
          if (glbFile) {
            // Formatta la data per renderla leggibile
            const scanDate = new Date(scan.timestamp);
            const dateStr = `${scanDate.getDate()}/${scanDate.getMonth()+1} ${scanDate.getHours()}:${String(scanDate.getMinutes()).padStart(2, '0')}`;
            
            // Usa displayName/description dal server se disponibili
            const isImported = scan.source === 'imported';
            const defaultName = isImported ? glbFile.name : `Stanza ${dateStr}`;
            const defaultDesc = isImported ? 'Importato dal dispositivo' : 'Scansione RoomPlan 3D';

            fetched.push({
              id: scan.scanName,
              name: scan.displayName || defaultName,
              fileName: glbFile.name,
              thumbnail: isImported ? '📁' : '🏠',
              description: scan.description || defaultDesc,
              scale: 1.0,
              // Crea l'URL completo per far scaricare il file a BabylonJS
              url: `${ROOM_SCAN_SERVER_URL}/api/scans/${scan.scanName}/${glbFile.name}`,
            });
          }
        });
        setServerModels(fetched);
      }
    } catch (error) {
      console.log('Nessuna connessione al server per i modelli remoti:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!deviceId) return; // Attendi il deviceId prima di caricare
    fetchServerScans();
    // Aggiorna la lista in background ogni 5 secondi
    const interval = setInterval(fetchServerScans, 5000);
    return () => clearInterval(interval);
  }, [deviceId]);

  // Gestione Importazione Modello da file system
  const handleImportModel = async () => {
    try {
      // Apre l'interfaccia nativa File/iCloud/Google Drive
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // IMPORTANTE: Deve essere una stringa e non un array!
        copyToCacheDirectory: true, // Fondamentale per far accedere BabylonJS al file "file://"
      });

      // Sintassi corretta per Expo 48: controlla che type sia "success"
      if (result.type === 'success') {
        // Estrai i dati con un fallback sicuro nel caso il nome manchi
        const fileName = result.name || 'modello_importato.glb';
        const fileUri = result.uri;
        
        // RESTRIZIONE: Accettiamo solo glb/gltf/usdz
        const fileNameLower = fileName.toLowerCase();
        if (!fileNameLower.endsWith('.glb') && !fileNameLower.endsWith('.gltf') && !fileNameLower.endsWith('.usdz')) {
            Alert.alert(
              'Formato Non Valido', 
              'Puoi importare solo modelli 3D in formato .glb, .gltf o .usdz. Altri formati non sono supportati.'
            );
            return; // Blocca la funzione qui, non aggiungere il file alla lista!
        }

        // Carica il file sul server
        const modelId = `imported_${Date.now()}`;
        let serverUrl: string | undefined;
        let serverFileName: string | undefined;
        try {
          const formData = new FormData();
          // IMPORTANTE: campi testo PRIMA del file per garantire disponibilità in multer
          formData.append('scanName', modelId);
          formData.append('modelName', modelId);
          if (deviceId) formData.append('deviceId', deviceId);
          formData.append('modelFile', {
            uri: fileUri,
            type: 'application/octet-stream',
            name: fileName,
          } as any);

          const uploadRes = await fetch(`${ROOM_SCAN_SERVER_URL}/api/upload-model`, {
            method: 'POST',
            headers: {
              'ngrok-skip-browser-warning': 'true',
            },
            body: formData,
          });
          const uploadData = await uploadRes.json();
          if (uploadData.success && uploadData.url) {
            // Il server restituisce sempre un URL GLB (BabylonJS non può caricare USDZ)
            serverUrl = `${ROOM_SCAN_SERVER_URL}${uploadData.url}`;
            serverFileName = uploadData.fileName;
            console.log('Modello caricato sul server:', serverUrl);
          } else if (uploadData.success && !uploadData.url) {
            // USDZ importato ma conversione GLB fallita — non abbiamo un file caricabile
            Alert.alert(
              'Conversione Fallita',
              'Il file USDZ è stato caricato sul server ma la conversione in GLB non è riuscita. Il modello non può essere visualizzato.',
            );
            return;
          }
        } catch (uploadErr: any) {
          console.log('Upload sul server fallito, uso file locale:', uploadErr?.message);
          // Per USDZ senza server non possiamo fare nulla — BabylonJS non legge USDZ
          if (fileNameLower.endsWith('.usdz')) {
            Alert.alert(
              'Server Non Raggiungibile',
              'Per importare file USDZ è necessaria la connessione al server per la conversione in GLB.',
            );
            return;
          }
        }

        const importedModel: ModelData = {
          id: modelId,
          name: serverFileName || fileName,
          fileName: serverFileName || fileName,
          thumbnail: '📁',
          description: 'Importato dal dispositivo',
          scale: 1.0,
          url: serverUrl || fileUri, // Preferisci URL server, fallback a URI locale (solo per GLB)
        };

        // Aggiunge in cima alla lista dei modelli
        setLocalModels(prev => [importedModel, ...prev]);
      }
    } catch (err: any) {
      console.log('Errore importazione documento:', err);
      Alert.alert('Errore', `Impossibile leggere il file: ${err.message}`);
    }
  };

  // Unisci tutti i modelli: Locali importati (escludi duplicati già sul server), Server, Hardcoded (Asset)
  const serverIds = new Set(serverModels.map(m => m.id));
  const uniqueLocalModels = localModels.filter(m => !serverIds.has(m.id));
  const allModels = [...uniqueLocalModels, ...serverModels, ...AR_MODELS];

  // Stato per il modal di modifica informazioni modello
  const [editingModel, setEditingModel] = useState<ModelData | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const openEditModal = (model: ModelData) => {
    setEditingModel(model);
    setEditName(model.name);
    setEditDesc(model.description);
  };

  const saveEditModal = () => {
    if (!editingModel) return;
    // Aggiorna il modello nella lista appropriata
    const updateModel = (list: ModelData[]) =>
      list.map(m => m.id === editingModel.id ? {...m, name: editName, description: editDesc} : m);
    setLocalModels(prev => updateModel(prev));
    setServerModels(prev => updateModel(prev));

    // Salva sul server se è un modello server (non hardcoded)
    if (!AR_MODELS.some(m => m.id === editingModel.id)) {
      fetch(`${ROOM_SCAN_SERVER_URL}/api/scans/${editingModel.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({displayName: editName, description: editDesc}),
      }).catch(err => console.log('Errore salvataggio nome sul server:', err));
    }

    setEditingModel(null);
  };

  // Elimina modello con conferma — sempre anche dal server
  const handleDeleteModel = (model: ModelData) => {
    Alert.alert(
      'Elimina Modello',
      `Sei sicuro di voler eliminare "${model.name}"?`,
      [
        {text: 'Annulla', style: 'cancel'},
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            // Elimina dal server (sia scansioni che modelli importati)
            try {
              await fetch(`${ROOM_SCAN_SERVER_URL}/api/scans/${model.id}`, {
                method: 'DELETE',
                headers: {'ngrok-skip-browser-warning': 'true'},
              });
            } catch (err) {
              console.log('Errore eliminazione dal server:', err);
            }
            // Rimuovi da entrambe le liste locali
            setServerModels(prev => prev.filter(m => m.id !== model.id));
            setLocalModels(prev => prev.filter(m => m.id !== model.id));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.galleryContainer}>
      <View style={styles.galleryHeader}>
        <Text style={styles.galleryTitle}>Modelli 3D</Text>
        <Text style={styles.gallerySubtitle}>Scegli un modello per iniziare</Text>
      </View>

      {isLoading && serverModels.length === 0 ? (
        <ActivityIndicator color="#a855f7" style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={allModels}
          numColumns={1}
          contentContainerStyle={[styles.galleryList, {paddingBottom: 120}]}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <View style={styles.modelCard}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <View style={[styles.cardTextContainer, {flex: 1}]}>
                  {item.name.length > 20 ? (
                     <MarqueeText text={item.name} style={styles.modelName} />
                  ) : (
                     <Text style={styles.modelName}>{item.name}</Text>
                  )}
                  <Text style={styles.modelDesc} numberOfLines={2} ellipsizeMode="tail">
                    {item.description}
                  </Text>
                </View>

                <TouchableOpacity 
                  style={styles.editModelBtn}
                  onPress={() => openEditModal(item)}>
                  <Pencil color="#a1a1aa" size={18} />
                </TouchableOpacity>

                {/* Pulsante Elimina — solo per modelli locali e server (non hardcoded) */}
                {!AR_MODELS.some(m => m.id === item.id) && (
                  <TouchableOpacity 
                    style={[styles.editModelBtn, {marginLeft: 4}]}
                    onPress={() => handleDeleteModel(item)}>
                    <Trash2 color="#ef4444" size={18} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.modelActions, { justifyContent: 'space-between', gap: 6, marginTop: 10 }]}>
                <TouchableOpacity 
                  style={[styles.arActionBtn, { flex: 1, paddingHorizontal: 4, borderColor: '#eab308' }]} 
                  onPress={() => onOpenModel(item, '3D')}>
                  <Text style={styles.actionBtnText}>3D</Text>
                  <Box color="#eab308" size={16} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.arActionBtn, { flex: 1, paddingHorizontal: 4 }]} 
                  onPress={() => onOpenModel(item, 'AR')}>
                  <Text style={styles.actionBtnText}>AR</Text>
                  <Smartphone color="#22c55e" size={16} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.vrActionBtn, { flex: 1, paddingHorizontal: 4 }]} 
                  onPress={() => onOpenModel(item, 'VR')}>
                  <Text style={styles.actionBtnText}>VR</Text>
                  <Eye color="#3b82f6" size={16} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Barra sticky in basso: Scansiona Stanza + Importa Modello */}
      <View style={styles.stickyBottomBar}>
        {onOpenRoomScan && (
          <TouchableOpacity style={styles.stickyBottomBtn} onPress={onOpenRoomScan}>
            <ScanLine color="#a855f7" size={20} />
            <Text style={[styles.stickyBottomBtnText, {color: '#a855f7'}]}>Scansiona Stanza</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.stickyBottomBtn, {borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)'}]} onPress={handleImportModel}>
          <Upload color="#f97316" size={20} />
          <Text style={[styles.stickyBottomBtnText, {color: '#f97316'}]}>Importa Modello</Text>
        </TouchableOpacity>
      </View>

      {/* Modal Modifica Info Modello */}
      <Modal visible={!!editingModel} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Modifica Informazioni</Text>
                <Text style={styles.modalLabel}>Nome</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Nome del modello"
                  placeholderTextColor="#71717a"
                  returnKeyType="next"
                />
                <Text style={styles.modalLabel}>Descrizione</Text>
                <TextInput
                  style={[styles.modalInput, {height: 80, textAlignVertical: 'top'}]}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="Descrizione"
                  placeholderTextColor="#71717a"
                  multiline
                  returnKeyType="done"
                  blurOnSubmit
                />
                <View style={{flexDirection: 'row', gap: 12, marginTop: 16}}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingModel(null)}>
                    <Text style={styles.modalCancelBtnText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={saveEditModal}>
                    <Text style={styles.modalSaveBtnText}>Salva</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
};