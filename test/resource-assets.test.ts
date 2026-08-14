import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RenderRequest } from '../src/preview/protocol';
import { assetKey, resolveAssetRoundTrip, type AssetIndexCache, type ResolvedAsset } from '../src/preview/assets';

const temporaryRoots: string[] = [];
const resource = (assetPath: string) => ({ path: assetPath, form: 'resource' as const });
const url = (assetPath: string) => ({ path: assetPath, form: 'url' as const });

function request(projectRoot = ''): RenderRequest {
  return {
    type: 'render',
    uxml: '<ui:UXML xmlns:ui="UnityEngine.UIElements" />',
    uss: undefined,
    imports: [],
    unresolvedImports: [],
    projectRoot,
    assetDiagnostics: [],
    importDiagnostics: [],
    assets: {},
    assetsResolved: false,
    canvas: { width: 100, height: 100 },
    fitToPanel: false,
    activeStates: [],
    states: {},
  };
}

async function fixture(files: readonly string[]): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uxml-resources-'));
  temporaryRoots.push(root);
  await Promise.all(files.map(async (relativePath) => {
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, 'fixture');
  }));
  return root;
}

const resolved = (filePath: string): ResolvedAsset => ({
  filePath,
  uri: `vscode-webview://asset/${filePath.replaceAll('\\', '/')}`,
});

function options(root: string, cache: AssetIndexCache = {}) {
  return {
    cache,
    projectRoot: root,
    resolvePath: async () => { throw new Error('resource() must not use URL resolution'); },
    resolveIndexedPath: async (filePath: string) => resolved(filePath),
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('resource() asset resolution', () => {
  it('resolves a file in Assets/Resources', async () => {
    const root = await fixture(['Assets/Resources/icon.png']);
    const result = await resolveAssetRoundTrip(request(root), [resource('icon')], options(root));

    expect(result!.request.assets[assetKey('icon', 'resource')]).toContain('/Assets/Resources/icon.png');
  });

  it('resolves a file in a nested Resources folder', async () => {
    const root = await fixture(['Assets/Sub/Resources/UI/icon.png']);
    const result = await resolveAssetRoundTrip(request(root), [resource('UI/icon')], options(root));

    expect(result!.request.assets[assetKey('UI/icon', 'resource')]).toContain('/Assets/Sub/Resources/UI/icon.png');
  });

  it('resolves the same file with and without its extension', async () => {
    const root = await fixture(['Assets/Sub/Resources/UI/icon.png']);
    const cache: AssetIndexCache = {};
    const withoutExtension = await resolveAssetRoundTrip(request(root), [resource('UI/icon')], options(root, cache));
    const withExtension = await resolveAssetRoundTrip(request(root), [resource('UI/icon.png')], options(root, cache));

    expect(withoutExtension!.request.assets[assetKey('UI/icon', 'resource')])
      .toBe(withExtension!.request.assets[assetKey('UI/icon.png', 'resource')]);
  });

  it('chooses the shallower candidate and warns when more than one matches', async () => {
    const root = await fixture([
      'Assets/Resources/icon.png',
      'Assets/Sub/Resources/icon.png',
    ]);
    const result = await resolveAssetRoundTrip(request(root), [resource('icon')], options(root));

    expect(result!.request.assets[assetKey('icon', 'resource')]).toContain('/Assets/Resources/icon.png');
    expect(result!.request.assetDiagnostics).toContainEqual(expect.objectContaining({
      kind: 'resource-ambiguous',
      message: expect.stringMatching(/multiple.*shallower/i),
    }));
  });

  it('reports that zero Resources folders were searched', async () => {
    const root = await fixture(['Assets/UI/icon.png']);
    const result = await resolveAssetRoundTrip(request(root), [resource('icon')], options(root));
    const warning = result!.request.assetDiagnostics.at(-1)!;

    expect(result!.request.assets).toEqual({});
    expect(warning.kind).toBe('resource-unresolved');
    expect(warning.message).toContain('0 Resources folders');
    expect(warning.message).toContain(root);
  });

  it('reports how many Resources folders were searched without finding the target', async () => {
    const root = await fixture([
      'Assets/Resources/other.png',
      'Assets/Sub/Resources/other.png',
    ]);
    const result = await resolveAssetRoundTrip(request(root), [resource('missing')], options(root));
    const warning = result!.request.assetDiagnostics.at(-1)!;

    expect(warning.kind).toBe('resource-unresolved');
    expect(warning.message).toContain('2 Resources folders');
    expect(warning.message).toContain(root);
  });

  it('does not guess that a missing resource is built-in or Editor-owned', async () => {
    const root = await fixture(['Assets/Resources/other.png']);
    const result = await resolveAssetRoundTrip(request(root), [resource('console.warnicon')], options(root));
    const warning = result!.request.assetDiagnostics.at(-1)!;

    expect(warning.message).not.toMatch(/built-in|editor/i);
  });

  it('reports a found but unsupported format separately', async () => {
    const root = await fixture(['Assets/Resources/data.tga']);
    const result = await resolveAssetRoundTrip(request(root), [resource('data')], options(root));
    const warning = result!.request.assetDiagnostics.at(-1)!;

    expect(result!.request.assets).toEqual({});
    expect(warning.kind).toBe('resource-unsupported');
    expect(warning.message).toContain('1 Resources folder');
    expect(warning.message).toContain('.tga');
  });

  it('does not send url() through Resources lookup', async () => {
    const root = await fixture(['Assets/Resources/icon.png']);
    let scans = 0;
    const direct = resolved(path.join(root, 'Assets', 'UI', 'icon.png'));
    const result = await resolveAssetRoundTrip(request(root), [url('Assets/UI/icon.png')], {
      ...options(root),
      resolvePath: async () => direct,
      buildResourceIndex: async () => { scans += 1; return { folders: 0, assets: new Map() }; },
    });

    expect(result!.request.assets[assetKey('Assets/UI/icon.png', 'url')]).toBe(direct.uri);
    expect(scans).toBe(0);
  });

  it('does not scan Resources when no resource() reference exists', async () => {
    const root = await fixture([]);
    let scans = 0;
    await resolveAssetRoundTrip(request(root), [], {
      ...options(root),
      buildResourceIndex: async () => { scans += 1; return { folders: 0, assets: new Map() }; },
    });

    expect(scans).toBe(0);
  });

  it('reuses one Resources scan for the panel cache lifetime', async () => {
    const root = await fixture(['Assets/Resources/icon.png']);
    const filePath = path.join(root, 'Assets', 'Resources', 'icon.png');
    const cache: AssetIndexCache = {};
    let scans = 0;
    const cachedOptions = {
      ...options(root, cache),
      buildResourceIndex: async () => {
        scans += 1;
        return { folders: 1, assets: new Map([['icon', [{ filePath, depth: 1 }]]]) };
      },
    };

    await resolveAssetRoundTrip(request(root), [resource('icon')], cachedOptions);
    await resolveAssetRoundTrip(request(root), [resource('icon')], cachedOptions);

    expect(scans).toBe(1);
  });
});
