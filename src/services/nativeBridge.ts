/**
 * Capacitor Native Bridge Abstraction Layer (`services/nativeBridge.ts`)
 *
 * Uses standard Web APIs in browser environments and is cleanly structured to swap in
 * official Capacitor plugins when packaging for iOS App Store & Google Play Store:
 * - @capacitor/geolocation
 * - @capacitor/camera
 * - @capacitor/filesystem
 * - @capacitor/network
 * - @capacitor/local-notifications
 */

export type NativePlatform = 'ios' | 'android' | 'web-mobile' | 'web-desktop';

export interface NativeGeoPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: number;
}

export interface CapturedFileResult {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}

interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
}

function getCapacitorGlobal() {
  if (typeof window === 'undefined') return undefined;
  return (window as CapacitorWindow).Capacitor;
}

export const nativeBridge = {
  /**
   * Detects whether the app is running inside a native iOS/Android Capacitor shell
   * or a mobile/desktop web browser.
   */
  getPlatform(): NativePlatform {
    const cap = getCapacitorGlobal();
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.();
      if (p === 'ios') return 'ios';
      if (p === 'android') return 'android';
    }
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod|android|mobile/.test(ua) || window.innerWidth < 768) {
        return 'web-mobile';
      }
    }
    return 'web-desktop';
  },

  isNativeShell(): boolean {
    const p = nativeBridge.getPlatform();
    return p === 'ios' || p === 'android';
  },

  /**
   * Geolocation (@capacitor/geolocation adapter)
   * Swap body with `Geolocation.getCurrentPosition({ enableHighAccuracy: true })` in Capacitor builds.
   */
  async getCurrentPosition(): Promise<NativeGeoPosition> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation API is not available on this device.');
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy || 20,
            timestamp: pos.timestamp,
          });
        },
        (err) => reject(new Error(err.message || 'Location permission denied.')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  },

  /**
   * Camera & Document Capture (@capacitor/camera adapter)
   * Reads a selected File/Photo into a Data URL; in Capacitor builds swap in `Camera.getPhoto()`.
   */
  async readFileAsDocument(file: File, maxSizeBytes = 3 * 1024 * 1024): Promise<CapturedFileResult> {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      throw new Error('Only PDF, JPG, or PNG files are supported.');
    }
    if (file.size > maxSizeBytes) {
      throw new Error('File exceeds 3 MB limit.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          fileName: file.name,
          mimeType: file.type,
          dataUrl: typeof reader.result === 'string' ? reader.result : '',
          sizeBytes: file.size,
        });
      };
      reader.onerror = () => reject(new Error('Failed to read selected file.'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Filesystem Export (@capacitor/filesystem adapter)
   * Downloads text/CSV files in browser; in Capacitor builds write via `Filesystem.writeFile()` + Share sheet.
   */
  async saveTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): Promise<void> {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Network Status (@capacitor/network adapter)
   * Uses navigator.onLine + online/offline events; swap in `Network.getStatus()` / `Network.addListener()` for Capacitor.
   */
  getNetworkOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  },

  onNetworkChange(callback: (online: boolean) => void): () => void {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  },

  /**
   * Local Notifications (@capacitor/local-notifications adapter)
   * Dispatches a browser notification if granted, or silently resolves in sandboxed web views.
   */
  async notifyLocal(title: string, body: string): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch {
        // Ignore in restricted iframe contexts
      }
    }
  },
};
