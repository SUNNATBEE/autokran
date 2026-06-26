/** Tiny input-validation helpers for public form submissions. */

export interface FieldRule {
  min?: number;
  max?: number;
  required?: boolean;
}

/** Trim and collapse whitespace, then enforce a max length. */
export function cleanString(value: unknown, max = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Basic phone sanity check: 6–20 chars, digits and common phone symbols. */
export function isValidPhone(value: string): boolean {
  return /^[+()\d][\d\s()+-]{5,19}$/.test(value);
}

export interface ValidationResult<T> {
  ok: boolean;
  errors: string[];
  data: T;
}

export function validateContact(body: unknown): ValidationResult<{
  name: string;
  phone: string;
}> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = cleanString(b.name, 100);
  const phone = cleanString(b.phone, 25);
  const errors: string[] = [];

  if (name.length < 2) errors.push('A valid name is required');
  if (!isValidPhone(phone)) errors.push('A valid phone number is required');

  return { ok: errors.length === 0, errors, data: { name, phone } };
}

/** Parse a latitude/longitude only if it's a finite number in valid range. */
function toCoord(value: unknown, max: number): number | null {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

export function validateOrder(body: unknown): ValidationResult<{
  name: string;
  phone: string;
  location: string;
  craneModel: string | null;
  lat: number | null;
  lng: number | null;
}> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = cleanString(b.name, 100);
  const phone = cleanString(b.phone, 25);
  const location = cleanString(b.location, 300);
  const craneModelRaw = cleanString(b.craneModel, 100);
  const lat = toCoord(b.lat, 90);
  const lng = toCoord(b.lng, 180);
  const errors: string[] = [];

  if (name.length < 2) errors.push('A valid name is required');
  if (!isValidPhone(phone)) errors.push('A valid phone number is required');
  if (location.length < 2) errors.push('A valid location is required');

  return {
    ok: errors.length === 0,
    errors,
    data: {
      name,
      phone,
      location,
      craneModel: craneModelRaw || null,
      lat,
      lng,
    },
  };
}
