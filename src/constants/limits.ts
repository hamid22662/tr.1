export const MAX_CHART_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_CSV_ROWS = 50_000;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export const exceedsApproximateBytes = (text: string, maxBytes: number) =>
  text.length * 2 > maxBytes;
