/**
 * Purpose:  render one document and report what could not be drawn.
 * Ensures:  both resolver hooks are pure lookups — nothing here waits on I/O.
 *
 * STEP 2 and STEP 5 own this file.
 */
import type { HostMessage } from '../src/preview/protocol';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const msg = event.data;
  if (msg.type !== 'render') return;

  const assetMisses = new Set<string>();

  // Both hooks are synchronous by the core's contract. That is why the host
  // resolved everything first. Never try to read a file from in here.
  const _resolveImport = (url: string): string | null => msg.imports[url] ?? null;
  const _resolveAsset = (path: string): string | null => {
    const uri = msg.assets[path];
    if (uri === undefined) assetMisses.add(path);
    return uri ?? null;
  };

  // Step 2: load the layout engine, render into the container, and surface
  // every warning the core returns. Do not filter them.
  throw new Error('Step 2: render here.');

  // eslint-disable-next-line no-unreachable
  vscode.postMessage({ type: 'asset-misses', paths: [...assetMisses] });
});

vscode.postMessage({ type: 'ready' });
