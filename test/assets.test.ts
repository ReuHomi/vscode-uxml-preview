import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RenderRequest } from '../src/preview/protocol';
import { resolveAssetRoundTrip } from '../src/preview/assets';

function request(): RenderRequest {
  return {
    type: 'render',
    uxml: '<ui:UXML xmlns:ui="UnityEngine.UIElements" />',
    uss: undefined,
    imports: {},
    unresolvedImports: [],
    projectRoot: '',
    assets: {},
    assetsResolved: false,
    canvas: { width: 100, height: 100 },
    activeStates: [],
    states: {},
  };
}

describe('resolveAssetRoundTrip', () => {
  it('puts resolved assets and only their containing folders in the second request', async () => {
    const assetPath = 'project://database/Assets/UI/tile.png';
    const filePath = path.join('C:\\project', 'Assets', 'UI', 'tile.png');
    const result = await resolveAssetRoundTrip(request(), [assetPath], async () => ({
      filePath,
      uri: 'vscode-webview://asset/tile.png',
    }));

    expect(result).not.toBeNull();
    expect(result!.request.assets).toEqual({ [assetPath]: 'vscode-webview://asset/tile.png' });
    expect(result!.resourceRoots).toEqual([path.dirname(filePath)]);
  });

  it('omits unresolved assets and refuses a third render', async () => {
    let calls = 0;
    const assetPath = 'guid://0123456789abcdef0123456789abcdef';
    const second = await resolveAssetRoundTrip(request(), [assetPath], async () => {
      calls += 1;
      return null;
    });

    expect(second).not.toBeNull();
    expect(second!.request.assets).toEqual({});
    expect(second!.request.assetsResolved).toBe(true);
    expect(await resolveAssetRoundTrip(second!.request, [assetPath], async () => {
      calls += 1;
      return null;
    })).toBeNull();
    expect(calls).toBe(1);
  });
});
