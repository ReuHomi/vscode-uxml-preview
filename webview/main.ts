/**
 * Purpose:  render one document and report what could not be drawn.
 * Ensures:  both resolver hooks are pure lookups — nothing here waits on I/O.
 */
import { loadLayoutEngine, parse, render } from 'uxml-preview';
import type { RenderResult, SourceRef, UxmlDocument, Warning } from 'uxml-preview';
import { assetKey, importKey, type AssetReference, type HostDiagnostic, type HostMessage, type RenderRequest, type Reveal, type WebviewMessage } from '../src/preview/protocol';
import {
  diagnosticGroups,
  warningLines,
  type DiagnosticItem,
  type DivergenceLine,
  type WarningLine,
} from './warnings';

declare function acquireVsCodeApi(): { postMessage(msg: WebviewMessage): void };
const vscode = acquireVsCodeApi();
const container = document.querySelector<HTMLElement>('#preview')!;
const viewport = document.querySelector<HTMLElement>('#preview-viewport')!;
const warningPanel = document.querySelector<HTMLElement>('#warnings')!;
const widthInput = document.querySelector<HTMLInputElement>('#canvas-width')!;
const heightInput = document.querySelector<HTMLInputElement>('#canvas-height')!;
const fitInput = document.querySelector<HTMLInputElement>('#fit-to-panel')!;
const presetInputs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-width][data-height]'));
const stateInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="active-state"]'));
const canvasSize = document.querySelector<HTMLOutputElement>('#canvas-size')!;
const layoutEngineReady = loadLayoutEngine();
let current: RenderResult | undefined;
let lastRequest: RenderRequest | undefined;

function warningLocation(at: SourceRef, documentModel: UxmlDocument): string {
  const source = at.in === 'uxml' ? documentModel.source : documentModel.sheets[at.sheet]?.source;
  if (source === undefined) return `${at.in} offset ${at.span.start}`;
  const before = source.slice(0, at.span.start);
  const line = before.split('\n').length;
  const column = at.span.start - before.lastIndexOf('\n');
  return `${at.in === 'uxml' ? 'UXML' : `USS sheet ${at.sheet + 1}`} line ${line}, column ${column}`;
}

/**
 * Deps/Effects: appends text and click handlers owned by this diagnostic DOM.
 * Ensures:      only entry UXML or a uniquely imported USS URL can be revealed;
 *               warnings with template provenance remain plain text.
 */
function appendDiagnosticLine(
  item: HTMLElement,
  line: WarningLine | DivergenceLine | HostDiagnostic,
  projectRoot: string,
  documentModel: UxmlDocument | undefined,
  imports: RenderRequest['imports'],
): void {
  item.append(`${line.source} [${line.kind}] ${line.message}`);
  if (line.source === 'known-divergence') item.append(` — ${line.detail}`);
  if ('reason' in line && (line.reason === 'not-uss' || line.reason === 'invalid-value')
    && line.subject?.kind === 'property' && line.subject.replacements?.length) {
    item.append(` — ${line.subject.replacements.join(', ')}`);
  }
  // Warnings from template stylesheets get no button because the core's at.sheet
  // numbers sheets in the expanded document with the entry sheets first, so a
  // template sheet's index runs past the entry model's sheet list. This relies on
  // the core's internal ordering, not its public contract. The case
  // "links the entry stylesheet warning but not one from a stylesheet a template brought in"
  // (commit b60d25b) pins it.
  if ('at' in line && line.at !== undefined && documentModel !== undefined) {
    const at = line.at;
    let url: string | null | undefined;
    if (at.in === 'uxml') {
      if (line.sourceDocument == null) url = null;
    } else {
      const sheet = documentModel.sheets[at.sheet];
      if (sheet !== undefined && typeof sheet.origin === 'string'
        && imports.filter((entry) => entry.url === sheet.origin).length === 1) {
        url = sheet.origin;
      }
    }
    if (url !== undefined) {
      const message: Reveal = { type: 'reveal', url, offset: at.span.start };
      const link = document.createElement('button');
      link.type = 'button';
      link.dataset.reveal = '';
      link.textContent = 'Show source';
      link.addEventListener('click', () => vscode.postMessage(message));
      item.append(' ', link);
    }
  }
  if ('sourceDocument' in line && typeof line.sourceDocument === 'string' && line.sourceDocument !== '') {
    const source = document.createElement('div');
    source.className = 'host-context source-document';
    source.textContent = `source: ${line.sourceDocument}`;
    item.append(source);
  }
  if (line.source !== 'known-divergence') {
    let context: string | undefined;
    if (line.kind === 'import-unresolved' || line.kind === 'asset-unresolved') {
      context = projectRoot === ''
        ? 'host: uxmlPreview.projectRoot is empty. Set it in Settings to the Unity project root.'
        : `host: uxmlPreview.projectRoot = ${projectRoot}`;
    } else if (line.kind === 'malformed' && 'at' in line && line.at !== undefined && documentModel !== undefined) {
      context = `host: ${warningLocation(line.at, documentModel)}`;
    }
    if (context !== undefined) {
      const host = document.createElement('div');
      host.className = 'host-context';
      host.textContent = context;
      item.append(host);
    }
  }
}

