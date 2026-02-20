import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, View, Text, FlatList, TouchableOpacity, Animated, Easing, ActivityIndicator} from 'react-native';
import {Eye, Smartphone, ScanLine} from 'lucide-react-native';
import {AR_MODELS, ModelData} from '../../modelsData';
import {ViewerMode} from '../types';
import {styles} from '../styles';
import {ROOM_SCAN_SERVER_URL} from '../constants';

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
  const [isLoading, setIsLoading] = useState(true);

  // Scarica le scansioni dal server
  const fetchServerScans = async () => {
    try {
      const res = await fetch(`${ROOM_SCAN_SERVER_URL}/api/scans`);
      const data = await res.json();
      
      if (data.scans) {
        const fetched: ModelData[] = [];
        data.scans.forEach((scan: any) => {
          // Cerca il file GLB tra quelli generati dal server
          const glbFile = scan.files.find((f: any) => f.type === 'glb');
          if (glbFile) {
            // Formatta la data per renderla leggibile
            const scanDate = new Date(scan.timestamp);
            const dateStr = `${scanDate.getDate()}/${scanDate.getMonth()+1} ${scanDate.getHours()}:${scanDate.getMinutes()}`;
            
            fetched.push({
              id: scan.scanName,
              name: `Stanza ${dateStr}`,
              fileName: glbFile.name,
              thumbnail: '🏠',
              description: 'Scansione RoomPlan 3D',
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
    fetchServerScans();
    // Aggiorna la lista in background ogni 5 secondi
    const interval = setInterval(fetchServerScans, 5000);
    return () => clearInterval(interval);
  }, []);

  // Unisci i modelli hardcoded base con quelli del server
  const allModels = [...serverModels, ...AR_MODELS];

  return (
    <SafeAreaView style={styles.galleryContainer}>
      <View style={styles.galleryHeader}>
        <Text style={styles.galleryTitle}>Modelli 3D</Text>
        <Text style={styles.gallerySubtitle}>Scegli un modello per iniziare</Text>
      </View>

      {/* Pulsante Scansiona Stanza */}
      {onOpenRoomScan && (
        <TouchableOpacity style={styles.roomScanBanner} onPress={onOpenRoomScan}>
          <View style={styles.roomScanBannerLeft}>
            <View style={styles.roomScanIconContainer}>
              <ScanLine color="#a855f7" size={24} />
            </View>
            <View style={styles.roomScanBannerText}>
              <Text style={styles.roomScanBannerTitle}>Scansiona Stanza</Text>
              <Text style={styles.roomScanBannerSubtitle}>Scansiona la tua stanza in 3D con LiDAR</Text>
            </View>
          </View>
          <Text style={styles.roomScanBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {isLoading && serverModels.length === 0 ? (
        <ActivityIndicator color="#a855f7" style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={allModels}
          numColumns={2}
          contentContainerStyle={styles.galleryList}
          columnWrapperStyle={styles.galleryRow}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <View style={styles.modelCard}>
              <View>
                <View style={styles.modelThumbnail}>
                   <Text style={styles.modelEmoji}>{item.thumbnail}</Text>
                </View>
                
                <View style={styles.cardTextContainer}>
                  {item.name.length > 15 ? (
                     <MarqueeText text={item.name} style={styles.modelName} />
                  ) : (
                     <Text style={styles.modelName}>{item.name}</Text>
                  )}
                  <Text style={styles.modelDesc} numberOfLines={3} ellipsizeMode="tail">
                    {item.description}
                  </Text>
                </View>
              </View>

              <View style={styles.modelActions}>
                <TouchableOpacity style={styles.arActionBtn} onPress={() => onOpenModel(item, 'AR')}>
                  <Text style={styles.actionBtnText}>AR</Text>
                  <Smartphone color="#22c55e" size={16} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.vrActionBtn} onPress={() => onOpenModel(item, 'VR')}>
                  <Text style={styles.actionBtnText}>VR</Text>
                  <Eye color="#3b82f6" size={16} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};