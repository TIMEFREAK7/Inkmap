import { registerPlugin } from '@capacitor/core';

// Android-only plugins in android/app/src/main/java/com/timefreak7/inkmap.
export const PhotoScan = registerPlugin('PhotoScan');
export const BackupFolder = registerPlugin('BackupFolder');
export const FileShare = registerPlugin('FileShare');
