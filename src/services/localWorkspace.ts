import { isAutoReadRequested, subscribeAutoApproveRequests } from './autoApprove';

export interface WorkspaceFileEntry {
  path: string;
  size: number;
}

export interface WorkspaceSnapshot {
  status: 'disconnected' | 'needs_permission' | 'connected';
  folderName?: string;
  files: WorkspaceFileEntry[];
  truncated: boolean;
}

interface FSFileHandleLike {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface FSDirectoryHandleLike {
  kind: 'directory';
  name: string;
  entries: () => AsyncIterableIterator<[string, FSDirectoryHandleLike | FSFileHandleLike]>;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FSDirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FSFileHandleLike>;
  resolve?: (handle: FSFileHandleLike) => Promise<string[] | null>;
  queryPermission?: (descriptor?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (descriptor?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<'granted' | 'denied' | 'prompt'>;
}

const DB_NAME = 'free-ai-hub-workspace';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'active-dir';

const MAX_INDEXED_FILES = 400;
const MAX_READ_BYTES = 256 * 1024; // 256 KB safety limit per file
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  'build',
  '.cache',
  '.turbo',
  '__pycache__',
  '.venv',
  'venv',
]);

let activeHandle: FSDirectoryHandleLike | null = null;
let cachedFiles: WorkspaceFileEntry[] = [];
let cachedTruncated = false;

export const MAX_AUTO_PREVIEW_FILES = 2;
export const MAX_AUTO_PREVIEW_BYTES = 8 * 1024;
const AUTO_PREVIEW_EXTENSIONS = /\.(txt|md)$/i;
const SENSITIVE_PREVIEW_NAME = /api[-_ ]?key|auth|backup|config|cookie|cred|dotenv|env|key|pass|private|profile|secr[ei]|session|settings|token|vault/i;
const WINDOWS_RESERVED_NAME = /^(aux|con|nul|prn|com[0-9]|lpt[0-9]) *(?:\.|$)/i;
const SYSTEM_PREVIEW_NAME = /^(appdata|desktop|documents|downloads|programdata|program files(?: \(x86\))?|system32|users|windows)$/i;
const SAFE_PREVIEW_SEGMENT = /^[a-z0-9_-](?:[a-z0-9._ -]{0,78}[a-z0-9_-])?$/i;
const NON_TEXT_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export interface WorkspaceReadPreviewScope {
  readonly folderName: string;
}

export interface WorkspaceReadPreviewFile {
  path: string;
  content: string;
}

let previewScope: { token: WorkspaceReadPreviewScope; handle: FSDirectoryHandleLike } | null = null;
let previewScopeRevision = 0;
const previewScopeListeners = new Set<() => void>();

function notifyPreviewScopeChanged(): void {
  for (const listener of previewScopeListeners) listener();
}

export function revokeWorkspaceReadPreviewScope(): void {
  previewScopeRevision += 1;
  if (!previewScope) return;
  previewScope = null;
  notifyPreviewScopeChanged();
}

function setActiveWorkspaceHandle(handle: FSDirectoryHandleLike | null): void {
  if (activeHandle !== handle) revokeWorkspaceReadPreviewScope();
  activeHandle = handle;
}

export function subscribeWorkspaceReadPreviewScope(listener: () => void): () => void {
  previewScopeListeners.add(listener);
  return () => { previewScopeListeners.delete(listener); };
}

subscribeAutoApproveRequests((saved) => {
  if (!saved?.readFile) revokeWorkspaceReadPreviewScope();
});

export function getWorkspaceReadPreviewScope(): WorkspaceReadPreviewScope | null {
  return previewScope && previewScope.handle === activeHandle && isAutoReadRequested() ? previewScope.token : null;
}

function isSafePreviewSegment(segment: string): boolean {
  return SAFE_PREVIEW_SEGMENT.test(segment) &&
    !WINDOWS_RESERVED_NAME.test(segment) &&
    !SYSTEM_PREVIEW_NAME.test(segment) &&
    !SENSITIVE_PREVIEW_NAME.test(segment) &&
    !IGNORED_DIRS.has(segment.toLowerCase());
}

export async function activateWorkspaceReadPreviewScope(): Promise<WorkspaceReadPreviewScope> {
  if (!isAutoReadRequested()) throw new Error('Salva prima la preferenza «Leggere file».');
  if (isRunningInIframe()) throw new Error('Apri il portale in una scheda autonoma o nella PWA.');
  const handle = activeHandle;
  if (!handle) throw new Error('Collega prima una cartella dedicata nella chat.');
  if (!isSafePreviewSegment(handle.name)) throw new Error('Seleziona una cartella dedicata con un nome semplice e non sensibile.');
  const revision = ++previewScopeRevision;
  if (!handle.resolve || (await handle.queryPermission?.({ mode: 'read' })) !== 'granted') {
    throw new Error('Permesso di lettura non attivo o browser non supportato. Verifica la cartella nella chat.');
  }
  if (revision !== previewScopeRevision || handle !== activeHandle || !isAutoReadRequested()) {
    throw new Error('Preferenza o cartella cambiata: riprova.');
  }
  const token = Object.freeze({ folderName: handle.name });
  previewScope = { token, handle };
  notifyPreviewScopeChanged();
  return token;
}

function validatePreviewPaths(paths: readonly string[]): string[][] | null {
  if (paths.length === 0 || paths.length > MAX_AUTO_PREVIEW_FILES ||
      paths.some((path) => typeof path !== 'string' || path.length > 400)) return null;
  const segments = paths.map((path) => path.split('/'));
  if (new Set(paths.map((path) => path.toLowerCase())).size !== paths.length ||
      segments.some((parts) => parts.length > 5 || !parts.every(isSafePreviewSegment) ||
        !AUTO_PREVIEW_EXTENSIONS.test(parts[parts.length - 1]))) return null;
  return segments;
}

export async function readWorkspaceLocalPreviews(
  scope: WorkspaceReadPreviewScope,
  paths: readonly string[],
  isCurrent: () => boolean,
): Promise<WorkspaceReadPreviewFile[] | null> {
  const handle = previewScope?.handle;
  if (getWorkspaceReadPreviewScope() !== scope || !handle?.resolve || !handle.queryPermission) return null;
  const segments = validatePreviewPaths(paths);
  if (!segments) return null;
  const stillAllowed = () => isCurrent() && getWorkspaceReadPreviewScope() === scope;
  try {
    const results: WorkspaceReadPreviewFile[] = [];
    for (const parts of segments) {
      if (!stillAllowed() || (await handle.queryPermission({ mode: 'read' })) !== 'granted' || !stillAllowed()) {
        return null;
      }
      let dir = handle;
      for (const part of parts.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(part, { create: false });
        if (dir.name !== part || !stillAllowed()) return null;
      }
      const name = parts[parts.length - 1];
      const fileHandle = await dir.getFileHandle(name, { create: false });
      if (fileHandle.name !== name || !stillAllowed()) return null;
      const resolved = await handle.resolve(fileHandle);
      if (!resolved || resolved.length !== parts.length ||
          resolved.some((part, index) => part !== parts[index]) || !stillAllowed()) return null;
      const file = await fileHandle.getFile();
      if (file.size > MAX_AUTO_PREVIEW_BYTES || !stillAllowed()) return null;
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength > MAX_AUTO_PREVIEW_BYTES || !stillAllowed()) return null;
      const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      if (NON_TEXT_CHARS.test(content)) return null;
      results.push({ path: parts.join('/'), content });
    }
    return results;
  } catch {
    return null;
  }
}

