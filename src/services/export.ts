import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getBackupData, listTrades, restoreBackupData } from '@/db/repositories';
import { validateBackupData } from '@/services/backupValidation';
import { MAX_BACKUP_BYTES, MAX_CHART_IMAGE_BYTES, exceedsApproximateBytes } from '@/constants/limits';
import { Trade } from '@/types';

const CSV_COLUMNS: Array<keyof Trade> = [
  'id',
  'symbol',
  'market',
  'direction',
  'status',
  'entry_price',
  'exit_price',
  'stop_loss',
  'take_profit',
  'lot_size',
  'quantity',
  'risk_percent',
  'risk_amount',
  'account_currency',
  'pnl_gross',
  'pnl_net',
  'pnl_pips',
  'rr_ratio',
  'strategy',
  'emotion_entry',
  'emotion_exit',
  'open_time',
  'close_time',
  'setup_notes',
  'exit_notes',
  'lesson_learned',
];

type BackupImagePayload = {
  id: number;
  image_uri: string;
  image_base64?: string | null;
  image_extension?: string | null;
  [key: string]: unknown;
};

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function localDateStamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}_${hour}-${minute}`;
}

async function shareFile(uri: string, mimeType: string, dialogTitle: string) {
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType, dialogTitle });
    }
  } catch {
    // Sharing may be unavailable on a platform even though the file was created successfully.
  }
}

/** Exports all closed trades to CSV and returns the file URI. */
export async function exportTradesCsv(): Promise<string> {
  const trades = await listTrades({ status: 'CLOSED' });
  const header = CSV_COLUMNS.join(',');
  const rows = trades.map((trade) => CSV_COLUMNS.map((column) => escapeCsvCell(trade[column])).join(','));
  const csv = `\uFEFF${[header, ...rows].join('\n')}`;
  const directory = FileSystem.documentDirectory;
  if (!directory) throw new Error('The app document directory is not available on this device.');

  const uri = `${directory}tradelog_export_${localDateStamp()}.csv`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await shareFile(uri, 'text/csv', 'Export TradeLog CSV');
  return uri;
}

export async function exportBackupJson(): Promise<string> {
  const data = await getBackupData();
  const tradeImages = await Promise.all(data.trade_images.map(async (image) => {
    try {
      const info = await FileSystem.getInfoAsync(image.image_uri);
      if (info.exists && typeof info.size === 'number' && info.size > MAX_CHART_IMAGE_BYTES) {
        throw new Error('BACKUP_IMAGE_TOO_LARGE');
      }
      const image_base64 = await FileSystem.readAsStringAsync(image.image_uri, { encoding: FileSystem.EncodingType.Base64 });
      return { ...image, image_base64, image_extension: image.image_uri.split('.').pop()?.split('?')[0] || 'jpg' };
    } catch (error) {
      if (error instanceof Error && error.message === 'BACKUP_IMAGE_TOO_LARGE') throw error;
      return { ...image, image_base64: null };
    }
  }));
  const directory = `${FileSystem.documentDirectory}tradelog-backups/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const uri = `${directory}tradelog_backup_${localDateStamp()}.json`;
  const backupJson = JSON.stringify({ ...data, version: 2, trade_images: tradeImages }, null, 2);
  if (exceedsApproximateBytes(backupJson, MAX_BACKUP_BYTES)) throw new Error('BACKUP_TOO_LARGE');
  await FileSystem.writeAsStringAsync(uri, backupJson, { encoding: FileSystem.EncodingType.UTF8 });
  await shareFile(uri, 'application/json', 'TradeLog Backup');
  return uri;
}

export async function listBackupFiles() {
  const directory = `${FileSystem.documentDirectory}tradelog-backups/`;
  try {
    const files = await FileSystem.readDirectoryAsync(directory);
    return files
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse()
      .map((name) => `${directory}${name}`);
  } catch {
    return [];
  }
}

export async function restoreLatestBackupJson(): Promise<string | null> {
  const backups = await listBackupFiles();
  const latest = backups[0];
  if (!latest) return null;
  const backupInfo = await FileSystem.getInfoAsync(latest);
  if (backupInfo.exists && typeof backupInfo.size === 'number' && backupInfo.size > MAX_BACKUP_BYTES) {
    throw new Error('BACKUP_TOO_LARGE');
  }
  const raw = await FileSystem.readAsStringAsync(latest, { encoding: FileSystem.EncodingType.UTF8 });
  if (exceedsApproximateBytes(raw, MAX_BACKUP_BYTES)) throw new Error('BACKUP_TOO_LARGE');
  const parsed = JSON.parse(raw);
  validateBackupData(parsed);
  const imageDirectory = `${FileSystem.documentDirectory}tradelog-charts/`;
  await FileSystem.makeDirectoryAsync(imageDirectory, { intermediates: true });
  const restoredImages: BackupImagePayload[] = [];
  const createdImageUris: string[] = [];
  try {
    for (const image of (parsed.trade_images ?? []) as BackupImagePayload[]) {
      if (!image.image_base64) {
        restoredImages.push(image);
        continue;
      }
      if (image.image_base64.length > Math.ceil(MAX_CHART_IMAGE_BYTES * 4 / 3) + 16) throw new Error('BACKUP_IMAGE_TOO_LARGE');
      const extension = String(image.image_extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const imageUri = `${imageDirectory}restored-${image.id}-${Date.now()}.${extension}`;
      await FileSystem.writeAsStringAsync(imageUri, image.image_base64, { encoding: FileSystem.EncodingType.Base64 });
      createdImageUris.push(imageUri);
      const { image_base64: _base64, image_extension: _extension, ...clean } = image;
      restoredImages.push({ ...clean, image_uri: imageUri } as BackupImagePayload);
    }
    parsed.trade_images = restoredImages;
    await restoreBackupData(parsed);
  } catch (error) {
    await Promise.all(createdImageUris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
    throw error;
  }
  return latest;
}