function diagnosticItem(
  line: WarningLine | DivergenceLine | HostDiagnostic,
  projectRoot: string,
  documentModel: UxmlDocument | undefined,
  imports: RenderRequest['imports'],
): HTMLLIElement {
  const item = document.createElement('li');
  appendDiagnosticLine(item, line, projectRoot, documentModel, imports);
  return item;
}

function actionableItem(
  item: DiagnosticItem,
  projectRoot: string,
  documentModel: UxmlDocument | undefined,
  imports: RenderRequest['imports'],
): HTMLLIElement {
  const [primary, ...context] = item.lines;
  const element = diagnosticItem(primary!, projectRoot, documentModel, imports);
  for (const line of context) {
    const host = document.createElement('div');
    host.className = 'host-context';
    appendDiagnosticLine(host, line, projectRoot, documentModel, imports);
    element.append(host);
  }
  if (item.occurrences > 1) {
    const count = document.createElement('div');
    count.className = 'host-context';
    count.textContent = `host: referenced in ${item.occurrences} places`;
    element.append(count);
  }
  return element;
}

function showDiagnostics(
  lines: readonly WarningLine[],
  projectRoot: string,
  hostDiagnostics: readonly HostDiagnostic[] = [],
  documentModel?: UxmlDocument,
  failure?: string,
  canvas?: { readonly width: number; readonly height: number },
  imports: RenderRequest['imports'] = [],
): void {
  const groups = diagnosticGroups(lines, hostDiagnostics);
  const issueCount = groups.A.length
    + groups.B.length
    + groups.C.filter(({ source }) => source !== 'known-divergence').length
    + (failure === undefined ? 0 : 1);
  const outer = document.createElement('details');
  outer.open = issueCount > 0;
  const summary = document.createElement('summary');
  const divergenceCount = groups.C.filter(({ source }) => source === 'known-divergence').length;
  summary.textContent = canvas !== undefined && issueCount === 0
    ? `${canvas.width} × ${canvas.height} · ${groups.B.length} unsupported · ${divergenceCount} known divergences`
    : `${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}`;
  outer.append(summary);
  if (groups.layoutMayDiffer) {
    const notice = document.createElement('p');
    notice.dataset.layoutNotice = '';
    notice.textContent = "this preview's coordinates may differ from Unity's";
    outer.append(notice);
  }

  const definitions = [
    ['A', 'Fixable', groups.A],
    ['B', 'Waiting for support', groups.B],
    ['C', 'Renderer differences from Unity', groups.C],
    ['D', 'Notes', groups.D],
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
      item.className = 'render-error';
      item.textContent = `host [render-error] ${failure}`;
      list.append(item);
    }
    if (key === 'A') {
      list.append(...groups.A.map((item) => actionableItem(item, projectRoot, documentModel, imports)));
    } else {
      const linesInGroup = key === 'B' ? groups.B : key === 'C' ? groups.C : groups.D;
      list.append(...linesInGroup.map((line) => diagnosticItem(line, projectRoot, documentModel, imports)));
    }
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

  lastRequest = msg;
  const canvas = msg.fitToPanel ? {
    width: viewport.clientWidth > 0 ? Math.floor(viewport.clientWidth) : msg.canvas.width,
    height: viewport.clientHeight > 0 ? Math.floor(viewport.clientHeight) : msg.canvas.height,
  } : msg.canvas;

  container.style.width = `${canvas.width}px`;
  container.style.height = `${canvas.height}px`;
  widthInput.value = String(canvas.width);
  heightInput.value = String(canvas.height);
  fitInput.checked = msg.fitToPanel;
  for (const input of stateInputs) input.checked = msg.activeStates.includes(input.value);
  for (const preset of presetInputs) {
    const active = Number(preset.dataset.width) === canvas.width && Number(preset.dataset.height) === canvas.height;
    preset.classList.toggle('active', active);
    preset.setAttribute('aria-pressed', String(active));
  }
  canvasSize.textContent = `${canvas.width} × ${canvas.height}`;
  warningPanel.replaceChildren();

  const assetMisses = new Map<string, AssetReference>();
  const imports = new Map(msg.imports.map(({ url, from, text }) => [importKey(url, from), text]));
  const documentModel = parse(msg.uxml, msg.uss, {
    resolveImport: (url, from) => imports.get(importKey(url, from)) ?? null,
  });
  const result = render(documentModel, container, {
    size: canvas,
    activeStates: new Set(msg.activeStates),
    states: msg.states,
    resolveAsset: (path, form) => {
      const key = assetKey(path, form);
      const uri = msg.assets[key];
      if (uri === undefined) assetMisses.set(key, { path, form });
      return uri ?? null;
    },
  });
  current = result;

  markUnsupportedControls(result.warnings, result);
  showDiagnostics(
    warningLines(documentModel.warnings, result.warnings, msg.unresolvedImports, [...assetMisses.values()]),
    msg.projectRoot,
    [...msg.importDiagnostics, ...msg.assetDiagnostics],
    documentModel,
    undefined,
    canvas,
    msg.imports,
  );

  vscode.postMessage({ type: 'asset-misses', references: [...assetMisses.values()] });
}

