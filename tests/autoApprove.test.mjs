import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  AUTO_APPROVE_SECTIONS,
  AUTO_APPROVE_STORAGE_KEY,
  defaultAutoApproveRequests,
  getSavedAutoApproveRequests,
  isAutoReadRequested,
  saveAutoApproveRequests,
} from '../src/services/autoApprove';
import { createCompletedWorkspaceRead } from '../src/services/completedWorkspaceRead';

const storage = new Map();
const browser = Object.assign(new EventTarget(), {
  self: {},
  top: {},
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
  },
  showDirectoryPicker: async () => root,
});
browser.self = browser.top = browser;

class Directory {
  kind = 'directory';
  perm = 'granted';
  requested = 0;
  opens = 0;
  fileHandles = 0;
  bufferReads = 0;
  handles = new Map();
  constructor(name, contents, prefix = [], owner) {
    Object.assign(this, { name, contents, prefix, owner });
  }
  async *entries() {}
  async queryPermission(options) {
    expect(options).toEqual({ mode: 'read' });
    return this.perm;
  }
  async requestPermission() { this.requested++; return this.perm; }
  async getDirectoryHandle(name, options) {
    expect(options).toEqual({ create: false });
    return new Directory(name, this.contents, [...this.prefix, name], this.owner ?? this);
  }
  async getFileHandle(name, options) {
    expect(options).toEqual({ create: false });
    const owner = this.owner ?? this;
    owner.fileHandles++;
    const parts = [...this.prefix, name];
    const bytes = this.contents[parts.join('/')];
    if (bytes === undefined) throw new DOMException('Not found', 'NotFoundError');
    const handle = {
      name,
      kind: 'file',
      getFile: async () => {
        owner.opens++;
        const blob = new Blob([bytes]);
        return {
          size: blob.size,
          arrayBuffer: async () => { owner.bufferReads++; return blob.arrayBuffer(); },
        };
      },
    };
    owner.handles.set(handle, parts);
    return handle;
  }
  async resolve(file) { return this.handles.get(file) ?? null; }
}

let root;
let ws;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(async () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  ws ??= await import('../src/services/localWorkspace');
  storage.clear();
  root = new Directory('Progetto demo', {
    'README.md': '<img src=https://example.invalid>\nCaffè',
    'docs/notes.txt': 'Note',
    'large.txt': 'x'.repeat(ws.MAX_AUTO_PREVIEW_BYTES + 1),
    'limit.txt': 'x'.repeat(ws.MAX_AUTO_PREVIEW_BYTES),
    'binary.txt': Uint8Array.from([65, 0, 66]),
    'invalid.txt': Uint8Array.from([255, 254]),
  });
});

