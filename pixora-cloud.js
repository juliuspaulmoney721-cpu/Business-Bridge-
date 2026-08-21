// Pixora cloud compatibility layer.
// The app now uses pixora-api.js everywhere. This file intentionally re-exports
// the same real Supabase functions so old imports do not create a second API.
export * from './pixora-api.js';
