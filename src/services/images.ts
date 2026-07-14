import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { MAX_CHART_IMAGE_BYTES } from '@/constants/limits';

export async function pickAndPersistChartImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_CHART_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  const source = asset.uri;
  const directory = `${FileSystem.documentDirectory}tradelog-charts/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension = source.split('.').pop()?.split('?')[0] || 'jpg';
  const destination = `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  await FileSystem.copyAsync({ from: source, to: destination });
  const saved = await FileSystem.getInfoAsync(destination);
  if (saved.exists && typeof saved.size === 'number' && saved.size > MAX_CHART_IMAGE_BYTES) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
    throw new Error('IMAGE_TOO_LARGE');
  }
  return destination;
}
