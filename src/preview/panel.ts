/**
 * Purpose:  own the webview's lifetime and feed it finished render inputs.
 * Ensures:  every message sent is complete — the webview never asks for a file.
 */
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { resolveAssetRoundTrip, type GuidIndexCache, type ResolvedAsset } from './assets';
import { collectImports, readStylesheet, resolveStylesheetPath, watchTargets } from './imports';
import { contentSecurityPolicy, nonce } from './csp';
import type { RenderFailure, RenderRequest, WebviewMessage } from './protocol';

const decoder = new TextDecoder();
const SAVE_DEBOUNCE_MS = 75;
const ACTIVE_STATES = new Set(['hover', 'active', 'focus', 'disabled']);

export class PreviewPanel implements vscode.Disposable {
  static readonly viewType = 'uxmlPreview.panel';
  private static readonly panels = new Map<string, PreviewPanel>();

  private readonly disposables: vscode.Disposable[] = [];
  private readonly watchDisposables: vscode.Disposable[] = [];
  private readonly dist: vscode.Uri;
  private readonly key: string;
  // Panel-owned: reuse one in-memory scan and discard it when this panel dies.
  private readonly guidIndexCache: GuidIndexCache = {};
  private assetRoots: readonly string[] = [];
  private activeStates: readonly string[] = [];
  private lastRequest: RenderRequest | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  /**
   * Deps/Effects: owns the panel, message, and configuration subscriptions.
   *               `release` disposes them, current watchers, and the timer.
   */
  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly uri: vscode.Uri,
    extensionUri: vscode.Uri,
  ) {
    this.key = uri.toString();
    this.dist = vscode.Uri.joinPath(extensionUri, 'dist');
    this.disposables.push(
      panel.onDidDispose(() => this.release()),
      panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.onMessage(message)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('uxmlPreview.canvas', this.uri)) this.renderOptions();
      }),
    );

    const token = nonce();
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
    panel.webview.html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(panel.webview.cspSource, token)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UXML Preview</title>
  <style>
    body {
      height: 100vh;
      margin: 0;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    #control-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
      padding: 6px 10px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      z-index: 2;
    }
    #control-bar .control-group {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 0;
      border: 0;
      flex: 0 0 auto;
    }
    #control-bar .control-group + .control-group {
      padding-left: 12px;
      border-left: 1px solid var(--vscode-panel-border);
    }
    #control-bar label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    #control-bar input[type="number"] {
      box-sizing: border-box;
      width: 5rem;
      height: 26px;
      padding: 2px 5px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      appearance: textfield;
    }
    #control-bar input[type="number"]::-webkit-inner-spin-button,
    #control-bar input[type="number"]::-webkit-outer-spin-button { margin: 0; appearance: none; }
    #control-bar button {
      padding: 3px 7px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-panel-border);
      cursor: pointer;
    }
    #control-bar button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #control-bar button.active {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    #control-bar button.active:hover { background: var(--vscode-button-hoverBackground); }
    #control-bar input[type="checkbox"] {
      appearance: none;
      display: grid;
      place-content: center;
      width: 14px;
      height: 14px;
      margin: 0;
      color: var(--vscode-checkbox-foreground);
      background: var(--vscode-checkbox-background);
      border: 1px solid var(--vscode-checkbox-border);
    }
    #control-bar input[type="checkbox"]::before { content: "✓"; visibility: hidden; }
    #control-bar input[type="checkbox"]:checked::before { visibility: visible; }
    #state-controls input:checked + span { color: var(--vscode-textLink-foreground); }
    #canvas-size { margin-left: auto; padding: 3px 7px; color: var(--vscode-descriptionForeground); white-space: nowrap; }
    :where(input, button, summary):focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
    #preview-viewport {
      min-width: 0;
      min-height: 0;
      position: relative;
      overflow: hidden;
      background: var(--vscode-input-background);
    }
    #preview-scroll { position: absolute; inset: 0; overflow: auto; }
    #preview {
      background-color: var(--vscode-editor-background);
      background-image:
        linear-gradient(45deg, color-mix(in srgb, var(--vscode-panel-border) 25%, var(--vscode-editor-background)) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--vscode-panel-border) 25%, var(--vscode-editor-background)) 75%),
        linear-gradient(45deg, color-mix(in srgb, var(--vscode-panel-border) 25%, var(--vscode-editor-background)) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--vscode-panel-border) 25%, var(--vscode-editor-background)) 75%);
      background-position: 0 0, 16px 16px;
      background-size: 32px 32px;
      box-shadow: inset 0 0 0 1px var(--vscode-panel-border);
    }
    /* VS Code high-contrast themes need explicit edges, not deliberately low-contrast texture. */
    body.vscode-high-contrast #preview,
    body.vscode-high-contrast-light #preview {
      background-image: none;
      box-shadow: inset 0 0 0 2px var(--vscode-contrastBorder);
    }
    #warning-panel {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      max-height: 30vh;
      overflow: auto;
      overflow-x: hidden;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-panel-border);
    }
    #warning-panel summary {
      padding: 6px 10px;
      cursor: pointer;
      list-style: none;
      overflow-wrap: anywhere;
    }
    #warning-panel summary::-webkit-details-marker { display: none; }
    #warning-panel summary::before {
      content: "▸";
      display: inline-block;
      width: 1.2em;
      color: var(--vscode-descriptionForeground);
    }
    #warning-panel details[open] > summary::before { content: "▾"; }
    #warnings [data-group] { padding: 0 10px 6px; }
    #warnings [data-group="A"] > summary { color: var(--vscode-editorWarning-foreground); }
    #warnings ul { margin: 0; padding-left: 2em; }
    #warnings li { margin: 4px 0; overflow-wrap: anywhere; }
    .host-context {
      margin-top: 3px;
      padding-left: 8px;
      color: var(--vscode-descriptionForeground);
      border-left: 2px solid var(--vscode-panel-border);
    }
    .render-error { color: var(--vscode-editorError-foreground); }
    a { color: var(--vscode-textLink-foreground); }
    .uxml-unsupported-control {
      outline: 2px dashed var(--vscode-editorWarning-foreground);
      outline-offset: -2px;
    }
    .uxml-unsupported-control[data-uxml-unsupported-count]::after {
      content: attr(data-uxml-unsupported-count);
      position: absolute;
      top: 0;
      right: 0;
      padding: 0 4px;
      background: var(--vscode-editorWarning-foreground);
      color: var(--vscode-editor-background);
    }
  </style>
