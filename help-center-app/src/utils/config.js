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

// Prefer direct property access so bundlers inline at build time on Vercel
const keyFromEnv = (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_GEMINI_API_KEY) || getEnv('EXPO_PUBLIC_GEMINI_API_KEY');
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


