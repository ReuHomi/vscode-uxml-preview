import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderRequest } from '../src/preview/protocol';

const mocks = vi.hoisted(() => ({
  messageHandler: undefined as ((message: unknown) => void) | undefined,
  disposeHandler: undefined as (() => void) | undefined,
  postMessage: vi.fn(async () => true),
  readFile: vi.fn(async () => new TextEncoder().encode('<ui:UXML xmlns:ui="UnityEngine.UIElements" />')),
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
      getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
      getWorkspaceFolder: () => undefined,
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
  activeStates: [],
  states: {},
};

let preview: any;

beforeEach(() => {
  mocks.postMessage.mockClear();
  mocks.readFile.mockClear();
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