</head>
<body>
  <header id="control-bar" aria-label="Preview controls">
    <div id="size-inputs" class="control-group">
      <label>Width <input id="canvas-width" type="number" min="1" step="1"></label>
      <label>Height <input id="canvas-height" type="number" min="1" step="1"></label>
    </div>
    <fieldset class="control-group" aria-label="Canvas presets">
      <button type="button" data-width="1920" data-height="1080">1920×1080</button>
      <button type="button" data-width="1280" data-height="720">1280×720</button>
      <button type="button" data-width="800" data-height="600">800×600</button>
    </fieldset>
    <label class="control-group"><input id="fit-to-panel" type="checkbox"> Fit to panel</label>
    <fieldset id="state-controls" class="control-group" aria-label="Active pseudo-class states">
      <label><input name="active-state" type="checkbox" value="hover"><span>hover</span></label>
      <label><input name="active-state" type="checkbox" value="active"><span>active</span></label>
      <label><input name="active-state" type="checkbox" value="focus"><span>focus</span></label>
      <label><input name="active-state" type="checkbox" value="disabled"><span>disabled</span></label>
    </fieldset>
    <output id="canvas-size"></output>
  </header>
  <div id="preview-viewport"><div id="preview-scroll"><div id="preview"></div></div></div>
  <aside id="warning-panel" aria-label="UXML preview warnings">
    <div id="warnings"></div>
  </aside>
  <script type="module" nonce="${token}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Deps/Effects: creates at most one panel per document URI. The extension
   *               context disposes it on deactivation; `onDidDispose` removes
   *               it from the map and disposes its message subscription.
   */
  static open(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    column: vscode.ViewColumn,
  ): void {
    const key = uri.toString();
    const existing = this.panels.get(key);
    if (existing !== undefined) {
      existing.panel.reveal(column);
      return;
    }

    const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
    const panel = vscode.window.createWebviewPanel(
      this.viewType,
      'UXML Preview',
      column,
      { enableScripts: true, localResourceRoots: [dist] },
    );
    const preview = new PreviewPanel(panel, uri, context.extensionUri);
    this.panels.set(key, preview);
    context.subscriptions.push(preview);
  }

  dispose(): void {
    if (this.disposed) return;
    this.panel.dispose();
    this.release();
  }

  private release(): void {
    if (this.disposed) return;
    this.disposed = true;
    PreviewPanel.panels.delete(this.key);
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    for (const disposable of this.watchDisposables.splice(0)) disposable.dispose();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }

  private onMessage(message: WebviewMessage): void {
    if (message.type === 'asset-misses') {
      this.runAssetRoundTrip(message.paths);
      return;
    }
    if (message.type === 'canvas-settings') {
      this.runCanvasSettings(message.canvas, message.fitToPanel);
      return;
    }
    if (message.type === 'active-states') {
      this.activeStates = [...new Set(message.activeStates.filter((state) => ACTIVE_STATES.has(state)))];
      this.renderOptions();
      return;
    }
    if (this.lastRequest === undefined) this.runRender();
    else void this.panel.webview.postMessage(this.lastRequest);
  }

  private runCanvasSettings(
    canvas: { readonly width: number; readonly height: number },
    fitToPanel: boolean,
  ): void {
    if (!Number.isInteger(canvas.width) || canvas.width < 1 || !Number.isInteger(canvas.height) || canvas.height < 1) return;
    const config = vscode.workspace.getConfiguration('uxmlPreview', this.uri);
    void Promise.all([
      config.update('canvas.width', canvas.width, vscode.ConfigurationTarget.Workspace),
      config.update('canvas.height', canvas.height, vscode.ConfigurationTarget.Workspace),
      config.update('canvas.fitToPanel', fitToPanel, vscode.ConfigurationTarget.Workspace),
    ]).catch((error: unknown) => {
      if (!this.disposed) void vscode.window.showErrorMessage(`UXML Preview: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private renderOptions(): void {
    const request = this.lastRequest;
    if (request === undefined || this.disposed) return;
    const config = vscode.workspace.getConfiguration('uxmlPreview', this.uri);
    const next: RenderRequest = {
      ...request,
      canvas: {
        width: config.get<number>('canvas.width', 1920),
        height: config.get<number>('canvas.height', 1080),
      },
      fitToPanel: config.get<boolean>('canvas.fitToPanel', false),
      activeStates: this.activeStates,
    };
    this.lastRequest = next;
    void this.panel.webview.postMessage(next);
  }

  private runRender(): void {
    void this.renderOnce().catch((error: unknown) => {
      if (!this.disposed) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`UXML Preview: ${detail}`);
      }
    });
  }

  private runAssetRoundTrip(paths: readonly string[]): void {
    void this.renderResolvedAssets(paths).catch((error: unknown) => {
      if (!this.disposed) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`UXML Preview: ${detail}`);
      }
    });
  }

  private setAssetRoots(resourceRoots: readonly string[]): void {
    if (
      this.assetRoots.length === resourceRoots.length
      && this.assetRoots.every((root, index) => root === resourceRoots[index])
    ) return;
    this.assetRoots = [...resourceRoots];
    this.panel.webview.options = {
      ...this.panel.webview.options,
      // vscode: asWebviewUri needs these roots; expose only folders of files that resolved.
      localResourceRoots: [this.dist, ...resourceRoots.map((root) => vscode.Uri.file(root))],
    };
  }

  private async resolveAsset(assetPath: string, projectRoot: string): Promise<ResolvedAsset | null> {
    const filePath = resolveStylesheetPath(
      assetPath,
      this.uri.fsPath,
      projectRoot,
      vscode.workspace.getWorkspaceFolder(this.uri)?.uri.fsPath,
    );
    if (filePath === null) return null;

    return this.resolveAssetFile(filePath);
  }

  private async resolveAssetFile(filePath: string): Promise<ResolvedAsset | null> {
    const directory = path.dirname(filePath);
    if (directory === path.parse(directory).root || path.resolve(directory) === path.resolve(os.homedir())) return null;

    const fileUri = vscode.Uri.file(filePath);
    try {
      const stat = await vscode.workspace.fs.stat(fileUri);
      if ((stat.type & vscode.FileType.File) === 0) return null;
      return { filePath, uri: this.panel.webview.asWebviewUri(fileUri).toString() };
    } catch {
      return null;
    }
  }

  private async renderResolvedAssets(paths: readonly string[]): Promise<void> {
    const request = this.lastRequest;
    if (request === undefined || request.assetsResolved || this.disposed) return;

    const claimed = { ...request, assetsResolved: true };
    this.lastRequest = claimed;
    const result = await resolveAssetRoundTrip(request, paths, {
      cache: this.guidIndexCache,
      projectRoot: request.projectRoot,
      resolvePath: (assetPath) => this.resolveAsset(assetPath, request.projectRoot),
      resolveIndexedPath: (filePath) => this.resolveAssetFile(filePath),
    });
    if (result === null || this.disposed || this.lastRequest !== claimed) return;

    this.lastRequest = result.request;
    // Updating localResourceRoots reloads the webview; ready must replay this completed request.
    this.setAssetRoots(result.resourceRoots);
    await this.panel.webview.postMessage(result.request);
  }

  private scheduleRender(): void {
    if (this.disposed) return;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.runRender();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Deps/Effects: disposes every previous watcher and its listeners. `release`
   *               owns and disposes the replacement set when the panel closes.
   */
  private replaceWatchers(targets: readonly string[]): void {
    for (const disposable of this.watchDisposables.splice(0)) disposable.dispose();

    for (const target of targets) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(path.dirname(target)), path.basename(target)),
      );
      this.watchDisposables.push(
        watcher.onDidCreate(() => this.scheduleRender()),
        watcher.onDidChange(() => this.scheduleRender()),
        watcher.onDidDelete(() => this.scheduleRender()),
        watcher,
      );
    }
  }

  /**
   * Deps/Effects: reads the UXML and every discovered stylesheet once, then
   *               posts one complete message if the panel is still alive.
   */
  private async renderOnce(): Promise<void> {
    try {
      const uxml = decoder.decode(await vscode.workspace.fs.readFile(this.uri));
      const config = vscode.workspace.getConfiguration('uxmlPreview', this.uri);
      const projectRoot = config.get<string>('projectRoot', '');
      const workspaceRoot = vscode.workspace.getWorkspaceFolder(this.uri)?.uri.fsPath;
      const { request, importPaths } = await buildRenderRequest(
        uxml,
        (url) => readStylesheet(
          url,
          this.uri.fsPath,
          projectRoot,
          workspaceRoot,
          async (filePath) => decoder.decode(await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))),
        ),
        {
          width: config.get<number>('canvas.width', 1920),
          height: config.get<number>('canvas.height', 1080),
          fitToPanel: config.get<boolean>('canvas.fitToPanel', false),
        },
        projectRoot,
        this.activeStates,
      );

      if (this.disposed) return;
      this.lastRequest = request;
      this.setAssetRoots([]);
      await this.panel.webview.postMessage(request);
      if (!this.disposed) this.replaceWatchers(watchTargets(this.uri.fsPath, importPaths));
    } catch (error: unknown) {
      if (this.disposed) return;
      this.lastRequest = undefined;
      this.setAssetRoots([]);
      this.replaceWatchers(watchTargets(this.uri.fsPath, []));
      const failure: RenderFailure = {
        type: 'render-error',
        message: error instanceof Error ? error.message : String(error),
      };
      await this.panel.webview.postMessage(failure);
    }
  }
}

/**
 * Assembles one render request.
 *
 * Note the asymmetry between the two hooks, which is easy to miss: import URLs
 * are discovered by `parse()`, which the host can run itself because it needs
 * no DOM. Asset paths are only reached during painting, inside the webview.
 * They therefore cannot be prefetched the same way. The first request leaves
 * `assets` empty; one asset-misses round trip may fill it, and there is no third.
 */
export async function buildRenderRequest(
  uxml: string,
  read: Parameters<typeof collectImports>[2],
  canvas: { width: number; height: number; fitToPanel: boolean },
  projectRoot: string,
  activeStates: readonly string[] = [],
): Promise<{ request: RenderRequest; importPaths: readonly string[] }> {
  const imports = await collectImports(uxml, undefined, read);
  return {
    importPaths: imports.paths,
    request: {
      type: 'render',
      uxml,
      uss: undefined,
      imports: Object.fromEntries(imports.resolved),
      unresolvedImports: imports.unresolved,
      projectRoot,
      assetDiagnostics: [],
      assets: {},
      assetsResolved: false,
      canvas: { width: canvas.width, height: canvas.height },
      // Fixed is the default: fitting makes the same file cross layout thresholds
      // at different panel sizes, so the reader must opt into that variability.
      fitToPanel: canvas.fitToPanel,
      // Empty on purpose, and required so both future UI surfaces stay wired.
      // See AGENTS.md, ponytail exception 1. Step 7 adds active-state toggles;
      // selector-specific state input remains v1.1.
      activeStates,
      states: {},
    },
  };
}

export { contentSecurityPolicy, nonce };