export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

export function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
  });
}

async function saveHandleToDb(handle: FSDirectoryHandleLike): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write error'));
    });
    db.close();
  } catch {
    // Non-fatal if IndexedDB persistence is unavailable
  }
}

async function loadHandleFromDb(): Promise<FSDirectoryHandleLike | null> {
  try {
    const db = await openDb();
    const result = await new Promise<FSDirectoryHandleLike | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FSDirectoryHandleLike) || null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read error'));
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

async function clearHandleFromDb(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete error'));
    });
    db.close();
  } catch {
    // Ignore
  }
}

async function indexDirectory(
  root: FSDirectoryHandleLike,
): Promise<{ files: WorkspaceFileEntry[]; truncated: boolean }> {
  const entries: WorkspaceFileEntry[] = [];
  let truncated = false;

  async function walk(dir: FSDirectoryHandleLike, prefix: string): Promise<void> {
    if (entries.length >= MAX_INDEXED_FILES) {
      truncated = true;
      return;
    }
    const subdirs: Array<{ name: string; handle: FSDirectoryHandleLike }> = [];
    for await (const [name, handle] of dir.entries()) {
      if (entries.length >= MAX_INDEXED_FILES) {
        truncated = true;
        break;
      }
      if (handle.kind === 'directory') {
        if (!IGNORED_DIRS.has(name)) {
          subdirs.push({ name, handle });
        }
      } else {
        const rel = prefix ? `${prefix}/${name}` : name;
        let size = 0;
        try {
          const f = await handle.getFile();
          size = f.size;
        } catch {
          size = 0;
        }
        entries.push({ path: rel, size });
      }
    }
    subdirs.sort((a, b) => a.name.localeCompare(b.name));
    for (const sub of subdirs) {
      if (entries.length >= MAX_INDEXED_FILES) {
        truncated = true;
        break;
      }
      await walk(sub.handle, prefix ? `${prefix}/${sub.name}` : sub.name);
    }
  }

  await walk(root, '');
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { files: entries, truncated };
}

