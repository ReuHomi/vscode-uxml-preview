import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeDocument: undefined as { fileName: string; uri: unknown } | undefined,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  information: vi.fn(),
  error: vi.fn(),
  update: vi.fn(async () => undefined),
  open: vi.fn(),
}));

vi.mock('vscode', () => ({
  ViewColumn: { Active: 1, Beside: 2 },
  ConfigurationTarget: { Global: 1 },
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(id, handler);
      return { dispose: vi.fn() };
    },
  },
  window: {
    get activeTextEditor() {
      return mocks.activeDocument === undefined ? undefined : { document: mocks.activeDocument };
    },
    showInformationMessage: mocks.information,
    showErrorMessage: mocks.error,
  },
  workspace: { getConfiguration: () => ({ update: mocks.update }) },
}));

vi.mock('../src/preview/panel', () => ({ PreviewPanel: { open: mocks.open } }));

import { ConfigurationTarget } from 'vscode';
import { activate } from '../src/extension';

let stored: Map<string, unknown>;
let context: any;

beforeEach(() => {
  mocks.activeDocument = undefined;
  mocks.handlers.clear();
  mocks.information.mockReset().mockResolvedValue(undefined);
  mocks.error.mockClear();
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.open.mockClear();
  stored = new Map();
  context = { subscriptions: [], globalState: {
    get: (key: string) => stored.get(key),
    update: vi.fn(async (key: string, value: unknown) => { stored.set(key, value); }),
  } };
  activate(context);
});

describe('0.4.0 first preview notice', () => {
  const uri = { fsPath: 'C:\\project\\screen.uxml' };
  const text = 'UXML Preview now shows your UI as it looks in a running game. Text and buttons look larger than before — that is expected and matches Unity at runtime.';
  const editor = 'Use previous view (editor theme)';
  const open = () => mocks.handlers.get('uxmlPreview.showPreview')!(uri);

  it('shows the exact notice once on a fresh installation and persists it across activation', async () => {
    await open();
    expect(mocks.information).toHaveBeenCalledWith(text, editor, 'OK');
    expect(context.globalState.update).toHaveBeenCalledWith('runtimeThemeNotice070Seen', true);
    activate(context);
    await open();
    expect(mocks.information).toHaveBeenCalledTimes(1);
  });

  it('does not repeat the notice for an existing user who saw it', async () => {
    stored.set('runtimeThemeNotice070Seen', true);
    activate(context);
    await open();
    expect(mocks.information).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalled();
  });

  it('does not duplicate the notice when two previews open before a response', async () => {
    await Promise.all([open(), open()]);
    expect(mocks.open).toHaveBeenCalledTimes(2);
    expect(mocks.information).toHaveBeenCalledTimes(1);
  });

  it('saves editor when the previous-view button is chosen', async () => {
    mocks.information.mockResolvedValue(editor);
    await open();
    expect(mocks.update).toHaveBeenCalledWith('theme', 'editor', ConfigurationTarget.Global);
  });

  it.each(['OK', undefined])('keeps the theme when the notice response is %s', async (response) => {
    mocks.information.mockResolvedValue(response);
    await open();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports a failed theme save without rejecting the command', async () => {
    mocks.information.mockResolvedValue(editor);
    mocks.update.mockRejectedValueOnce(new Error('settings unavailable'));
    await open();
    expect(mocks.error).toHaveBeenCalledWith('UXML Preview: settings unavailable');
  });
});

describe('command entry points', () => {
  it('contributes the one UXML-only preview key and explorer action', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(packageJson.contributes.keybindings).toEqual([{
      command: 'uxmlPreview.showPreviewToSide',
      key: 'ctrl+shift+v',
      mac: 'cmd+shift+v',
      when: 'resourceExtname == .uxml',
    }]);
    expect(packageJson.contributes.menus['explorer/context']).toEqual([{
      command: 'uxmlPreview.showPreviewToSide',
      when: 'resourceExtname == .uxml',
    }]);
  });

  it('explains why an active USS file cannot be previewed', () => {
    mocks.activeDocument = { fileName: 'C:\\project\\Assets\\screen.uss', uri: { fsPath: 'screen.uss' } };

    mocks.handlers.get('uxmlPreview.showPreviewToSide')!();

    expect(mocks.information).toHaveBeenCalledWith(
      'A USS file cannot be rendered on its own. In Unity UI Toolkit, a stylesheet only takes effect when attached to a document. Open a .uxml file that references this stylesheet with <Style src>.',
    );
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('opens the UXML URI supplied by the explorer context menu', () => {
    const uri = { fsPath: 'C:\\project\\Assets\\screen.uxml' };

    mocks.handlers.get('uxmlPreview.showPreviewToSide')!(uri);

    expect(mocks.open).toHaveBeenCalledWith(expect.anything(), uri, 2);
  });
});

describe('packaged documentation', () => {
  it('pins both manual version labels to the package version', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const manual = readFileSync('docs/manual.html', 'utf8');

    expect(manual.match(/<span class="chip">VERSION ([^<]+)<\/span>/)?.[1]).toBe(packageJson.version);
    expect(manual.match(/^\s*Version ([^ ]+) · Generated/m)?.[1]).toBe(packageJson.version);
  });
});
