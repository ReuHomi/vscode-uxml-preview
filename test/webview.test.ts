// @vitest-environment happy-dom

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Warning } from 'uxml-preview';
import type { RenderRequest } from '../src/preview/protocol';
import { warningLines } from '../webview/warnings';

vi.mock('uxml-preview', async (importOriginal) => {
  const core = await importOriginal<typeof import('uxml-preview')>();
  return {
    ...core,
    render: (...args: Parameters<typeof core.render>) => core.render(args[0], args[1], {
      ...args[2],
      measureText: () => ({ width: 0, height: 0 }),
    }),
  };
});

function request(
  uxml: string,
  imports: Record<string, string> = {},
): RenderRequest {
  return {
    type: 'render',
    uxml,
    uss: undefined,
    imports,
    unresolvedImports: [],
    assets: {},
    canvas: { width: 1920, height: 1080 },
    activeStates: [],
    states: {},
  };
}

describe('warningLines', () => {
  it('preserves every warning in source order with its kind and source', () => {
    const malformed = { kind: 'malformed', message: 'broken UXML' } satisfies Warning;
    const unsupported = { kind: 'unsupported-control', message: 'unknown control' } satisfies Warning;

    expect(warningLines([malformed], [unsupported, unsupported], ['missing.uss']))
      .toEqual([
        { source: 'parse', kind: 'malformed', message: 'broken UXML' },
        { source: 'render', kind: 'unsupported-control', message: 'unknown control' },
        { source: 'render', kind: 'unsupported-control', message: 'unknown control' },
        { source: 'host', kind: 'unresolved-import', message: 'missing.uss' },
      ]);
  });
});

describe('webview render messages', () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="preview"></div><aside id="warning-panel"><ul id="warnings"></ul></aside>';
    Object.defineProperty(globalThis, 'acquireVsCodeApi', {
      configurable: true,
      value: () => ({ postMessage: () => undefined }),
    });
    await import('../webview/main');
  });

  beforeEach(() => {
    document.querySelector('#warnings')!.replaceChildren();
  });

  afterAll(() => {
    window.dispatchEvent(new Event('unload'));
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
  });

  it('shows asset-unresolved from the render result', async () => {
    window.dispatchEvent(new MessageEvent('message', { data: request(
      '<ui:UXML xmlns:ui="UnityEngine.UIElements"><Style src="05-asset.uss" /><ui:VisualElement class="tile" /></ui:UXML>',
      {
        '05-asset.uss': '.tile { width: 200px; height: 200px; background-image: url("project://database/Assets/UI/missing.png?fileID=2800000&guid=abc123"); }',
      },
    ) }));

    await vi.waitFor(() => expect(document.body.innerText).toContain('asset-unresolved'));
  });

  it('shows both unsupported controls without adding an unsupported-property warning', async () => {
    window.dispatchEvent(new MessageEvent('message', { data: request(`
      <ui:UXML xmlns:ui="UnityEngine.UIElements">
        <ui:VisualElement>
          <ui:Toggle label="Unsupported control" />
          <ui:Slider low-value="0" high-value="10" />
          <ui:VisualElement style="rotate: 45deg;" />
        </ui:VisualElement>
      </ui:UXML>
    `) }));

    await vi.waitFor(() => {
      const text = document.body.innerText;
      expect(text.match(/unsupported-control/g) ?? []).toHaveLength(2);
      expect(text).not.toContain('unsupported-property');
    });
  });
});