export async function restoreWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  if (!supportsDirectoryPicker()) {
    return { status: 'disconnected', files: [], truncated: false };
  }
  const handle = activeHandle ?? (await loadHandleFromDb());
  if (!handle) {
    return { status: 'disconnected', files: [], truncated: false };
  }
  setActiveWorkspaceHandle(handle);

  try {
    const perm = handle.queryPermission
      ? await handle.queryPermission({ mode: 'readwrite' })
      : 'granted';
    if (perm === 'granted') {
      const idx = await indexDirectory(handle);
      cachedFiles = idx.files;
      cachedTruncated = idx.truncated;
      return {
        status: 'connected',
        folderName: handle.name,
        files: idx.files,
        truncated: idx.truncated,
      };
    }
    return {
      status: 'needs_permission',
      folderName: handle.name,
      files: [],
      truncated: false,
    };
  } catch {
    return { status: 'disconnected', files: [], truncated: false };
  }
}

export async function authorizeWorkspaceFolder(): Promise<WorkspaceSnapshot> {
  if (!supportsDirectoryPicker()) {
    throw new Error(
      'Questo browser non supporta l’accesso diretto alle cartelle (usa Chrome o Edge su PC).',
    );
  }
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FSDirectoryHandleLike>;
    }
  ).showDirectoryPicker;

  revokeWorkspaceReadPreviewScope();
  try {
    const handle = await picker({ mode: 'readwrite' });
    if (handle.requestPermission) {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        throw new Error('Autorizzazione in lettura/scrittura rifiutata dall’utente.');
      }
    }
    setActiveWorkspaceHandle(handle);
    await saveHandleToDb(handle);
    const idx = await indexDirectory(handle);
    cachedFiles = idx.files;
    cachedTruncated = idx.truncated;
    return {
      status: 'connected',
      folderName: handle.name,
      files: idx.files,
      truncated: idx.truncated,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Selezione cartella annullata.');
    }
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new Error(
        'Accesso alle cartelle bloccato nell’anteprima iframe. Apri la PWA installata o apri l’app in una nuova scheda autonoma per autorizzare i file del PC.',
      );
    }
    throw err instanceof Error ? err : new Error('Impossibile autorizzare la cartella.');
  }
}

export async function reauthorizeSavedWorkspace(): Promise<WorkspaceSnapshot> {
  revokeWorkspaceReadPreviewScope();
  const handle = activeHandle ?? (await loadHandleFromDb());
  if (!handle) {
    return authorizeWorkspaceFolder();
  }
  if (handle.requestPermission) {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      throw new Error('Autorizzazione in lettura/scrittura non concessa.');
    }
  }
  setActiveWorkspaceHandle(handle);
  const idx = await indexDirectory(handle);
  cachedFiles = idx.files;
  cachedTruncated = idx.truncated;
  return {
    status: 'connected',
    folderName: handle.name,
    files: idx.files,
    truncated: idx.truncated,
  };
}

export async function refreshWorkspaceIndex(): Promise<WorkspaceSnapshot> {
  if (!activeHandle) {
    return { status: 'disconnected', files: [], truncated: false };
  }
  const idx = await indexDirectory(activeHandle);
  cachedFiles = idx.files;
  cachedTruncated = idx.truncated;
  return {
    status: 'connected',
    folderName: activeHandle.name,
    files: idx.files,
    truncated: idx.truncated,
  };
}

