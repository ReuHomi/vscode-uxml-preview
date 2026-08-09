// @vitest-environment happy-dom

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveNodeCount, type RenderResult, type Warning } from 'uxml-preview';
import type { AssetMisses, RenderRequest } from '../src/preview/protocol';
import { warningLines } from '../webview/warnings';

const postedMessages: unknown[] = [];
let lastRender: RenderResult | undefined;

vi.mock('uxml-preview', async (importOriginal) => {
  const core = await importOriginal<typeof import('uxml-preview')>();
  return {
    ...core,
    render: (...args: Parameters<typeof core.render>) => {
      lastRender = core.render(args[0], args[1], {
        ...args[2],
        measureText: () => ({ width: 0, height: 0 }),
      });
      return lastRender;
    },
  };
});

function request(
  uxml: string,
  imports: Record<string, string> = {},
  assets: Record<string, string> = {},
  projectRoot = '',
): RenderRequest {
  return {
    type: 'render',
    uxml,
    uss: undefined,
    imports,
    unresolvedImports: [],
    projectRoot,
    assets,
    assetsResolved: false,
    canvas: { width: 1920, height: 1080 },
    activeStates: [],
    states: {},
  };
}

function latestAssetMisses(): AssetMisses | undefined {
  return postedMessages.filter((message): message is AssetMisses => (
    typeof message === 'object' && message !== null && 'type' in message && message.type === 'asset-misses'
  )).at(-1);
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
        {
          source: 'host',
          kind: 'import-unresolved',
          message: 'Unresolved stylesheet: missing.uss. It is not watched; reopen the preview after the file is created.',
        },
      ]);
  });
});

