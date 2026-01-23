const DEVICE_ID_KEY = "ga_device_id";
const DEMO_MODE_ENV = import.meta.env.VITE_DEMO_MODE as string | undefined;
const DEMO_DEVICE_ID_ENV = import.meta.env.VITE_DEMO_DEVICE_ID as string | undefined;

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function getLockedDemoDeviceId(): string | null {
  if (DEMO_MODE_ENV !== "true") return null;
  if (!DEMO_DEVICE_ID_ENV) return null;
  const trimmed = DEMO_DEVICE_ID_ENV.trim();
  if (!trimmed) return null;
  if (!isUuid(trimmed)) return null;
  return trimmed;
}

export function getOrCreateDeviceId(): string {
  const demoDeviceId = getLockedDemoDeviceId();
  if (demoDeviceId) {
    localStorage.setItem(DEVICE_ID_KEY, demoDeviceId);
    return demoDeviceId;
  }
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && isUuid(existing)) return existing;

  const next = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

export function resetDeviceId(): string {
  const demoDeviceId = getLockedDemoDeviceId();
  if (demoDeviceId) {
    localStorage.setItem(DEVICE_ID_KEY, demoDeviceId);
    return demoDeviceId;
  }
  const next = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}
