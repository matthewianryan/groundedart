const DEVICE_ID_KEY = "ga_device_id";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && isUuid(existing)) return existing;

  const next = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

export function resetDeviceId(): string {
  const next = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}
