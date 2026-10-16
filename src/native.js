import { Capacitor, registerPlugin } from '@capacitor/core';

// Android-only plugins in android/app/src/main/java/com/timefreak7/inkmap.
export const PhotoScan = registerPlugin('PhotoScan');
export const BackupFolder = registerPlugin('BackupFolder');
export const FileShare = registerPlugin('FileShare');
export const Calendar = registerPlugin('Calendar');
export const Widget = registerPlugin('Widget');

// Android's share sheet on the phone; the browser's share sheet or a download elsewhere.
// Text files pass as text; anything else (a picture) as base64.
export async function shareFile(file, title) {
  if (Capacitor.isNativePlatform()) {
    if (file.type === 'application/octet-stream') return FileShare.share({ name: file.name, data: await file.text(), title });
    const url = await new Promise((ok, fail) => Object.assign(new FileReader(), { onload: e => ok(e.target.result), onerror: fail }).readAsDataURL(file));
    return FileShare.share({ name: file.name, data: url.slice(url.indexOf(',') + 1), base64: true, mime: file.type, title });
  }
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
