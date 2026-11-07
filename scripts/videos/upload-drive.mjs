// Uploads the finished videos straight to Google Drive, from wherever they
// were made (a cloud session or your own computer): no downloading and
// uploading by hand. docs/social/VIDEOS.md §3.7.
//
//   node scripts/videos/upload-drive.mjs [files...]   (default: everything in store/videos)
//
// Needs three secrets (the cloud environment's settings, or your shell):
//   GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET  an OAuth client ("Desktop app") in Google Cloud
//   GDRIVE_REFRESH_TOKEN                    a refresh token for the scope drive.file
// With drive.file the uploader can only see the files and folders it made
// itself, nothing else in the Drive. It keeps them in "TardiGeddon videos"
// (YouTube/ and Shorts/), and skips a file already there with the same name.

import { createReadStream, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const FOLDER = process.env.GDRIVE_FOLDER || 'TardiGeddon videos';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain', '.wav': 'audio/wav' };

async function accessToken() {
  const { GDRIVE_CLIENT_ID: id, GDRIVE_CLIENT_SECRET: secret, GDRIVE_REFRESH_TOKEN: refresh } = process.env;
  if (!id || !secret || !refresh) {
    throw new Error('Set GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET and GDRIVE_REFRESH_TOKEN (docs/social/VIDEOS.md §3.7).');
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google sign-in refused (${r.status} ${j.error ?? ''}): make a new refresh token (§3.7).`);
  return j.access_token;
}

let token = '';
const api = async (path, init = {}) => {
  const r = await fetch(path.startsWith('http') ? path : `${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`Drive ${init.method ?? 'GET'} ${path.split('?')[0]}: ${r.status} ${await r.text()}`);
  return r;
};
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** A folder this uploader made, by name (and parent), made if it isn't there yet. */
async function folder(name, parent) {
  const query = `name = '${q(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parent ? ` and '${parent}' in parents` : ''}`;
  const found = await (await api(`/files?q=${encodeURIComponent(query)}&fields=files(id)`)).json();
  if (found.files.length) return found.files[0].id;
  const made = await api('/files?fields=id', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
  });
  return (await made.json()).id;
}

async function exists(name, parent) {
  const query = `name = '${q(name)}' and '${parent}' in parents and trashed = false`;
  return (await (await api(`/files?q=${encodeURIComponent(query)}&fields=files(id)`)).json()).files.length > 0;
}

/** A resumable upload: any size, sent in 32 MB pieces. */
async function upload(file, parent) {
  const name = basename(file);
  const size = statSync(file).size;
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const start = await api(`${UPLOAD}?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-upload-content-type': type, 'x-upload-content-length': String(size) },
    body: JSON.stringify({ name, parents: [parent] }),
  });
  const url = start.headers.get('location');
  const PIECE = 32 * 1024 * 1024;
  for (let at = 0; at < size; at += PIECE) {
    const end = Math.min(size, at + PIECE);
    const chunks = [];
    for await (const c of createReadStream(file, { start: at, end: end - 1 })) chunks.push(c);
    const r = await fetch(url, { method: 'PUT', headers: { 'content-length': String(end - at), 'content-range': `bytes ${at}-${end - 1}/${size}` }, body: Buffer.concat(chunks) });
    // 308: carry on with the next piece; 200/201: done.
    if (r.status !== 308 && !r.ok) throw new Error(`Drive upload of ${name}: ${r.status} ${await r.text()}`);
    process.stdout.write(`\r  ${name}: ${Math.round((end / size) * 100)}%`);
  }
  process.stdout.write('\n');
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync('store/videos')
      .filter((f) => /\.(mp4|jpg|txt)$/.test(f))
      .map((f) => join('store/videos', f));

token = await accessToken();
const root = await folder(FOLDER);
const shorts = await folder('Shorts', root);
const youtube = await folder('YouTube', root);
let sent = 0;
for (const f of files) {
  const parent = basename(f).startsWith('short-') ? shorts : youtube;
  if (await exists(basename(f), parent)) {
    console.log(`  ${basename(f)}: already there`);
    continue;
  }
  await upload(f, parent);
  sent++;
}
console.log(`${sent} uploaded to "${FOLDER}" in Google Drive.`);
