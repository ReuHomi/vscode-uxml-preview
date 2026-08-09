/**
 * Purpose:  own the webview's lifetime and feed it finished render inputs.
 * Ensures:  every message sent is complete — the webview never asks for a file.
 */
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { resolveAssetRoundTrip, type ResolvedAsset } from './assets';
import { collectImports, readStylesheet, resolveStylesheetPath, watchTargets } from './imports';
import { contentSecurityPolicy, nonce } from './csp';
import type { RenderFailure, RenderRequest, WebviewMessage } from './protocol';

const decoder = new TextDecoder();
const SAVE_DEBOUNCE_MS = 75;

export class PreviewPanel implements vscode.Disposable {
  static readonly viewType = 'uxmlPreview.panel';
  private static readonly panels = new Map<string, PreviewPanel>();

  private readonly disposables: vscode.Disposable[] = [];
  private readonly watchDisposables: vscode.Disposable[] = [];
  private readonly dist: vscode.Uri;
  private readonly key: string;
  private lastRequest: RenderRequest | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  /**
   * Deps/Effects: owns the panel and message subscriptions. `release` disposes
   *               them, the current file watchers, and the debounce timer.
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
    body { margin: 0; }
    #warning-panel {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      max-height: 30vh;
      overflow: auto;
      background: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-panel-border);
    }
    #warnings > details > summary { padding: 6px 10px; }
    #warnings [data-group] { padding: 0 10px 6px; }
    #warnings li { margin: 4px 0; }
    .host-context { color: var(--vscode-descriptionForeground); }
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
  <div id="preview"></div>
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
    if (message.type === 'ready') this.runRender();
    else this.runAssetRoundTrip(message.paths);
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
    this.panel.webview.options = {
      ...this.panel.webview.options,
      // vscode: asWebviewUri needs these roots; expose only folders of files that resolved.
      localResourceRoots: [this.dist, ...resourceRoots.map((root) => vscode.Uri.file(root))],
    };
  }

  private async resolveAsset(assetPath: string): Promise<ResolvedAsset | null> {
    const config = vscode.workspace.getConfiguration('uxmlPreview', this.uri);
    const filePath = resolveStylesheetPath(
      assetPath,
      this.uri.fsPath,
      config.get<string>('projectRoot', ''),
      vscode.workspace.getWorkspaceFolder(this.uri)?.uri.fsPath,
    );
    if (filePath === null) return null;

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
    const result = await resolveAssetRoundTrip(request, paths, (assetPath) => this.resolveAsset(assetPath));
    if (result === null || this.disposed || this.lastRequest !== claimed) return;

    this.setAssetRoots(result.resourceRoots);
    this.lastRequest = result.request;
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
        },
        projectRoot,
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
  canvas: { width: number; height: number },
  projectRoot: string,
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
      assets: {},
      assetsResolved: false,
      canvas,
      // Empty on purpose, and required so both future UI surfaces stay wired.
      // See AGENTS.md, ponytail exception 1. Step 7 adds active-state toggles;
      // selector-specific state input remains v1.1.
      activeStates: [],
      states: {},
    },
  };
}

export { contentSecurityPolicy, nonce };
