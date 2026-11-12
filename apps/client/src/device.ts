export interface DeviceInfo {
  userAgent: string;
  maxTouchPoints: number;
  /** Whether the primary pointer is coarse (a finger) rather than fine (a mouse). */
  coarsePointer: boolean;
}

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini/i;

/** The World is desktop-only: a fine pointer and no mobile user agent. */
export function isDesktopDevice(info: DeviceInfo): boolean {
  if (MOBILE_UA.test(info.userAgent)) return false;
  // iPadOS reports a desktop Safari user agent but has touch and a coarse pointer.
  if (info.coarsePointer && info.maxTouchPoints > 0) return false;
  return true;
}

export function currentDevice(): DeviceInfo {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  };
}
