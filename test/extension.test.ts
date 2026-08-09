import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeDocument: undefined as { fileName: string; uri: unknown } | undefined,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  information: vi.fn(),
  open: vi.fn(),
}));

vi.mock('vscode', () => ({
  ViewColumn: { Active: 1, Beside: 2 },
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
  },
}));

vi.mock('../src/preview/panel', () => ({ PreviewPanel: { open: mocks.open } }));

import { activate } from '../src/extension';

beforeEach(() => {
  mocks.activeDocument = undefined;
  mocks.handlers.clear();
  mocks.information.mockClear();
  mocks.open.mockClear();
  activate({ subscriptions: [] } as any);
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
