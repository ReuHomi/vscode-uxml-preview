/**
 * Purpose:  resolve `-unity-font-definition` references to a real font file and
 *           the FaceInfo Unity reports for it.
 * Ensures:  the discovery render records misses; the host answers each once.
 */
import path from 'node:path';
import { buildGuidIndex } from 'uxml-preview/unity-project';
import type { GuidIndex } from 'uxml-preview/unity-project';
import {
  buildResourceIndex,
  resourceName,
  type AssetIndexCache,
  type AssetRoundTrip,
  type ResolvedAsset,
} from './assets';
import {
  assetKey,
  type AssetDiagnostic,
  type AssetReference,
  type FontResolution,
  type RenderRequest,
} from './protocol';

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc']);

interface FontResolutionOptions {
  readonly cache: AssetIndexCache;
  readonly projectRoot: string;
  readonly resolvePath: (assetPath: string) => Promise<ResolvedAsset | null>;
  readonly resolveIndexedPath: (filePath: string) => Promise<ResolvedAsset | null>;
  readonly readTextFile: (filePath: string) => Promise<string>;
}

interface FontFile {
  readonly filePath: string;
  readonly faceInfo?: FontResolution['faceInfo'];
}

function isFontFile(filePath: string): boolean {
  return FONT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function diagnostic(kind: AssetDiagnostic['kind'], message: string, assetPath?: string): AssetDiagnostic {
  return { source: 'host', kind, message, ...(assetPath === undefined ? {} : { path: assetPath }) };
}

export function parseFontAsset(source: string): { sourceGuid: string | null; faceInfo?: FontResolution['faceInfo'] } {
  const sourceGuid = source.match(/m_SourceFontFileGUID:\s*([0-9a-f]{32})/i)?.[1]
    ?? source.match(/m_SourceFontFile:\s*\{[^}]*\bguid:\s*([0-9a-f]{32})/i)?.[1]
    ?? source.match(/\bm_Font:\s*\{[^}]*\bguid:\s*([0-9a-f]{32})/i)?.[1]
    ?? null;
  const block = source.match(/m_FaceInfo:\s*\n((?: {4}[^\n]*(?:\n|$))+)/)?.[1];
  if (block === undefined) return { sourceGuid };
  const number = (name: string): number | undefined => {
    const value = block.match(new RegExp(`${name}:\\s*([-+]?[0-9]*\\.?[0-9]+)`))?.[1];
    return value === undefined ? undefined : Number(value);
  };
  const pointSize = number('m_PointSize');
  const ascentLine = number('m_AscentLine');
  const descentLine = number('m_DescentLine');
  if (pointSize === undefined || ascentLine === undefined || descentLine === undefined) return { sourceGuid };
  const lineHeight = number('m_LineHeight');
  return {
    sourceGuid,
    faceInfo: { pointSize, ascentLine, descentLine, ...(lineHeight === undefined ? {} : { lineHeight }) },
  };
}

async function guidIndex(options: FontResolutionOptions): Promise<GuidIndex> {
  if (options.cache.guidProjectRoot !== options.projectRoot || options.cache.guidIndex === undefined) {
    options.cache.guidProjectRoot = options.projectRoot;
    options.cache.guidIndex = buildGuidIndex(options.projectRoot);
  }
  return options.cache.guidIndex;
}

async function resolveFontAsset(filePath: string, options: FontResolutionOptions): Promise<FontFile | null> {
  let source: string;
  try {
    source = await options.readTextFile(filePath);
  } catch {
    return null;
  }
  const parsed = parseFontAsset(source);
  if (parsed.sourceGuid === null) return null;
  const sourcePath = (await guidIndex(options)).get(parsed.sourceGuid);
  if (sourcePath === null || !isFontFile(sourcePath)) return null;
  return { filePath: sourcePath, faceInfo: parsed.faceInfo };
}

async function resolveResourceFont(
  reference: string,
  options: FontResolutionOptions,
): Promise<{ font: FontFile | null; found: number }> {
  if (options.cache.resourceProjectRoot !== options.projectRoot || options.cache.resourceIndex === undefined) {
    options.cache.resourceProjectRoot = options.projectRoot;
    options.cache.resourceIndex = buildResourceIndex(options.projectRoot);
  }
  const index = await options.cache.resourceIndex;
  const candidates = index.assets.get(resourceName(reference)) ?? [];

  for (const candidate of candidates) {
    if (path.extname(candidate.filePath).toLowerCase() !== '.asset') continue;
    const font = await resolveFontAsset(candidate.filePath, options);
    if (font !== null) return { font, found: candidates.length };
  }

  const direct = candidates.find(({ filePath }) => isFontFile(filePath));
  return { font: direct === undefined ? null : { filePath: direct.filePath }, found: candidates.length };
}

export async function resolveFontRoundTrip(
  request: RenderRequest,
  misses: readonly AssetReference[],
  options: FontResolutionOptions,
): Promise<AssetRoundTrip | null> {
  if (request.fontsResolved) return null;

  const fonts = { ...request.fonts };
  const diagnostics = [...request.assetDiagnostics];
  const resourceRoots = new Set<string>();
  let family = Object.keys(fonts).length;

  for (const reference of misses) {
    const key = assetKey(reference.path, reference.form);
    if (fonts[key] !== undefined) continue;

    let font: FontFile | null = null;
    if (reference.form === 'resource') {
      const found = await resolveResourceFont(reference.path, options);
      font = found.font;
      if (font === null) {
        diagnostics.push(diagnostic(
          found.found === 0 ? 'font-unresolved' : 'font-unsupported',
          found.found === 0
            ? `Font resource('${reference.path}') was not found in any project Resources folder.`
            : `Font resource('${reference.path}') was found, but it is not a .ttf/.otf/.ttc file and its .asset has no source font reference.`,
          reference.path,
        ));
      }
    } else {
      const resolved = await options.resolvePath(reference.path);
      if (resolved === null) {
        diagnostics.push(diagnostic('font-unresolved', `Font file ${reference.path} was not found.`, reference.path));
      } else if (isFontFile(resolved.filePath)) {
        font = { filePath: resolved.filePath };
      } else {
        font = await resolveFontAsset(resolved.filePath, options);
        if (font === null) {
          diagnostics.push(diagnostic(
            'font-unsupported',
            `File ${resolved.filePath} is not a font and does not reference a .ttf/.otf source.`,
            reference.path,
          ));
        }
      }
    }
    if (font === null) continue;

    const resolved = await options.resolveIndexedPath(font.filePath);
    if (resolved === null) {
      diagnostics.push(diagnostic('font-unresolved', `Font file ${font.filePath} could not be opened.`, reference.path));
      continue;
    }
    fonts[key] = {
      uri: resolved.uri,
      family: `uxml-font-${family++}`,
      ...(font.faceInfo === undefined ? {} : { faceInfo: font.faceInfo }),
    };
    resourceRoots.add(path.dirname(font.filePath));
  }

  return {
    request: {
      ...request,
      fonts,
      fontsResolved: true,
      assetDiagnostics: diagnostics,
    },
    resourceRoots: [...resourceRoots],
  };
}
