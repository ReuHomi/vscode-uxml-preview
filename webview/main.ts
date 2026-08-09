/**
 * Purpose:  render one document and report what could not be drawn.
 * Ensures:  both resolver hooks are pure lookups — nothing here waits on I/O.
 */
import { loadLayoutEngine, parse, render } from 'uxml-preview';
import type { RenderResult } from 'uxml-preview';
import type { HostMessage } from '../src/preview/protocol';
import { warningLines, type WarningLine } from './warnings';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
const container = document.querySelector<HTMLElement>('#preview')!;
const warningList = document.querySelector<HTMLUListElement>('#warnings')!;
const layoutEngineReady = loadLayoutEngine();
let current: RenderResult | undefined;

function showWarnings(lines: readonly WarningLine[]): void {
  warningList.replaceChildren(...lines.map(({ source, kind, message }) => {
    const item = document.createElement('li');
    item.textContent = `${source} [${kind}] ${message}`;
    return item;
  }));
}

/**
 * Deps/Effects: frees the current Yoga tree and removes its DOM. Called before
 *               replacement, on refresh failure, and when the webview closes.
 */
function clearRender(): void {
  current?.dispose();
  current = undefined;
  container.replaceChildren();
}

/**
 * Deps/Effects: owns the current RenderResult. Disposes it before replacement;
 *               the unload listener below disposes the final result.
 */
async function renderMessage(msg: HostMessage): Promise<void> {
  if (msg.type !== 'render') return;
  await layoutEngineReady;
  clearRender();

  container.style.width = `${msg.canvas.width}px`;
  container.style.height = `${msg.canvas.height}px`;
  warningList.replaceChildren();

  const assetMisses = new Set<string>();
  const documentModel = parse(msg.uxml, msg.uss, {
    resolveImport: (url) => msg.imports[url] ?? null,
  });
  const result = render(documentModel, container, {
    size: msg.canvas,
    activeStates: new Set(msg.activeStates),
    states: msg.states,
    resolveAsset: (path) => {
      const uri = msg.assets[path];
      if (uri === undefined) assetMisses.add(path);
      return uri ?? null;
    },
  });
  current = result;

  showWarnings(warningLines(documentModel.warnings, result.warnings, msg.unresolvedImports));

  vscode.postMessage({ type: 'asset-misses', paths: [...assetMisses] });
}

/**
 * Deps/Effects: the webview window owns this listener until destruction; every
 *               render routes through `renderMessage`, which owns Yoga cleanup.
 */
window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const msg = event.data;
  if (msg.type === 'render-error') {
    clearRender();
    showWarnings([{ source: 'host', kind: msg.type, message: msg.message }]);
    return;
  }
  void renderMessage(msg).catch((error: unknown) => {
    console.error(error);
    clearRender();
    showWarnings([{
      source: 'host',
      kind: 'render-error',
      message: error instanceof Error ? error.message : String(error),
    }]);
  });
});

window.addEventListener('unload', () => {
  clearRender();
});

vscode.postMessage({ type: 'ready' });
