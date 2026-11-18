import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RenderRequest } from '../src/preview/protocol';
import { assetKey } from '../src/preview/protocol';
import { resolveFontRoundTrip } from '../src/preview/fonts';
import type { AssetIndexCache, ResolvedAsset } from '../src/preview/assets';

const temporaryRoots: string[] = [];
const FONT_GUID = '0123456789abcdef0123456789abcdef';

const FONT_ASSET = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_Name: Test Asset
  m_Script: {fileID: 19001, guid: 0000000000000000e000000000000000, type: 0}
  m_Version: 1.1.0
  m_SourceFontFileGUID: ${FONT_GUID}
  m_SourceFontFile: {fileID: 12800000, guid: ${FONT_GUID}, type: 3}
  m_FaceInfo:
    m_PointSize: 100
    m_LineHeight: 120
    m_AscentLine: 80
    m_DescentLine: -20
  m_FallbackFontAssetTable: []
`;

const FONT_META = `fileFormatVersion: 2
guid: ${FONT_GUID}
`;
const TEXT_CORE_SCRIPT = '{fileID: 19001, guid: 0000000000000000e000000000000000, type: 0}';
// A TextMeshPro font asset: a MonoBehaviour whose m_Script is not the Text Core row.
const TMP_SCRIPT = '{fileID: 11500000, guid: 74dfce233d7e4fa38b4e04d1a0e4a9bd, type: 3}';
const TMP_ASSET = FONT_ASSET.replace(TEXT_CORE_SCRIPT, TMP_SCRIPT);
const UNKNOWN_FORMAT_ASSET = FONT_ASSET.replace('m_Version: 1.1.0', 'm_Version: 9.9.9');
const MALFORMED_ASSET = FONT_ASSET.slice(0, FONT_ASSET.indexOf('  m_FaceInfo:'));
const NO_SOURCE_ASSET = FONT_ASSET.replace(`  m_SourceFontFileGUID: ${FONT_GUID}
`, '');

function request(projectRoot = ''): RenderRequest {
  return {
    type: 'render',
    theme: 'runtime',
    uxml: '<ui:UXML xmlns:ui="UnityEngine.UIElements" />',
    uss: undefined,
    imports: [],
    unresolvedImports: [],
    projectRoot,
    assetDiagnostics: [],
    importDiagnostics: [],
    assets: {},
    assetsResolved: false,
    fonts: {},
    fontsResolved: false,
    canvas: { width: 100, height: 100 },
    fitToPanel: false,
    activeStates: [],
    states: {},
  };
}

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uxml-fonts-'));
  temporaryRoots.push(root);
  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }));
  return root;
}

const resolved = (filePath: string): ResolvedAsset => ({
  filePath,
  uri: `vscode-webview://font/${path.basename(filePath)}`,
});

