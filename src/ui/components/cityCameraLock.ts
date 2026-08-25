const CAMERA_LOCK_KEY = 'financevisual:cityCameraLock';

export interface LockedCamera {
  position: [number, number, number];
  target: [number, number, number];
}

export function loadLockedCamera(): LockedCamera | null {
  const raw = localStorage.getItem(CAMERA_LOCK_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LockedCamera;
  } catch {
    return null;
  }
}

export function saveLockedCamera(value: LockedCamera): void {
  localStorage.setItem(CAMERA_LOCK_KEY, JSON.stringify(value));
}

export function clearLockedCamera(): void {
  localStorage.removeItem(CAMERA_LOCK_KEY);
}
