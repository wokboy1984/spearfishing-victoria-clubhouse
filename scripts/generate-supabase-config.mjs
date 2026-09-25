import { writeFile } from 'node:fs/promises';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for deployment.');
}

const config = `globalThis.SV_SUPABASE_CONFIG = Object.freeze(${JSON.stringify({
  url,
  publishableKey
}, null, 2)});\n`;

await writeFile(new URL('../supabase-config.js', import.meta.url), config, 'utf8');
console.log('Generated browser-safe Supabase configuration.');
