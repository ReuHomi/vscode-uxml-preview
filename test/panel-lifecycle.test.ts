import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { RenderRequest } from '../src/preview/protocol';

const mocks = vi.hoisted(() => ({
  messageHandler: undefined as ((message: unknown) => void) | undefined,
  disposeHandler: undefined as (() => void) | undefined,
  configurationHandler: undefined as ((event: { affectsConfiguration(section: string): boolean }) => void) | undefined,
  postMessage: vi.fn(async () => true),
  readFile: vi.fn(async () => new TextEncoder().encode('<ui:UXML xmlns:ui="UnityEngine.UIElements" />')),
  update: vi.fn(async () => undefined),
  settings: {} as Record<string, unknown>,
  optionWrites: 0,
  webview: undefined as any,
  panel: undefined as any,
}));

vi.mock('vscode', () => {
  const uri = (fsPath: string) => ({
    fsPath,
    path: fsPath,
    toString: () => `file://${fsPath}`,
  });
  return {
    Uri: {
      file: uri,
      joinPath: (base: { fsPath: string }, ...parts: string[]) => uri([base.fsPath, ...parts].join('/')),
    },
    FileType: { File: 1 },
    RelativePattern: class {},
    ViewColumn: { Beside: 2 },
    ConfigurationTarget: { Workspace: 2 },
    window: {
      createWebviewPanel: vi.fn((_viewType, _title, _column, initialOptions) => {
        let options = initialOptions;
        mocks.webview = {
          cspSource: 'test-source',
          html: '',
          asWebviewUri: (value: unknown) => value,
          postMessage: mocks.postMessage,
          onDidReceiveMessage: (handler: (message: unknown) => void) => {
            mocks.messageHandler = handler;
            return { dispose: vi.fn() };
          },
        };
        Object.defineProperty(mocks.webview, 'options', {
          get: () => options,
          set: (value) => { options = value; mocks.optionWrites += 1; },
        });
        mocks.panel = {
          webview: mocks.webview,
          reveal: vi.fn(),
          dispose: () => mocks.disposeHandler?.(),
          onDidDispose: (handler: () => void) => {
            mocks.disposeHandler = handler;
            return { dispose: vi.fn() };
          },
        };
        return mocks.panel;
      }),
      showErrorMessage: vi.fn(),
    },
    workspace: {
      fs: { readFile: mocks.readFile },
      getConfiguration: () => ({
        get: (key: string, fallback: unknown) => mocks.settings[key] ?? fallback,
        update: mocks.update,
      }),
      getWorkspaceFolder: () => undefined,
      onDidChangeConfiguration: (handler: typeof mocks.configurationHandler) => {
        mocks.configurationHandler = handler;
        return { dispose: vi.fn() };
      },
      createFileSystemWatcher: () => ({
        onDidCreate: () => ({ dispose: vi.fn() }),
        onDidChange: () => ({ dispose: vi.fn() }),
        onDidDelete: () => ({ dispose: vi.fn() }),
        dispose: vi.fn(),
      }),
    },
  };
});

import * as vscode from 'vscode';
import { PreviewPanel } from '../src/preview/panel';

const request: RenderRequest = {
  type: 'render',
  uxml: '<ui:UXML xmlns:ui="UnityEngine.UIElements" />',
  uss: undefined,
  imports: {},
  unresolvedImports: [],
  projectRoot: 'C:\\UnityProject',
  assetDiagnostics: [],
  assets: { stale: 'vscode-webview://asset/icon.png' },
  assetsResolved: true,
  canvas: { width: 100, height: 100 },
  fitToPanel: false,
  activeStates: [],
  states: {},
};

let preview: any;

beforeEach(() => {
  mocks.postMessage.mockClear();
  mocks.readFile.mockClear();
  mocks.update.mockClear();
  mocks.settings = {};
  mocks.optionWrites = 0;
  const uri = vscode.Uri.file('C:\\fixture\\07-moved-asset.uxml');
  PreviewPanel.open({
    extensionUri: vscode.Uri.file('C:\\extension'),
    subscriptions: [],
  } as unknown as vscode.ExtensionContext, uri, vscode.ViewColumn.Beside);
  preview = (PreviewPanel as any).panels.get(uri.toString());
});

afterEach(() => {
  mocks.panel.dispose();
});

describe('PreviewPanel webview reloads', () => {
  it('replays the completed request instead of starting discovery again', async () => {
    preview.lastRequest = request;

    mocks.messageHandler!({ type: 'ready' });
    await vi.waitFor(() => expect(mocks.postMessage).toHaveBeenCalledWith(request));

    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('does not rewrite identical local resource roots', () => {
    preview.setAssetRoots([]);
    preview.setAssetRoots([]);

    expect(mocks.optionWrites).toBe(0);
  });
});

describe('PreviewPanel controls', () => {
  it('re-renders a canvas setting change without reading the document or imports', async () => {
    preview.lastRequest = request;
    mocks.settings = {
      'canvas.width': 800,
      'canvas.height': 600,
      'canvas.fitToPanel': false,
    };

    expect(mocks.configurationHandler).toBeTypeOf('function');
    mocks.configurationHandler!({ affectsConfiguration: () => true });

    await vi.waitFor(() => expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      canvas: { width: 800, height: 600 },
      fitToPanel: false,
    })));
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('persists canvas values received from the webview', async () => {
    mocks.messageHandler!({
      type: 'canvas-settings',
      canvas: { width: 1280, height: 720 },
      fitToPanel: true,
    });

    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(3));
    expect(mocks.update.mock.calls).toEqual([
      ['canvas.width', 1280, vscode.ConfigurationTarget.Workspace],
      ['canvas.height', 720, vscode.ConfigurationTarget.Workspace],
      ['canvas.fitToPanel', true, vscode.ConfigurationTarget.Workspace],
    ]);
  });

  it.each(['hover', 'active', 'focus', 'disabled'])('re-renders %s without reading files', async (state) => {
    preview.lastRequest = request;

    mocks.messageHandler!({ type: 'active-states', activeStates: [state] });

    await vi.waitFor(() => expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      activeStates: [state],
    })));
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('declares fitToPanel off by default', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(packageJson.contributes.configuration.properties['uxmlPreview.canvas.fitToPanel'].default).toBe(false);
  });
});