function postCanvasSettings(canvas: { width: number; height: number }, fitToPanel: boolean): void {
  if (!Number.isInteger(canvas.width) || canvas.width < 1 || !Number.isInteger(canvas.height) || canvas.height < 1) return;
  vscode.postMessage({ type: 'canvas-settings', canvas, fitToPanel });
}

function canvasFromInputs(): { width: number; height: number } {
  const fallback = lastRequest?.canvas ?? { width: 1, height: 1 };
  const width = Number(widthInput.value);
  const height = Number(heightInput.value);
  const canvas = {
    width: Number.isFinite(width) ? Math.max(1, Math.trunc(width)) : fallback.width,
    height: Number.isFinite(height) ? Math.max(1, Math.trunc(height)) : fallback.height,
  };
  widthInput.value = String(canvas.width);
  heightInput.value = String(canvas.height);
  return canvas;
}

for (const input of [widthInput, heightInput]) {
  input.addEventListener('change', () => postCanvasSettings(canvasFromInputs(), fitInput.checked));
  input.addEventListener('keydown', (event) => {
    const direction = event.key === 'ArrowUp' || event.key === 'PageUp'
      ? 1
      : event.key === 'ArrowDown' || event.key === 'PageDown' ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const amount = event.key === 'PageUp' || event.key === 'PageDown' ? 100 : event.shiftKey ? 10 : 1;
    const value = Number(input.value);
    input.value = String(Math.max(1, (Number.isFinite(value) ? Math.trunc(value) : 1) + direction * amount));
    postCanvasSettings(canvasFromInputs(), fitInput.checked);
  });
  input.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
}
fitInput.addEventListener('change', () => {
  if (lastRequest !== undefined) postCanvasSettings(lastRequest.canvas, fitInput.checked);
});
for (const preset of presetInputs) {
  preset.addEventListener('click', () => postCanvasSettings({
    width: Number(preset.dataset.width),
    height: Number(preset.dataset.height),
  }, false));
}
for (const input of stateInputs) {
  input.addEventListener('change', () => vscode.postMessage({
    type: 'active-states',
    activeStates: stateInputs.filter(({ checked }) => checked).map(({ value }) => value),
  }));
}

window.addEventListener('resize', () => {
  if (lastRequest?.fitToPanel) void renderMessage(lastRequest);
});

/**
 * Deps/Effects: the webview window owns this listener until destruction; every
 *               render routes through `renderMessage`, which owns Yoga cleanup.
 */
window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const msg = event.data;
  if (msg.type === 'render-error') {
    clearRender();
    showDiagnostics([], '', [], undefined, msg.message);
    return;
  }
  void renderMessage(msg).catch((error: unknown) => {
    console.error(error);
    clearRender();
    showDiagnostics([], '', [], undefined, error instanceof Error ? error.message : String(error));
  });
});

window.addEventListener('unload', () => {
  clearRender();
});

vscode.postMessage({ type: 'ready' });