describe('webview render messages', () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="preview"></div><aside id="warning-panel"><div id="warnings"></div></aside>';
    Object.defineProperty(globalThis, 'acquireVsCodeApi', {
      configurable: true,
      value: () => ({ postMessage: (message: unknown) => { postedMessages.push(message); } }),
    });
    await import('../webview/main');
  });

  beforeEach(() => {
    postedMessages.length = 0;
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
    expect(latestAssetMisses()).toEqual({
      type: 'asset-misses',
      paths: ['project://database/Assets/UI/missing.png?fileID=2800000&guid=abc123'],
    });
  });

  it('uses a supplied asset URI without reporting a miss', async () => {
    const assetPath = 'project://database/Assets/UI/tile.png';
    const uri = 'vscode-webview://asset/tile.png';
    window.dispatchEvent(new MessageEvent('message', { data: request(
      `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement style='background-image: url("${assetPath}");' /></ui:UXML>`,
      {},
      { [assetPath]: uri },
    ) }));

    await vi.waitFor(() => expect(document.querySelector('#preview')!.innerHTML).toContain(uri));
    expect(latestAssetMisses()).toEqual({ type: 'asset-misses', paths: [] });
    expect(document.body.innerText).not.toContain('asset-unresolved');
  });

  it('reports the same missing asset only once', async () => {
    const assetPath = '../Images/missing.png';
    window.dispatchEvent(new MessageEvent('message', { data: request(`
      <ui:UXML xmlns:ui="UnityEngine.UIElements">
        <ui:VisualElement style='background-image: url("${assetPath}");' />
        <ui:VisualElement style='background-image: url("${assetPath}");' />
      </ui:UXML>
    `) }));

    await vi.waitFor(() => expect(document.body.innerText).toContain('asset-unresolved'));
    expect(latestAssetMisses()).toEqual({ type: 'asset-misses', paths: [assetPath] });
  });

  it('shows both unsupported controls without adding an unsupported-property warning', async () => {
    window.dispatchEvent(new MessageEvent('message', { data: request(`
      <ui:UXML xmlns:ui="UnityEngine.UIElements">
        <ui:VisualElement style="width: 360px; padding: 12px; background-color: #2b2b2b;">
          <ui:Label text="Supported label" style="color: #ffffff;" />
          <ui:Toggle label="Unsupported control" />
          <ui:Slider low-value="0" high-value="10" />
          <ui:VisualElement style="height: 40px; background-color: #4f8fd9; rotate: 45deg;" />
        </ui:VisualElement>
      </ui:UXML>
    `) }));

    let unsupportedCount = 0;
    await vi.waitFor(() => {
      const text = document.body.innerText;
      unsupportedCount = (text.match(/unsupported-control/g) ?? []).length;
      expect(unsupportedCount).toBe(2);
      expect(text).not.toContain('unsupported-property');
    });

    const fallback = document.querySelector<HTMLElement>('#preview .uxml-unsupported-control')!;
    expect(document.querySelectorAll('#preview .uxml-unsupported-control')).toHaveLength(1);
    expect(fallback.dataset.uxmlUnsupportedCount).toBe(String(unsupportedCount));
    expect(fallback.style.height).toBe('0px');
    expect(fallback.style.minHeight).not.toBe('');
    const firstWarning = lastRender!.warnings.find(({ kind }) => kind === 'unsupported-control')!;
    expect(Number.parseFloat(fallback.style.top)).toBe(lastRender!.boxes.get(firstWarning.node!)!.top);

    const groups = Array.from(document.querySelectorAll<HTMLDetailsElement>('#warnings [data-group]'));
    expect(groups.map((group) => group.querySelector('summary')!.textContent)).toEqual([
      'Waiting for support (2)',
      'Renderer differences from Unity (3)',
    ]);
    expect(groups.map(({ open }) => open)).toEqual([false, false]);
  });

  it('keeps separate markers for unsupported controls at different core coordinates', async () => {
    window.dispatchEvent(new MessageEvent('message', { data: request(`
      <ui:UXML xmlns:ui="UnityEngine.UIElements">
        <ui:VisualElement>
          <ui:Toggle />
          <ui:VisualElement style="height: 20px;" />
          <ui:Slider />
        </ui:VisualElement>
      </ui:UXML>
    `) }));

    await vi.waitFor(() => expect(lastRender!.warnings.filter(
      ({ kind }) => kind === 'unsupported-control',
    )).toHaveLength(2));
    const markers = Array.from(document.querySelectorAll<HTMLElement>('#preview .uxml-unsupported-control'));
    expect(markers).toHaveLength(2);
    expect(markers.every(({ dataset }) => dataset.uxmlUnsupportedCount === undefined)).toBe(true);
  });

  it('puts an unresolved asset in A with empty projectRoot guidance', async () => {
    window.dispatchEvent(new MessageEvent('message', { data: request(
      '<ui:UXML xmlns:ui="UnityEngine.UIElements"><Style src="05-asset.uss" /><ui:VisualElement class="tile" /></ui:UXML>',
      {
        '05-asset.uss': '.tile { width: 200px; height: 200px; background-image: url("missing.png"); }',
      },
    ) }));

    await vi.waitFor(() => {
      const action = document.querySelector<HTMLElement>('#warnings [data-group="A"]')!;
      expect(action.textContent).toContain('asset-unresolved');
      expect(action.textContent).toContain('uxmlPreview.projectRoot is empty');
      expect(action.textContent).toContain('Settings');
      expect(document.querySelector('#warnings [data-group="B"]')).toBeNull();
    });
  });

  it('shows the configured projectRoot beside an unresolved asset', async () => {
    const projectRoot = 'C:\\Unity\\Project';
    window.dispatchEvent(new MessageEvent('message', { data: request(
      '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement style="background-image: url(\'missing.png\');" /></ui:UXML>',
      {},
      {},
      projectRoot,
    ) }));

    await vi.waitFor(() => {
      const action = document.querySelector<HTMLElement>('#warnings [data-group="A"]')!;
      expect(action.textContent).toContain(`uxmlPreview.projectRoot = ${projectRoot}`);
    });
  });

  it('collapses to 0 issues while keeping known divergences accessible', async () => {
    window.dispatchEvent(new MessageEvent('message', { data: request(
      '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="supported" /></ui:UXML>',
    ) }));

    await vi.waitFor(() => {
      const outer = document.querySelector<HTMLDetailsElement>('#warnings > details')!;
      expect(outer.querySelector(':scope > summary')!.textContent).toBe('0 issues');
      expect(outer.open).toBe(false);
      expect(outer.querySelector('[data-group="C"] summary')!.textContent)
        .toBe('Renderer differences from Unity (3)');
    });
  });

  it('replaces the DOM without leaking Yoga nodes', async () => {
    window.dispatchEvent(new MessageEvent('message', { data: request(
      '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="first render" /></ui:UXML>',
    ) }));
    await vi.waitFor(() => expect(document.querySelector('#preview')!.textContent).toContain('first render'));
    const baseline = liveNodeCount();

    window.dispatchEvent(new MessageEvent('message', { data: request(
      '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="second render" /></ui:UXML>',
    ) }));
    await vi.waitFor(() => expect(document.querySelector('#preview')!.textContent).toContain('second render'));

    expect(liveNodeCount()).toBe(baseline);
    expect(document.querySelector('#preview')!.textContent).not.toContain('first render');
  });

  it('clears the previous render when the host refresh fails', async () => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'render-error', message: 'could not read the file' },
    }));

    await vi.waitFor(() => expect(document.body.innerText).toContain('could not read the file'));
    expect(document.querySelector('#preview')!.children).toHaveLength(0);
    expect(liveNodeCount()).toBe(0);
  });
});
