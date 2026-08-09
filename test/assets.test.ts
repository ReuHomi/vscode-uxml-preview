import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildGuidIndex } from 'uxml-preview/unity-project';
import type { RenderRequest } from '../src/preview/protocol';
import {
  resolveAssetRoundTrip,
  type GuidIndexCache,
  type ResolvedAsset,
} from '../src/preview/assets';

const GUID = '0123456789abcdef0123456789abcdef';
const MOVED = `project://database/Assets/UI/icon.png?fileID=2800000&guid=${GUID}`;
const temporaryRoots: string[] = [];

function request(projectRoot = ''): RenderRequest {
  return {
    type: 'render',
    uxml: '<ui:UXML xmlns:ui="UnityEngine.UIElements" />',
    uss: undefined,
    imports: {},
    unresolvedImports: [],
    projectRoot,
    assetDiagnostics: [],
    assets: {},
    assetsResolved: false,
    canvas: { width: 100, height: 100 },
    fitToPanel: false,
    activeStates: [],
    states: {},
  };
}

async function project(guid = GUID): Promise<{ root: string; actual: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uxml-guid-'));
  temporaryRoots.push(root);
  const actual = path.join(root, 'Assets', 'UI', 'moved', 'icon.png');
  await mkdir(path.dirname(actual), { recursive: true });
  await writeFile(actual, 'fixture');
  await writeFile(`${actual}.meta`, `fileFormatVersion: 2\nguid: ${guid}\n`);
  return { root, actual };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const resolved = (filePath: string): ResolvedAsset => ({
  filePath,
  uri: `vscode-webview://asset/${path.basename(filePath)}`,
});

describe('resolveAssetRoundTrip', () => {
  it('does not build an index when the written path resolves', async () => {
    let builds = 0;
    const direct = resolved(path.join('C:\\project', 'Assets', 'UI', 'icon.png'));
    const result = await resolveAssetRoundTrip(request('C:\\project'), [MOVED], {
      cache: {},
      projectRoot: 'C:\\project',
      resolvePath: async () => direct,
      resolveIndexedPath: async () => { throw new Error('GUID lookup must stay lazy'); },
      buildGuidIndex: async (root) => { builds += 1; return buildGuidIndex(root); },
    });

    expect(result!.request.assets[MOVED]).toBe(direct.uri);
    expect(result!.resourceRoots).toEqual([path.dirname(direct.filePath)]);
    expect(builds).toBe(0);
  });

  it('uses the real meta index after the written path fails', async () => {
    const { root, actual } = await project();
    const result = await resolveAssetRoundTrip(request(root), [MOVED], {
      cache: {},
      projectRoot: root,
      resolvePath: async () => null,
      resolveIndexedPath: async (filePath) => resolved(filePath),
      buildGuidIndex,
    });

    expect(result!.request.assets[MOVED]).toBe(resolved(actual).uri);
    expect(result!.request.assetDiagnostics.map(({ kind }) => kind))
      .toEqual(['guid-index', 'asset-path-stale']);
    expect(result!.request.assetDiagnostics[1]!.message).toContain(actual);
  });

  it('leaves the asset unresolved when the real index has no matching GUID', async () => {
    const { root } = await project();
    const badReference = MOVED.replace(GUID, 'ffffffffffffffffffffffffffffffff');
    const result = await resolveAssetRoundTrip(request(root), [badReference], {
      cache: {},
      projectRoot: root,
      resolvePath: async () => null,
      resolveIndexedPath: async (filePath) => resolved(filePath),
      buildGuidIndex,
    });

    expect(result!.request.assets).toEqual({});
    expect(result!.request.assetDiagnostics.at(-1)?.kind).toBe('guid-unresolved');
    expect(result!.request.assetDiagnostics.at(-1)?.message).toContain('1 indexed asset');
  });

  it('does not build an index when projectRoot is empty', async () => {
    let builds = 0;
    const result = await resolveAssetRoundTrip(request(), [MOVED], {
      cache: {},
      projectRoot: '',
      resolvePath: async () => null,
      resolveIndexedPath: async () => null,
      buildGuidIndex: async (root) => { builds += 1; return buildGuidIndex(root); },
    });

    expect(builds).toBe(0);
    expect(result!.request.assetDiagnostics.at(-1)?.kind).toBe('guid-index-skipped');
  });

  it('builds the index once and reuses it for the next render', async () => {
    const { root } = await project();
    const cache: GuidIndexCache = {};
    let builds = 0;
    const options = {
      cache,
      projectRoot: root,
      resolvePath: async () => null,
      resolveIndexedPath: async (filePath: string) => resolved(filePath),
      buildGuidIndex: async (projectRoot: string) => {
        builds += 1;
        return buildGuidIndex(projectRoot);
      },
    };

    await resolveAssetRoundTrip(request(root), [MOVED], options);
    const second = await resolveAssetRoundTrip(request(root), [MOVED], options);

    expect(second!.request.assetDiagnostics[0]!.message).toContain('Reused GUID index');
    expect(builds).toBe(1);
  });

  it('still refuses a third render after GUID fallback', async () => {
    const { root } = await project();
    const options = {
      cache: {} as GuidIndexCache,
      projectRoot: root,
      resolvePath: async () => null,
      resolveIndexedPath: async (filePath: string) => resolved(filePath),
      buildGuidIndex,
    };
    const second = await resolveAssetRoundTrip(request(root), [MOVED], options);

    expect(await resolveAssetRoundTrip(second!.request, [MOVED], options)).toBeNull();
  });
});
