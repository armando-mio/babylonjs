import React from 'react';
import {SafeAreaView, View, Text, FlatList, TouchableOpacity} from 'react-native';
import {AR_MODELS, ModelData} from '../../modelsData';
import {ViewerMode} from '../types';
import {styles} from '../styles';

interface GalleryScreenProps {
  onOpenModel: (model: ModelData, mode: ViewerMode) => void;
}

export const GalleryScreen: React.FC<GalleryScreenProps> = ({onOpenModel}) => {
  return (
    <SafeAreaView style={styles.galleryContainer}>
      <View style={styles.galleryHeader}>
        <Text style={styles.galleryTitle}>Galleria Modelli 3D</Text>
        <Text style={styles.gallerySubtitle}>
          Scegli un modello e visualizzalo in AR o VR
        </Text>
      </View>

      <FlatList
        data={AR_MODELS}
        numColumns={2}
        contentContainerStyle={styles.galleryList}
        columnWrapperStyle={styles.galleryRow}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <View style={styles.modelCard}>
            <View style={styles.modelThumbnail}>
              <Text style={styles.modelEmoji}>{item.thumbnail}</Text>
            </View>
            <Text style={styles.modelName}>{item.name}</Text>
            <Text style={styles.modelDesc}>{item.description}</Text>
            <View style={styles.modelActions}>
              <TouchableOpacity
                style={styles.arActionBtn}
                onPress={() => onOpenModel(item, 'AR')}>
                <Text style={styles.actionBtnText}>AR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.vrActionBtn}
                onPress={() => onOpenModel(item, 'VR')}>
                <Text style={styles.actionBtnText}>VR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
};
