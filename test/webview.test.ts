// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveNodeCount, type RenderResult, type UxmlDocument, type Warning } from 'uxml-preview';
import { assetKey, type AssetDiagnostic, type AssetMisses, type RenderRequest, type ResolvedImport } from '../src/preview/protocol';
import { warningLines } from '../webview/warnings';

const postedMessages: unknown[] = [];
let lastRender: RenderResult | undefined;
let lastDocumentModel: UxmlDocument | undefined;
let lastRenderOptions: Parameters<typeof import('uxml-preview').render>[2];

vi.mock('uxml-preview', async (importOriginal) => {
  const core = await importOriginal<typeof import('uxml-preview')>();
  return {
    ...core,
    render: (...args: Parameters<typeof core.render>) => {
      lastDocumentModel = args[0];
      lastRenderOptions = args[2];
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
  imports: readonly ResolvedImport[] | Record<string, string> = [],
  assets: Record<string, string> = {},
  projectRoot = '',
  assetDiagnostics: readonly AssetDiagnostic[] = [],
): RenderRequest {
  return {
    type: 'render',
    uxml,
    uss: undefined,
    imports: Array.isArray(imports)
      ? imports
      : Object.entries(imports).map(([url, text]) => ({ url, from: null, text })),
    unresolvedImports: [],
    projectRoot,
    assetDiagnostics,
    importDiagnostics: [],
    assets,
    assetsResolved: false,
    canvas: { width: 1920, height: 1080 },
    fitToPanel: false,
    activeStates: [],
    states: {},
  };
}

function latestAssetMisses(): AssetMisses | undefined {
  return postedMessages.filter((message): message is AssetMisses => (
    typeof message === 'object' && message !== null && 'type' in message && message.type === 'asset-misses'
  )).at(-1);
}

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
}

function rootBox() {
  return lastRender!.boxes.get(lastDocumentModel!.root.id)!;
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
          path: 'missing.uss',
        },
      ]);
  });
});

