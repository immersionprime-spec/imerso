#!/usr/bin/env node
/**
 * Upload .ksplat (ou .ply) pro R2 e chama finalize do tour.
 * Opcional: segundo arquivo lite (P08) + r2KeyLite no finalize.
 *
 * Uso:
 *   node scripts/local-gs/upload-and-finalize.mjs \
 *     --tour-id <uuid> \
 *     --splat-file <caminho absoluto pro .ksplat ou .ply> \
 *     [--splat-lite-file <caminho scene.lite.ksplat>] \
 *     [--api-base-url http://localhost:3000]
 *
 * Env vars necessárias (em .env.local na raiz):
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *   PIPELINE_SERVICE_TOKEN
 */
import { readFileSync, statSync, existsSync, createReadStream } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// ----- parse args -----
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const tourId = getArg('tour-id');
const splatFile = getArg('splat-file');
const splatLiteFile = getArg('splat-lite-file');
const apiBaseUrl = getArg('api-base-url') ?? 'http://localhost:3000';
if (!tourId || !splatFile) {
  console.error(
    'Uso: --tour-id <uuid> --splat-file <path> [--splat-lite-file <path>] [--api-base-url <url>]'
  );
  process.exit(2);
}
const absSplatPath = resolve(splatFile);
if (!existsSync(absSplatPath)) {
  console.error(`Arquivo não encontrado: ${absSplatPath}`);
  process.exit(2);
}
const ext = extname(absSplatPath).slice(1).toLowerCase();
if (!['ksplat', 'ply', 'splat'].includes(ext)) {
  console.error(`Extensão não suportada: .${ext} (esperado .ksplat, .ply ou .splat)`);
  process.exit(2);
}

let absLitePath = null;
let liteExt = null;
if (splatLiteFile) {
  absLitePath = resolve(splatLiteFile);
  if (!existsSync(absLitePath)) {
    console.error(`Arquivo lite não encontrado: ${absLitePath}`);
    process.exit(2);
  }
  liteExt = extname(absLitePath).slice(1).toLowerCase();
  if (!['ksplat', 'ply', 'splat'].includes(liteExt)) {
    console.error(`Extensão lite não suportada: .${liteExt}`);
    process.exit(2);
  }
}

// ----- load .env.local -----
const envPath = resolve(repoRoot, '.env.local');
if (!existsSync(envPath)) {
  console.error(`.env.local não encontrado em ${envPath}`);
  process.exit(2);
}
const envRaw = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  env[m[1]] = val;
}
const required = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'PIPELINE_SERVICE_TOKEN',
];
const missing = required.filter((k) => !env[k]);
if (missing.length > 0) {
  console.error(`Env vars faltando em .env.local: ${missing.join(', ')}`);
  process.exit(2);
}

// ----- nanoid simples (sem dep externa) -----
function nanoidSimple(size = 21) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let out = '';
  for (let i = 0; i < size; i++) {
    out += alpha[Math.floor(Math.random() * alpha.length)];
  }
  return out;
}

// ----- upload R2 (main) -----
const r2Key = `tours/${tourId}/splat/${nanoidSimple()}.${ext}`;
const fileSize = statSync(absSplatPath).size;
const fileSizeMb = (fileSize / 1024 / 1024).toFixed(1);

console.log(`[upload] ${basename(absSplatPath)} (${fileSizeMb} MB) -> R2 key: ${r2Key}`);
const s3 = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

async function uploadToR2(key, absPath) {
  const sz = statSync(absPath).size;
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: createReadStream(absPath),
      ContentType: 'application/octet-stream',
    },
    queueSize: 4,
    partSize: 10 * 1024 * 1024,
  });
  upload.on('httpUploadProgress', (p) => {
    if (p.loaded && p.total) {
      const pct = ((p.loaded / p.total) * 100).toFixed(0);
      process.stdout.write(`\r[upload] ${key.split('/').pop()} ${pct}%   `);
    }
  });
  await upload.done();
  process.stdout.write('\n');
  return sz;
}

const t0 = Date.now();
try {
  await uploadToR2(r2Key, absSplatPath);
} catch (e) {
  console.error(`[upload] FALHOU: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
let uploadSec = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[upload] principal OK em ${uploadSec}s`);

let r2KeyLite = null;
let sizeBytesLite = null;
if (absLitePath && liteExt) {
  r2KeyLite = `tours/${tourId}/splat/${nanoidSimple()}.${liteExt}`;
  const liteMb = (statSync(absLitePath).size / 1024 / 1024).toFixed(2);
  console.log(`[upload] lite ${basename(absLitePath)} (${liteMb} MB) -> ${r2KeyLite}`);
  const t1 = Date.now();
  try {
    sizeBytesLite = await uploadToR2(r2KeyLite, absLitePath);
  } catch (e) {
    console.error(`[upload] lite FALHOU: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  uploadSec = ((Date.now() - t1) / 1000).toFixed(1);
  console.log(`[upload] lite OK em ${uploadSec}s`);
}

// ----- finalize -----
const finalizeUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/admin/tours/${tourId}/splat/finalize`;
console.log(`[finalize] POST ${finalizeUrl}`);
const body = {
  mode: 'r2Key',
  r2Key,
  sizeBytes: fileSize,
  ...(r2KeyLite && sizeBytesLite != null
    ? { r2KeyLite, sizeBytesLite }
    : {}),
};
try {
  const res = await fetch(finalizeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-token': env.PIPELINE_SERVICE_TOKEN,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[finalize] FALHOU ${res.status}: ${text}`);
    process.exit(1);
  }
  console.log(`[finalize] OK: ${text}`);
} catch (e) {
  console.error(`[finalize] erro de rede: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

console.log('[done] Tour marcado como ready.');