afterEach(async () => {
  await ws.disconnectWorkspaceFolder();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

async function enable() {
  await ws.authorizeWorkspaceFolder();
  saveAutoApproveRequests(defaultAutoApproveRequests());
  root.requested = 0;
  return ws.activateWorkspaceReadPreviewScope();
}

const inSession = () => true;

describe('device-local preference and active folder scope', () => {
  test('catalogue has the exact independent presets; defaults are not saved or operational', () => {
    const defaults = defaultAutoApproveRequests();
    const ids = AUTO_APPROVE_SECTIONS.flatMap((section) => [...section.permissions].map(([id]) => id));
    expect(ids).toHaveLength(83);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.entries(defaults).filter(([, value]) => !value).map(([id]) => id)).toEqual([
      'deleteFile', 'deleteFolder', 'runAsAdministrator', 'uploadFiles', 'fillWebForms', 'submitWebForms',
      'logIn', 'interactWithAccounts', 'installApps', 'uninstallApps', 'changePathOrEnvironment',
      'changeSystemConfiguration', 'stopProcesses', 'changeEnvironment', 'editRegistry',
      'manageWindowsServices', 'changeNetworkConfiguration', 'powerOffOrRestart', 'controlInput',
      'controlWindows', 'captureScreenshots', 'readScreen', 'pushGit', 'changeRemoteBranches',
      'deleteBranches', 'accessLan', 'contactLanDevices', 'startLocalServers', 'openNetworkPorts',
    ]);
    expect(isAutoReadRequested()).toBe(false);
    expect(getSavedAutoApproveRequests()).toBeNull();
    expect(storage.size).toBe(0);

    saveAutoApproveRequests({ ...defaults, runCmd: false, runAsAdministrator: true, readFile: false });
    expect(getSavedAutoApproveRequests()).toEqual({ ...defaults, runCmd: false, runAsAdministrator: true, readFile: false });
    expect(isAutoReadRequested()).toBe(false);
    expect(ws.getWorkspaceReadPreviewScope()).toBeNull();
  });

  test('rejects corrupt, unknown-version or incomplete storage', () => {
    for (const value of ['null', '{', '{"version":1,"requested":{"readFile":true}}',
      JSON.stringify({ version: 2, requested: defaultAutoApproveRequests() })]) {
      storage.set(AUTO_APPROVE_STORAGE_KEY, value);
      expect(getSavedAutoApproveRequests()).toBeNull();
      expect(isAutoReadRequested()).toBe(false);
    }
    saveAutoApproveRequests(defaultAutoApproveRequests());
    expect(isAutoReadRequested()).toBe(true);
    expect(ws.getWorkspaceReadPreviewScope()).toBeNull();
  });

  test('both a real save and separately authorized scope are necessary', async () => {
    await ws.authorizeWorkspaceFolder();
    await expect(ws.activateWorkspaceReadPreviewScope()).rejects.toThrow('Salva prima');
    saveAutoApproveRequests(defaultAutoApproveRequests());
    expect(ws.getWorkspaceReadPreviewScope()).toBeNull();
    const scope = await ws.activateWorkspaceReadPreviewScope();
    expect(scope.folderName).toBe('Progetto demo');
    expect(root.opens).toBe(0);
    expect(await ws.readWorkspaceLocalPreviews({ ...scope }, ['README.md'], inSession)).toBeNull();
    expect(root.fileHandles).toBe(0);
  });

  test('requires an existing browser read grant and never prompts along the preview path', async () => {
    const scope = await enable();
    root.perm = 'prompt';
    expect(await ws.readWorkspaceLocalPreviews(scope, ['README.md'], inSession)).toBeNull();
    await expect(ws.activateWorkspaceReadPreviewScope()).rejects.toThrow('Permesso di lettura non attivo');
    root.perm = 'denied';
    expect(await ws.readWorkspaceLocalPreviews(scope, ['README.md'], inSession)).toBeNull();
    expect(root.requested).toBe(0);
    expect(root.fileHandles).toBe(0);
  });

  test('disconnect, replacement with the same name, and browser opt-out invalidate the scope', async () => {
    const first = await enable();
    await ws.disconnectWorkspaceFolder();
    expect(ws.getWorkspaceReadPreviewScope()).toBeNull();
    root = new Directory('Progetto demo', { 'README.md': 'Different folder' });
    await ws.authorizeWorkspaceFolder();
    const second = await ws.activateWorkspaceReadPreviewScope();
    expect(first).not.toBe(second);
    expect(await ws.readWorkspaceLocalPreviews(first, ['README.md'], inSession)).toBeNull();
    const optedOut = { ...defaultAutoApproveRequests(), readFile: false };
    saveAutoApproveRequests(optedOut);
    expect(await ws.readWorkspaceLocalPreviews(second, ['README.md'], inSession)).toBeNull();
    expect(root.fileHandles).toBe(0);

    saveAutoApproveRequests(defaultAutoApproveRequests());
    expect(ws.getWorkspaceReadPreviewScope()).toBeNull();
    await ws.activateWorkspaceReadPreviewScope();
    const event = Object.assign(new Event('storage'), {
      key: AUTO_APPROVE_STORAGE_KEY,
      newValue: JSON.stringify({ version: 1, requested: optedOut }),
    });
    browser.dispatchEvent(event);
    expect(ws.getWorkspaceReadPreviewScope()).toBeNull();
  });

  test('rejects a workspace root that is hidden, sensitive or an ordinary broad system directory', async () => {
    saveAutoApproveRequests(defaultAutoApproveRequests());
    for (const name of ['.ssh', 'Documents', 'passwords']) {
      root = new Directory(name, {});
      await ws.authorizeWorkspaceFolder();
      await expect(ws.activateWorkspaceReadPreviewScope()).rejects.toThrow('nome semplice e non sensibile');
    }
  });
});

describe('bounded local preview', () => {
  test('loads two allowed UTF-8 files including literal markup, with no permission requests or storage writes', async () => {
    const scope = await enable();
    const before = Array.from(storage);
    expect(await ws.readWorkspaceLocalPreviews(scope, ['README.md', 'docs/notes.txt'], inSession)).toEqual([
      { path: 'README.md', content: '<img src=https://example.invalid>\nCaffè' },
      { path: 'docs/notes.txt', content: 'Note' },
    ]);
    expect(root.bufferReads).toBe(2);
    expect(root.requested).toBe(0);
    expect(Array.from(storage)).toEqual(before);
  });

  test('invalid, sensitive, hidden, ambiguous, or over-limit paths cause no file lookups', async () => {
    const scope = await enable();
    const blocked = [
      [], ['README.md', 'docs/notes.txt', 'third.txt'], ['README.md', 'README.md'], ['README.md', 'readme.md'],
      ['/README.md'], ['C:/README.md'], ['../README.md'], ['docs/../README.md'], ['./README.md'], ['docs//notes.txt'],
      ['docs\\notes.txt'], ['//server/notes.txt'], ['notes.txt:stream'], ['%2e%2e/notes.txt'], ['README.md '],
      ['docs/.notes.txt'], ['.git/notes.txt'], ['auth/todo.txt'], ['private-notes.md'], ['env.txt'],
      ['appdata/notes.txt'], ['node_modules/notes.txt'], ['COM1.txt'], ['notes.pdf'], ['image.png'], ['code.js'],
      ['a/b/c/d/e/notes.txt'], ['re\u202eadme.txt'], ['a'.repeat(405) + '.txt'],
    ];
    for (const paths of blocked) expect(await ws.readWorkspaceLocalPreviews(scope, paths, inSession)).toBeNull();
    expect(root.fileHandles).toBe(0);
  });

  test('checks browser-relative resolution before loading bytes', async () => {
    const scope = await enable();
    root.resolve = async () => ['outside', 'README.md'];
    expect(await ws.readWorkspaceLocalPreviews(scope, ['README.md'], inSession)).toBeNull();
    expect(root.opens).toBe(0);
  });

  test('caps bytes before reading the buffer; rejects missing, binary and malformed UTF-8 files', async () => {
    const scope = await enable();
    expect(await ws.readWorkspaceLocalPreviews(scope, ['large.txt'], inSession)).toBeNull();
    expect(root.bufferReads).toBe(0);
    const exact = await ws.readWorkspaceLocalPreviews(scope, ['limit.txt'], inSession);
    expect(exact?.[0].content.length).toBe(ws.MAX_AUTO_PREVIEW_BYTES);
    for (const path of ['missing.txt', 'binary.txt', 'invalid.txt']) {
      expect(await ws.readWorkspaceLocalPreviews(scope, ['README.md', path], inSession)).toBeNull();
    }
  });

  test('cancels previews when the response is no longer current before or during a read', async () => {
    const scope = await enable();
    expect(await ws.readWorkspaceLocalPreviews(scope, ['README.md'], () => false)).toBeNull();
    expect(root.opens).toBe(0);
    let current = true;
    root.resolve = async (file) => {
      current = false;
      return root.handles.get(file) ?? null;
    };
    expect(await ws.readWorkspaceLocalPreviews(scope, ['README.md'], () => current)).toBeNull();
    expect(root.opens).toBe(0);
  });

  test('keeps write-target checks manual and metadata-only', async () => {
    await enable();
    expect(await ws.checkWorkspaceFilePresence('README.md')).toBe('exists');
    expect(await ws.checkWorkspaceFilePresence('missing.txt')).toBe('missing');
    expect(root.opens).toBe(0);
  });
});

describe('live stream completion gate', () => {
  const read = { type: 'read', id: 'm:1', paths: ['README.md'] };
  const doneSignal = () => new AbortController().signal;
  test('does not parse until a live terminal success and consumes it once', () => {
    let calls = 0;
    const turn = createCompletedWorkspaceRead('m', (messageId, text) => {
      calls++;
      expect([messageId, text]).toEqual(['m', 'completed response']);
      return [{ type: 'markdown' }, read];
    });
    expect(turn.take(doneSignal())).toBeNull();
    expect(calls).toBe(0);
    turn.done('completed response');
    expect(turn.take(doneSignal())).toEqual({ id: read.id, paths: read.paths });
    expect(turn.take(doneSignal())).toBeNull();
    expect(calls).toBe(1);
  });

  test('rejects streaming, failed, aborted, duplicate, empty and excessive responses', () => {
    let calls = 0;
    for (const terminal of [[], ['error'], ['done', 'error'], ['error', 'done'], ['done', 'done'], ['empty'], ['huge']]) {
      const turn = createCompletedWorkspaceRead('m', () => { calls++; return [read]; });
      for (const event of terminal) {
        if (event === 'error') turn.fail();
        else turn.done(event === 'empty' ? '' : event === 'huge' ? 'x'.repeat(64 * 1024 + 1) : 'finished');
      }
      expect(turn.take(doneSignal())).toBeNull();
    }
    expect(calls).toBe(0);
    const turn = createCompletedWorkspaceRead('m', () => [read]);
    turn.done('finished');
    const aborted = new AbortController();
    aborted.abort();
    expect(turn.take(aborted.signal)).toBeNull();
  });

  test('never selects PC exec, writes, connects or mixed/multiple action responses', () => {
    const exec = { type: 'pc-exec', id: 'm:0' };
    const write = { type: 'write', id: 'm:2' };
    const connect = { type: 'connect', id: 'm:3' };
    for (const actions of [[], [exec], [write], [connect], [read, read], [read, write], [exec, read]]) {
      const turn = createCompletedWorkspaceRead('m', () => actions);
      turn.done('finished');
      expect(turn.take(doneSignal())).toBeNull();
    }
  });
});