export async function disconnectWorkspaceFolder(): Promise<WorkspaceSnapshot> {
  setActiveWorkspaceHandle(null);
  cachedFiles = [];
  cachedTruncated = false;
  await clearHandleFromDb();
  return { status: 'disconnected', files: [], truncated: false };
}

export function sanitizeWorkspaceRelativePath(rawPath: string): string {
  const normalized = rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`Percorso non valido: "${rawPath}". Usa solo percorsi relativi alla cartella autorizzata.`);
  }
  if (normalized.includes('\0')) {
    throw new Error('Percorso non valido.');
  }
  const segments = normalized.split('/').filter((s) => s.length > 0 && s !== '.');
  if (segments.length === 0 || segments.some((s) => s === '..')) {
    throw new Error(`Percorso non consentito: "${rawPath}".`);
  }
  return segments.join('/');
}

async function resolveFileHandle(
  relativePath: string,
  create: boolean,
): Promise<FSFileHandleLike> {
  if (!activeHandle) {
    throw new Error('Nessuna cartella PC autorizzata. Autorizza prima una cartella.');
  }
  if (activeHandle.queryPermission) {
    const perm = await activeHandle.queryPermission({ mode: create ? 'readwrite' : 'read' });
    if (perm !== 'granted') {
      if (activeHandle.requestPermission) {
        const req = await activeHandle.requestPermission({ mode: create ? 'readwrite' : 'read' });
        if (req !== 'granted') {
          throw new Error('Permesso di accesso alla cartella negato.');
        }
      } else {
        throw new Error('Permesso di accesso alla cartella non attivo.');
      }
    }
  }

  const clean = sanitizeWorkspaceRelativePath(relativePath);
  const parts = clean.split('/');
  const fileName = parts.pop()!;

  let dir = activeHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir.getFileHandle(fileName, { create });
}

export async function readWorkspaceFile(relativePath: string): Promise<{
  path: string;
  content: string;
  size: number;
}> {
  const clean = sanitizeWorkspaceRelativePath(relativePath);
  const fileHandle = await resolveFileHandle(clean, false);
  const file = await fileHandle.getFile();
  if (file.size > MAX_READ_BYTES) {
    throw new Error(
      `Il file "${clean}" (${Math.round(file.size / 1024)} KB) supera il limite di lettura testuale di 256 KB.`,
    );
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Basic binary guard: reject files with NUL bytes
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    if (bytes[i] === 0) {
      throw new Error(`Il file "${clean}" sembra essere binario e non può essere letto come testo.`);
    }
  }
  const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return { path: clean, content, size: file.size };
}

export async function checkWorkspaceFilePresence(relativePath: string): Promise<'exists' | 'missing' | 'unknown'> {
  try {
    await resolveFileHandle(relativePath, false);
    return 'exists';
  } catch (err) {
    return err instanceof DOMException && err.name === 'NotFoundError' ? 'missing' : 'unknown';
  }
}

export async function checkWorkspaceFileExists(relativePath: string): Promise<string | null> {
  try {
    const res = await readWorkspaceFile(relativePath);
    return res.content;
  } catch {
    return null;
  }
}

export async function writeWorkspaceFile(
  relativePath: string,
  content: string,
): Promise<{ path: string; bytesWritten: number; snapshot: WorkspaceSnapshot }> {
  const clean = sanitizeWorkspaceRelativePath(relativePath);
  const fileHandle = await resolveFileHandle(clean, true);
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
  const snapshot = await refreshWorkspaceIndex();
  return {
    path: clean,
    bytesWritten: new TextEncoder().encode(content).byteLength,
    snapshot,
  };
}

export function getCachedWorkspaceSnapshot(): WorkspaceSnapshot {
  if (!activeHandle) {
    return { status: 'disconnected', files: [], truncated: false };
  }
  return {
    status: 'connected',
    folderName: activeHandle.name,
    files: cachedFiles,
    truncated: cachedTruncated,
  };
}

