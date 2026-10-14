// Picks the live Supabase store when configured, otherwise the in-browser demo store.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const store = SUPABASE_URL && SUPABASE_ANON_KEY
  ? (await import('./store-supabase.js')).store
  : (await import('./store-demo.js')).store;