function options(
  root: string,
  cache: AssetIndexCache = {},
  resolvePath: (assetPath: string) => Promise<ResolvedAsset | null> = async () => null,
) {
  return {
    cache,
    projectRoot: root,
    resolvePath,
    resolveIndexedPath: async (filePath: string) => resolved(filePath),
    readTextFile: (filePath: string) => readFile(filePath, 'utf8'),
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('font resolution', () => {
  it('resolves a resource() font asset to its source TTF', async () => {
    const root = await fixture({
      'Assets/Resources/Fonts/Test/Test Asset.asset': FONT_ASSET,
      'Assets/Resources/Fonts/Test/Test-Regular.ttf': 'font',
      'Assets/Resources/Fonts/Test/Test-Regular.ttf.meta': `fileFormatVersion: 2\nguid: ${FONT_GUID}\n`,
    });
    const reference = { path: 'Fonts/Test/Test Asset', form: 'resource' as const };
    const result = await resolveFontRoundTrip(request(root), [reference], options(root));

    const font = result!.request.fonts[assetKey(reference.path, reference.form)]!;
    expect(font.uri).toBe('vscode-webview://font/Test-Regular.ttf');
    expect(font.family).toBe('uxml-font-0');
    expect(font.path).toBe(reference.path);
    expect(font.faceInfo).toEqual({ pointSize: 100, ascentLine: 80, descentLine: -20, lineHeight: 120 });
    expect(result!.resourceRoots).toContain(path.join(root, 'Assets/Resources/Fonts/Test'));
  });

  it('resolves a url() font file', async () => {
    const root = await fixture({ 'Assets/UI/Font.ttf': 'font' });
    const filePath = path.join(root, 'Assets/UI/Font.ttf');
    const reference = { path: 'Assets/UI/Font.ttf', form: 'url' as const };
    const result = await resolveFontRoundTrip(request(root), [reference], options(root, {}, async () => resolved(filePath)));

    expect(result!.request.fonts[assetKey(reference.path, reference.form)]?.uri).toBe('vscode-webview://font/Font.ttf');
  });

  it('reports a resource() font that is not in any Resources folder', async () => {
    const root = await fixture({ 'Assets/UI/other.txt': '' });
    const reference = { path: 'Fonts/Missing', form: 'resource' as const };
    const result = await resolveFontRoundTrip(request(root), [reference], options(root));

    expect(result!.request.fonts).toEqual({});
    expect(result!.request.assetDiagnostics.at(-1)).toMatchObject({
      kind: 'font-unresolved',
      path: 'Fonts/Missing',
    });
  });

  async function unrecognized(asset: string): Promise<{ filePath: string; result: Awaited<ReturnType<typeof resolveFontRoundTrip>> }> {
    const root = await fixture({
      'Assets/Resources/Fonts/Test/Test Asset.asset': asset,
      'Assets/Resources/Fonts/Test/Test-Regular.ttf': 'font',
      'Assets/Resources/Fonts/Test/Test-Regular.ttf.meta': FONT_META,
    });
    const reference = { path: 'Fonts/Test/Test Asset', form: 'resource' as const };
    return {
      filePath: path.join(root, 'Assets/Resources/Fonts/Test/Test Asset.asset'),
      result: await resolveFontRoundTrip(request(root), [reference], options(root)),
    };
  }

  it("reports a TextMeshPro asset as 'not-a-font-asset' with what it saw", async () => {
    const { filePath, result } = await unrecognized(TMP_ASSET);

    expect(result!.request.fonts).toEqual({});
    expect(result!.request.assetDiagnostics.at(-1)).toEqual({
      source: 'host',
      kind: 'font-unsupported',
      path: 'Fonts/Test/Test Asset',
      message: `Font asset ${filePath} has an unrecognized format: not-a-font-asset; m_Script ${TMP_SCRIPT}; m_Version 1.1.0.`,
    });
  });

  it("reports an unknown version as 'unknown-format' with what it saw", async () => {
    const { filePath, result } = await unrecognized(UNKNOWN_FORMAT_ASSET);

    expect(result!.request.fonts).toEqual({});
    expect(result!.request.assetDiagnostics.at(-1)).toEqual({
      source: 'host',
      kind: 'font-unsupported',
      path: 'Fonts/Test/Test Asset',
      message: `Font asset ${filePath} has an unrecognized format: unknown-format; m_Script ${TEXT_CORE_SCRIPT}; m_Version 9.9.9.`,
    });
  });

  it("reports a missing FaceInfo as 'malformed' and does not keep the font", async () => {
    const { filePath, result } = await unrecognized(MALFORMED_ASSET);

    expect(result!.request.fonts).toEqual({});
    expect(result!.request.assetDiagnostics.at(-1)).toEqual({
      source: 'host',
      kind: 'font-unsupported',
      path: 'Fonts/Test/Test Asset',
      message: `Font asset ${filePath} has an unrecognized format: malformed; m_Script ${TEXT_CORE_SCRIPT}; m_Version 1.1.0.`,
    });
  });

  it('leaves out m_Script and m_Version when the core saw neither', async () => {
    const { filePath, result } = await unrecognized('not yaml at all\n');

    expect(result!.request.assetDiagnostics.at(-1)).toMatchObject({
      kind: 'font-unsupported',
      message: `Font asset ${filePath} has an unrecognized format: not-a-font-asset.`,
    });
  });

  it('reports a font asset with no source font reference as unresolved', async () => {
    const { filePath, result } = await unrecognized(NO_SOURCE_ASSET);

    expect(result!.request.fonts).toEqual({});
    expect(result!.request.assetDiagnostics.at(-1)).toEqual({
      source: 'host',
      kind: 'font-unresolved',
      path: 'Fonts/Test/Test Asset',
      message: `Font asset ${filePath} has no source font reference.`,
    });
  });

  it('reports .ttc as unsupported', async () => {
    const root = await fixture({ 'Assets/Resources/Fonts/Test/Test.ttc': 'font' });
    const reference = { path: 'Fonts/Test/Test.ttc', form: 'resource' as const };
    const result = await resolveFontRoundTrip(request(root), [reference], options(root));

    expect(result!.request.fonts).toEqual({});
    expect(result!.request.assetDiagnostics.at(-1)).toMatchObject({
      kind: 'font-unsupported',
      message: expect.stringContaining('.ttc'),
    });
  });

  it('reports ambiguous resource() font candidates', async () => {
    const root = await fixture({
      'Assets/Resources/Fonts/Test.ttf': 'font',
      'Assets/UI/Resources/Fonts/Test.ttf': 'font',
    });
    const reference = { path: 'Fonts/Test', form: 'resource' as const };
    const result = await resolveFontRoundTrip(request(root), [reference], options(root));

    expect(result!.request.assetDiagnostics).toContainEqual(expect.objectContaining({
      kind: 'resource-ambiguous',
      path: reference.path,
    }));
  });

  it('resolves a repeated font reference once', async () => {
    const root = await fixture({
      'Assets/Resources/Fonts/Test/Test-Regular.ttf': 'font',
    });
    const reference = { path: 'Fonts/Test/Test-Regular.ttf', form: 'resource' as const };
    let resolutions = 0;
    const result = await resolveFontRoundTrip(request(root), [reference, reference], {
      ...options(root),
      resolveIndexedPath: async (filePath: string) => {
        resolutions += 1;
        return resolved(filePath);
      },
    });

    expect(Object.keys(result!.request.fonts)).toEqual([assetKey(reference.path, reference.form)]);
    expect(resolutions).toBe(1);
  });
});
