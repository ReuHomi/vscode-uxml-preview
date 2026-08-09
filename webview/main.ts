/**
 * Purpose:  render one document and report what could not be drawn.
 * Ensures:  both resolver hooks are pure lookups — nothing here waits on I/O.
 */
import { loadLayoutEngine, parse, render } from 'uxml-preview';
import type { RenderResult, SourceRef, UxmlDocument, Warning } from 'uxml-preview';
import type { HostMessage } from '../src/preview/protocol';
import {
  diagnosticGroups,
  warningLines,
  type DivergenceLine,
  type WarningLine,
} from './warnings';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
const container = document.querySelector<HTMLElement>('#preview')!;
const warningPanel = document.querySelector<HTMLElement>('#warnings')!;
const layoutEngineReady = loadLayoutEngine();
let current: RenderResult | undefined;

function warningLocation(at: SourceRef, documentModel: UxmlDocument): string {
  const source = at.in === 'uxml' ? documentModel.source : documentModel.sheets[at.sheet]?.source;
  if (source === undefined) return `${at.in} offset ${at.span.start}`;
  const before = source.slice(0, at.span.start);
  const line = before.split('\n').length;
  const column = at.span.start - before.lastIndexOf('\n');
  return `${at.in === 'uxml' ? 'UXML' : `USS sheet ${at.sheet + 1}`} line ${line}, column ${column}`;
}

function diagnosticItem(
  line: WarningLine | DivergenceLine,
  projectRoot: string,
  documentModel: UxmlDocument | undefined,
): HTMLLIElement {
  const item = document.createElement('li');
  item.append(`${line.source} [${line.kind}] ${line.message}`);
  if (line.source === 'known-divergence') item.append(` — ${line.detail}`);

  if (line.source !== 'known-divergence') {
    let context: string | undefined;
    if (line.kind === 'import-unresolved' || line.kind === 'asset-unresolved') {
      context = projectRoot === ''
        ? 'host: uxmlPreview.projectRoot is empty. Set it in Settings to the Unity project root.'
        : `host: uxmlPreview.projectRoot = ${projectRoot}`;
    } else if (line.kind === 'malformed' && line.at !== undefined && documentModel !== undefined) {
      context = `host: ${warningLocation(line.at, documentModel)}`;
    }
    if (context !== undefined) {
      const host = document.createElement('div');
      host.className = 'host-context';
      host.textContent = context;
      item.append(host);
    }
  }
  return item;
}

function showDiagnostics(
  lines: readonly WarningLine[],
  projectRoot: string,
  documentModel?: UxmlDocument,
  failure?: string,
): void {
  const groups = diagnosticGroups(lines);
  const issueCount = lines.length + (failure === undefined ? 0 : 1);
  const outer = document.createElement('details');
  outer.open = issueCount > 0;
  const summary = document.createElement('summary');
  summary.textContent = `${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}`;
  outer.append(summary);

  const definitions = [
    ['A', 'Fixable', groups.A],
    ['B', 'Waiting for support', groups.B],
    ['C', 'Renderer differences from Unity', groups.C],
  ] as const;
  for (const [key, label, group] of definitions) {
    const count = group.length + (key === 'A' && failure !== undefined ? 1 : 0);
    if (key !== 'C' && count === 0) continue;
    const section = document.createElement('details');
    section.dataset.group = key;
    section.open = key === 'A';
    const heading = document.createElement('summary');
    heading.textContent = `${label} (${count})`;
    const list = document.createElement('ul');
    if (key === 'A' && failure !== undefined) {
      const item = document.createElement('li');
      item.textContent = `host [render-error] ${failure}`;
      list.append(item);
    }
    list.append(...group.map((line) => diagnosticItem(line, projectRoot, documentModel)));
    section.append(heading, list);
    outer.append(section);
  }
  warningPanel.replaceChildren(outer);
}

function markUnsupportedControls(warnings: readonly Warning[], result: RenderResult): void {
  const markers: Array<{ left: number; top: number; element: HTMLElement; count: number }> = [];
  for (const warning of warnings) {
    if (warning.kind !== 'unsupported-control' || warning.node === undefined) continue;
    const element = result.elements.get(warning.node);
    if (element === undefined) continue;
    const box = result.boxes.get(warning.node);
    // Diagnostic chrome says only "the renderer missed something here"; it never
    // imitates Unity or moves the core position. <= 0.5 CSS px is one coordinate,
    // so insignificant Yoga float noise cannot split one truthful count badge.
    const marker = box === undefined ? undefined : markers.find(({ left, top }) => (
      Math.abs(left - box.left) <= 0.5 && Math.abs(top - box.top) <= 0.5
    ));
    if (marker !== undefined) {
      marker.count += 1;
      marker.element.dataset.uxmlUnsupportedCount = String(marker.count);
      continue;
    }
    element.classList.add('uxml-unsupported-control');
    if (box?.height === 0) element.style.minHeight = '16px';
    if (box !== undefined) markers.push({ left: box.left, top: box.top, element, count: 1 });
  }
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
  warningPanel.replaceChildren();

  const assetMisses = new Set<string>();
  const documentModel = parse(msg.uxml, msg.uss, {
    resolveImport: (url) => msg.imports[url] ?? null,
  });
  const result = render(documentModel, container, {
    size: msg.canvas,
    activeStates: new Set(msg.activeStates),
    states: msg.states,
    resolveAsset: (path, _form) => {
      // Step 5 receives core 0.3's form but intentionally leaves resource() for its own step.
      const uri = msg.assets[path];
      if (uri === undefined) assetMisses.add(path);
      return uri ?? null;
    },
  });
  current = result;

  markUnsupportedControls(result.warnings, result);
  showDiagnostics(
    warningLines(documentModel.warnings, result.warnings, msg.unresolvedImports),
    msg.projectRoot,
    documentModel,
  );

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
    showDiagnostics([], '', undefined, msg.message);
    return;
  }
  void renderMessage(msg).catch((error: unknown) => {
    console.error(error);
    clearRender();
    showDiagnostics([], '', undefined, error instanceof Error ? error.message : String(error));
  });
});

window.addEventListener('unload', () => {
  clearRender();
});

vscode.postMessage({ type: 'ready' });
