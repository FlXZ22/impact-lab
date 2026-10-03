/** @import { LocationResult } from './types.js' */

/**
 * Hard ceiling covering the permission prompt too: the Geolocation API's own timeout
 * only starts once permission is granted, so an ignored prompt would otherwise hang forever.
 */
const OVERALL_TIMEOUT_MS = 12_000;

/**
 * Resolves the device position for a report. Never rejects: every failure becomes an outcome
 * so the report can be saved without coordinates.
 * @returns {Promise<LocationResult>}
 */
export async function resolveLocation() {
  if (!('geolocation' in navigator) || !window.isSecureContext) return { outcome: 'unsupported', position: null };

  try {
    const permission = await navigator.permissions?.query({ name: 'geolocation' });
    if (permission?.state === 'denied') return { outcome: 'denied', position: null };
  } catch {
    // Permissions API missing or unsupported for geolocation (older Safari): just ask.
  }

  return new Promise(resolve => {
    let settled = false;
    /** @param {LocationResult} result */
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ outcome: 'timeout', position: null }), OVERALL_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => finish({
        outcome: 'granted',
        position: { latitude: coords.latitude, longitude: coords.longitude, accuracy: Math.round(coords.accuracy) }
      }),
      error => finish({
        outcome: error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable',
        position: null
      }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  });
}
