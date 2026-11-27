import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

function parseEnvContent(raw) {
  const out = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

export function loadEnvFiles(baseDir = process.cwd()) {
  if (loaded) return;
  loaded = true;
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(baseDir, name);
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = parseEnvContent(fs.readFileSync(filePath, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined || process.env[k] === '') {
          process.env[k] = v;
        }
      }
    } catch {}
  }
}