export function buildWorkspaceSystemPrompt(
  baseSystemPrompt: string,
  snapshot: WorkspaceSnapshot,
): string {
  if (snapshot.status === 'needs_permission' && snapshot.folderName) {
    return `${baseSystemPrompt}

[ACCESSO CARTELLA PC — PERMESSO DA RIATTIVARE]
Questa applicazione (Free AI Hub) supporta l'accesso locale ai file del PC dell'utente previa autorizzazione esplicita.
L'utente aveva collegato la cartella locale "${snapshot.folderName}", ma il permesso del browser deve essere riattivato.
REGOLA OBBLIGATORIA:
- NON rispondere mai dicendo che sei un'AI basata su cloud o che non puoi accedere ai file del computer dell'utente.
- Se l'utente chiede di leggere, vedere, creare o modificare file o cartelle sul PC, chiedigli di riattivare il permesso ed emetti esattamente questo blocco (così comparirà il pulsante interattivo):
\`\`\`aihub-connect
REASON: Riattiva l'autorizzazione per la cartella "${snapshot.folderName}" sul tuo PC
\`\`\``;
  }

  if (snapshot.status !== 'connected' || !snapshot.folderName) {
    return `${baseSystemPrompt}

[ACCESSO CARTELLA PC — IN ATTESA DI AUTORIZZAZIONE UTENTE]
Questa applicazione (Free AI Hub) consente di leggere, creare e modificare file sul PC dell'utente dopo sua esplicita autorizzazione locale dal browser o dalla PWA installata.
Al momento nessuna cartella del PC è ancora stata collegata in questa sessione.
REGOLA OBBLIGATORIA:
- NON rispondere mai dicendo "non posso accedere al tuo computer perché sono un'AI basata su cloud" e NON chiedere all'utente di fare copia-incolla manuale dei file o degli elenchi.
- Quando l'utente ti chiede di leggere, esplorare, creare o modificare file o cartelle sul suo PC (inclusi percorsi Windows come C:\\... o Desktop/Documenti, oppure macOS/Linux), spiegagli in breve che serve prima la sua autorizzazione sulla cartella ed emetti esattamente questo blocco (così apparirà il pulsante diretto per autorizzarla):
\`\`\`aihub-connect
REASON: Seleziona e autorizza la cartella del tuo PC da collegare
\`\`\``;
  }

  const fileListPreview = snapshot.files
    .slice(0, 120)
    .map((f) => `- ${f.path}`)
    .join('\n');

  const extraNote = snapshot.files.length > 120
    ? `\n... (e altri ${snapshot.files.length - 120} file nella cartella)`
    : '';

  return `${baseSystemPrompt}

[ACCESSO CARTELLA PC AUTORIZZATO DALL'UTENTE]
L'utente ha collegato la cartella locale "${snapshot.folderName}".
File presenti (solo elenco nomi, NON hai ancora accesso al contenuto finché l'utente non autorizza):
${fileListPreview || '(cartella vuota)'}${extraNote}

REGOLE OBBLIGATORIE DI AUTORIZZAZIONE:
1. NON dire mai che sei un'AI basata su cloud e che non puoi accedere ai file locali. Hai accesso controllato alla cartella "${snapshot.folderName}" tramite i blocchi qui sotto.
2. Usa sempre percorsi RELATIVI alla cartella "${snapshot.folderName}" (se l'utente indica un percorso assoluto tipo C:\\...\\${snapshot.folderName}\\file.txt, trasformalo nel percorso relativo corrispondente; se chiede una cartella diversa da "${snapshot.folderName}", proponi \`aihub-connect\` per fargliela autorizzare).
3. Non puoi leggere né modificare direttamente i file senza esplicita autorizzazione dell'utente per ogni operazione:
- Quando ti serve LEGGERE uno o più file per rispondere, inserisci un blocco esattamente in questo formato e attendi che l'utente approvi:
\`\`\`aihub-read
REASON: Spiega brevemente perché ti serve leggere questi file
PATH: percorso/relativo/file1.ext
PATH: percorso/relativo/file2.ext
\`\`\`

- Quando vuoi PROPORRE DI CREARE O MODIFICARE un file sul PC, inserisci un blocco esattamente in questo formato (usando quattro backtick \`\`\`\` se il contenuto del file contiene \`\`\`):
\`\`\`aihub-write
PATH: percorso/relativo/file.ext
REASON: Spiega brevemente cosa stai creando o modificando
---CONTENT---
contenuto completo del file qui
\`\`\`

- Se l'utente chiede di collegare o cambiare cartella sul PC, emetti:
\`\`\`aihub-connect
REASON: Seleziona un'altra cartella sul tuo PC da autorizzare
\`\`\`

Non fingere mai di aver già letto o modificato un file: emetti il blocco di richiesta e lascia che sia l'utente ad autorizzare con il pulsante apposito.`;
}