describe('webview render messages', () => {
  beforeAll(async () => {
    document.body.innerHTML = `
      <div id="control-bar">
        <input id="canvas-width" type="number">
        <input id="canvas-height" type="number">
        <input id="fit-to-panel" type="checkbox">
        <button data-width="800" data-height="600"></button>
        <fieldset id="state-controls">
          <label><input name="active-state" type="checkbox" value="hover"><span>hover</span></label>
          <label><input name="active-state" type="checkbox" value="active"><span>active</span></label>
          <label><input name="active-state" type="checkbox" value="focus"><span>focus</span></label>
          <label><input name="active-state" type="checkbox" value="disabled"><span>disabled</span></label>
        </fieldset>
        <span id="canvas-size"></span>
        <span id="active-state-summary"></span>
      </div>
      <div id="preview-viewport"><div id="preview-scroll"><div id="preview"></div></div></div>
      <aside id="warning-panel"><div id="warnings"></div></aside>`;
    Object.defineProperty(globalThis, 'acquireVsCodeApi', {
      configurable: true,
      value: () => ({ postMessage: (message: unknown) => { postedMessages.push(message); } }),
    });
    await import('../webview/main');
  });

  beforeEach(() => {
    postedMessages.length = 0;
    document.querySelector('#warnings')!.replaceChildren();
    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[name="active-state"]'))) input.checked = false;
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
      references: [{
        path: 'project://database/Assets/UI/missing.png?fileID=2800000&guid=abc123',
        form: 'url',
      }],
    });
  });

  it('counts one import problem while preserving both core and host text', async () => {
    const message = {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements"><Style src="missing.uss" /></ui:UXML>'),
      unresolvedImports: ['missing.uss'],
    } satisfies RenderRequest;
    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => {
      const action = document.querySelector<HTMLElement>('#warnings [data-group="A"]')!;
      expect(action.querySelector('summary')!.textContent).toBe('Fixable (1)');
      expect(document.querySelector<HTMLElement>('#warnings > details > summary')!.textContent).toBe('1 issue');
      expect(action.innerText).toContain('<Style src="missing.uss"> could not be resolved');
      expect(action.innerText).toContain('Unresolved stylesheet: missing.uss. It is not watched; reopen the preview after the file is created.');
    });
  });

  it('looks up equal relative URLs by their parent in the webview', async () => {
    const message = request(
      `<ui:UXML xmlns:ui="UnityEngine.UIElements">
        <Style src="a/main.uss" />
        <Style src="b/other.uss" />
        <ui:VisualElement class="target-a" />
        <ui:VisualElement class="target-b" />
      </ui:UXML>`,
      [
        { url: 'a/main.uss', from: null, text: '@import url("theme.uss");' },
        { url: 'b/other.uss', from: null, text: '@import url("theme.uss");' },
        { url: 'theme.uss', from: 'a/main.uss', text: '.target-a { width: 80px; height: 10px; }' },
        { url: 'theme.uss', from: 'b/other.uss', text: '.target-b { width: 160px; height: 10px; }' },
      ],
    );
    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(lastRender).toBeDefined());
    const [a, b] = lastDocumentModel!.root.children.slice(-2);
    expect(lastRender!.boxes.get(a!.id)!.width).toBe(80);
    expect(lastRender!.boxes.get(b!.id)!.width).toBe(160);
  });

  it('passes hover to render exactly', async () => {
    const message = {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="states" /></ui:UXML>'),
      activeStates: ['hover'],
    } satisfies RenderRequest;

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(lastRenderOptions!.activeStates).toEqual(new Set(['hover'])));
  });

  it('passes active to render exactly', async () => {
    const message = {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="states" /></ui:UXML>'),
      activeStates: ['active'],
    } satisfies RenderRequest;

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(lastRenderOptions!.activeStates).toEqual(new Set(['active'])));
  });

  it('passes focus to render exactly', async () => {
    const message = {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="states" /></ui:UXML>'),
      activeStates: ['focus'],
    } satisfies RenderRequest;

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(lastRenderOptions!.activeStates).toEqual(new Set(['focus'])));
  });

  it('passes disabled to render exactly', async () => {
    const message = {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="states" /></ui:UXML>'),
      activeStates: ['disabled'],
    } satisfies RenderRequest;

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(lastRenderOptions!.activeStates).toEqual(new Set(['disabled'])));
  });

  it('passes two active states without dropping either', async () => {
    const message = {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="states" /></ui:UXML>'),
      activeStates: ['hover', 'focus'],
    } satisfies RenderRequest;

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(lastRenderOptions!.activeStates).toEqual(new Set(['hover', 'focus'])));
    expect(document.querySelector<HTMLInputElement>('input[value="hover"]')!.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[value="focus"]')!.checked).toBe(true);
  });

  it('applies hover from 02-styled to the rendered card background', async () => {
    const uxml = readFileSync(join(process.cwd(), 'examples/basics/02-styled.uxml'), 'utf8');
    const uss = readFileSync(join(process.cwd(), 'examples/basics/02-styled.uss'), 'utf8');
    const message = {
      ...request(uxml, { '02-styled.uss': uss }),
      activeStates: ['hover'],
    } satisfies RenderRequest;

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(Array.from(lastRender!.elements.values(), (element) => element.style.backgroundColor)
      .filter(Boolean).map(rgb)).toContain('rgb(30, 58, 95)'));
  });

  it('shows the same fixed size that render receives', async () => {
    const message = {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements" />'),
      canvas: { width: 800, height: 600 },
    } satisfies RenderRequest;

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(document.querySelector('#canvas-size')!.textContent).toBe('800 × 600'));
    expect(lastRenderOptions!.size).toEqual({ width: 800, height: 600 });
    expect(document.querySelector<HTMLInputElement>('#canvas-width')!.value).toBe('800');
    expect(document.querySelector<HTMLInputElement>('#canvas-height')!.value).toBe('600');
    expect(document.querySelector<HTMLElement>('#preview')!.style.width).toBe('800px');
    expect(document.querySelector<HTMLElement>('#preview')!.style.height).toBe('600px');
  });

  it('makes the Yoga root follow the fit-to-panel wrapper width', async () => {
    const viewport = document.querySelector<HTMLElement>('#preview-viewport')!;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 640 },
      clientHeight: { configurable: true, value: 480 },
    });
    const message = {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements" />'),
      fitToPanel: true,
    } satisfies RenderRequest;

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(rootBox().width).toBe(640));

    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 320 },
      clientHeight: { configurable: true, value: 480 },
    });
    window.dispatchEvent(new Event('resize'));

    await vi.waitFor(() => expect(rootBox().width).toBe(320));
  });

  it('shows the Yoga root size, not merely the requested size', async () => {
    const viewport = document.querySelector<HTMLElement>('#preview-viewport')!;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 700 },
      clientHeight: { configurable: true, value: 500 },
    });

    window.dispatchEvent(new MessageEvent('message', { data: {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements" />'),
      fitToPanel: true,
    } satisfies RenderRequest }));

    await vi.waitFor(() => expect(rootBox().width).toBe(700));
    expect(document.querySelector('#canvas-size')!.textContent).toBe(`${rootBox().width} × ${rootBox().height}`);
  });

  it('re-lays out a 75% child when the fit-to-panel wrapper halves', async () => {
    const viewport = document.querySelector<HTMLElement>('#preview-viewport')!;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 500 },
    });
    const uxml = readFileSync(join(process.cwd(), 'examples/basics/10-root-relative.uxml'), 'utf8');

    window.dispatchEvent(new MessageEvent('message', { data: {
      ...request(uxml),
      fitToPanel: true,
    } satisfies RenderRequest }));

    await vi.waitFor(() => expect(rootBox().width).toBe(800));
    const childId = lastDocumentModel!.root.children.at(0)!.id;
    const wideWidth = lastRender!.boxes.get(childId)!.width;

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 400 });
    window.dispatchEvent(new Event('resize'));

    await vi.waitFor(() => expect(rootBox().width).toBe(400));
    expect(lastRender!.boxes.get(childId)!.width).toBe(wideWidth / 2);
  });

  it('keeps the fixed Yoga root when the wrapper changes', async () => {
    const viewport = document.querySelector<HTMLElement>('#preview-viewport')!;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 500 },
    });
    const message = request('<ui:UXML xmlns:ui="UnityEngine.UIElements" />');

    window.dispatchEvent(new MessageEvent('message', { data: message }));

    await vi.waitFor(() => expect(rootBox().width).toBe(message.canvas.width));
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 400 });
    window.dispatchEvent(new Event('resize'));
    expect(rootBox().width).toBe(message.canvas.width);
  });

  it('sends changed canvas controls to the host', async () => {
    const width = document.querySelector<HTMLInputElement>('#canvas-width')!;
    const height = document.querySelector<HTMLInputElement>('#canvas-height')!;
    const fit = document.querySelector<HTMLInputElement>('#fit-to-panel')!;
    width.value = '1280';
    height.value = '720';
    fit.checked = true;

    width.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(postedMessages).toContainEqual({
      type: 'canvas-settings',
      canvas: { width: 1280, height: 720 },
      fitToPanel: true,
    }));
  });

  it('steps a canvas input by one with an arrow key', async () => {
    const width = document.querySelector<HTMLInputElement>('#canvas-width')!;
    width.value = '800';

    width.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    await vi.waitFor(() => expect(width.value).toBe('801'));
    expect(postedMessages).toContainEqual({
      type: 'canvas-settings',
      canvas: { width: 801, height: Number(document.querySelector<HTMLInputElement>('#canvas-height')!.value) },
      fitToPanel: document.querySelector<HTMLInputElement>('#fit-to-panel')!.checked,
    });
  });

  it('steps a canvas input by ten with shift and by one hundred with page keys', async () => {
    const width = document.querySelector<HTMLInputElement>('#canvas-width')!;
    width.value = '800';

    width.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    expect(width.value).toBe('810');
    width.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));

    await vi.waitFor(() => expect(width.value).toBe('910'));
  });

  it('keeps keyboard stepping integral and positive', () => {
    const width = document.querySelector<HTMLInputElement>('#canvas-width')!;
    width.value = '1.9';

    width.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(width.value).toBe('1');
    width.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    expect(width.value).toBe('1');
  });

  it('does not change a canvas input with the mouse wheel', () => {
    const width = document.querySelector<HTMLInputElement>('#canvas-width')!;
    width.value = '800';
    const wheel = new WheelEvent('wheel', { cancelable: true });

    width.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(width.value).toBe('800');
  });

  it('highlights a preset only when both dimensions match', async () => {
    const preset = document.querySelector<HTMLButtonElement>('[data-width="800"][data-height="600"]')!;
    window.dispatchEvent(new MessageEvent('message', { data: {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements" />'),
      canvas: { width: 800, height: 600 },
    } satisfies RenderRequest }));

    await vi.waitFor(() => expect(preset.classList).toContain('active'));
    expect(preset.getAttribute('aria-pressed')).toBe('true');

    window.dispatchEvent(new MessageEvent('message', { data: {
      ...request('<ui:UXML xmlns:ui="UnityEngine.UIElements" />'),
      canvas: { width: 800, height: 500 },
    } satisfies RenderRequest }));

    await vi.waitFor(() => expect(preset.classList).not.toContain('active'));
    expect(preset.getAttribute('aria-pressed')).toBe('false');
  });

  it.each(['hover', 'active', 'focus', 'disabled'])('sends the %s toggle to the host', async (state) => {
    const input = document.querySelector<HTMLInputElement>(`input[name="active-state"][value="${state}"]`)!;
    input.checked = true;

    input.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(postedMessages).toContainEqual({
      type: 'active-states',
      activeStates: [state],
    }));
  });

  it('sends a preset as a fixed canvas size', async () => {
    document.querySelector<HTMLButtonElement>('[data-width="800"][data-height="600"]')!.click();

    await vi.waitFor(() => expect(postedMessages).toContainEqual({
      type: 'canvas-settings',
      canvas: { width: 800, height: 600 },
      fitToPanel: false,
    }));
  });

  it('uses a supplied asset URI without reporting a miss', async () => {
    const assetPath = 'project://database/Assets/UI/tile.png';
    const uri = 'vscode-webview://asset/tile.png';
    window.dispatchEvent(new MessageEvent('message', { data: request(
      `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement style='background-image: url("${assetPath}");' /></ui:UXML>`,
      {},
      { [assetKey(assetPath, 'url')]: uri },
    ) }));

    await vi.waitFor(() => expect(document.querySelector('#preview')!.innerHTML).toContain(uri));
    expect(latestAssetMisses()).toEqual({ type: 'asset-misses', references: [] });
    expect(document.body.innerText).not.toContain('asset-unresolved');
  });

  it('uses a supplied resource() URI without reporting a miss', async () => {
    const assetPath = 'UI/resource-checker';
    const uri = 'vscode-webview://asset/resource-checker.svg';
    window.dispatchEvent(new MessageEvent('message', { data: request(
      `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement style="background-image: resource('${assetPath}');" /></ui:UXML>`,
      {},
      { [assetKey(assetPath, 'resource')]: uri },
    ) }));

    await vi.waitFor(() => expect(document.querySelector('#preview')!.innerHTML).toContain(uri));
    expect(latestAssetMisses()).toEqual({ type: 'asset-misses', references: [] });
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
    expect(latestAssetMisses()).toEqual({
      type: 'asset-misses',
      references: [{ path: assetPath, form: 'url' }],
    });
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

  it('classifies an unavailable resource() as an Editor-only difference without projectRoot guidance', async () => {
    const assetPath = 'console.warnicon';
    window.dispatchEvent(new MessageEvent('message', { data: request(
      `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement style="background-image: resource('${assetPath}');" /></ui:UXML>`,
      {},
      {},
      'C:\\Unity\\Project',
      [{
        source: 'host',
        kind: 'resource-unavailable',
        path: assetPath,
        message: 'No project Resources match; this may be a Unity Editor built-in resource unavailable outside the Editor.',
      }],
    ) }));

    await vi.waitFor(() => {
      expect(document.querySelector('#warnings [data-group="A"]')).toBeNull();
      const differences = document.querySelector<HTMLElement>('#warnings [data-group="C"]')!;
      expect(differences.textContent).toContain('resource-unavailable');
      expect(differences.textContent).toContain('Unity Editor built-in');
      expect(differences.textContent).not.toContain('uxmlPreview.projectRoot');
    });
    expect(latestAssetMisses()).toEqual({
      type: 'asset-misses',
      references: [{ path: assetPath, form: 'resource' }],
    });
  });

  it('shows a successful GUID fallback as a fixable host diagnostic', async () => {
    const message = 'The UXML/USS path is stale: written -> actual';
    window.dispatchEvent(new MessageEvent('message', { data: request(
      '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="resolved" /></ui:UXML>',
      {},
      {},
      'C:\\Unity\\Project',
      [{ source: 'host', kind: 'asset-path-stale', message }],
    ) }));

    await vi.waitFor(() => {
      const action = document.querySelector<HTMLElement>('#warnings [data-group="A"]')!;
      expect(action.textContent).toContain('host [asset-path-stale]');
      expect(action.textContent).toContain(message);
    });
  });

  it('collapses to 0 issues while keeping known divergences accessible', async () => {
    window.dispatchEvent(new MessageEvent('message', { data: request(
      '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Label text="supported" /></ui:UXML>',
    ) }));

    await vi.waitFor(() => {
      const outer = document.querySelector<HTMLDetailsElement>('#warnings > details')!;
      expect(outer.querySelector(':scope > summary')!.textContent)
        .toBe('1920 × 1080 · 0 unsupported · 3 known divergences');
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
