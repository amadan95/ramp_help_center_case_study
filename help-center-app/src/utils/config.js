// Configuration for API keys and endpoints.
// Do NOT commit secrets. Load from environment or local storage instead.

function getEnv(key) {
  try {
    // Expo public env vars are exposed via process.env when prefixed with EXPO_PUBLIC_
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (_) {}
  return '';
}

function getFromLocalStorage(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || '';
    }
  } catch (_) {}
  return '';
}

// IMPORTANT: Use a direct property access so bundlers inline the value at build time
// on Vercel/Expo Web exports. Dynamic index access (process.env[key]) will NOT be inlined.
// This line will be replaced with the literal value at build time if the env var exists.
const INLINE_ENV_GEMINI = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

const keyFromEnv = INLINE_ENV_GEMINI || getEnv('EXPO_PUBLIC_GEMINI_API_KEY');
const keyFromGlobal = (typeof globalThis !== 'undefined' && (globalThis.GEMINI_API_KEY || globalThis.__GEMINI_API_KEY__)) || '';
const keyFromStorage = getFromLocalStorage('GEMINI_API_KEY');

export const GEMINI_API_KEY = keyFromEnv || keyFromGlobal || keyFromStorage || '';

export function setGeminiApiKeyRuntime(value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('GEMINI_API_KEY', value || '');
    }
  } catch (_) {}
}

export function debugGeminiKeyPresence() {
  const masked = (GEMINI_API_KEY && typeof GEMINI_API_KEY === 'string')
    ? `${GEMINI_API_KEY.slice(0, 6)}…(${GEMINI_API_KEY.length})`
    : '(empty)';
  const directPresent = Boolean(INLINE_ENV_GEMINI);
  const storagePresent = Boolean(getFromLocalStorage('GEMINI_API_KEY'));
  // Do not log the full key—only masked details
  try { console.log('[GeminiKey]', { directPresent, storagePresent, masked }); } catch (_) {}
}


