import path from 'node:path';
import { buildGuidIndex, readFontAsset } from 'uxml-preview/unity-project';
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

const FONT_EXTENSIONS = new Set(['.ttf', '.otf']);
const TTC_EXTENSION = '.ttc';

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

interface FontFailure {
  readonly kind: 'font-unresolved' | 'font-unsupported';
  readonly message: string;
}

interface FontLookup {
  readonly font: FontFile | null;
  readonly failure?: FontFailure;
  readonly candidates: readonly string[];
  readonly selected?: string;
}

function isFontFile(filePath: string): boolean {
  return FONT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isTtc(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === TTC_EXTENSION;
}

function diagnostic(kind: AssetDiagnostic['kind'], message: string, assetPath?: string): AssetDiagnostic {
  return { source: 'host', kind, message, ...(assetPath === undefined ? {} : { path: assetPath }) };
}

async function guidIndex(options: FontResolutionOptions): Promise<GuidIndex> {
  if (options.cache.guidProjectRoot !== options.projectRoot || options.cache.guidIndex === undefined) {
    options.cache.guidProjectRoot = options.projectRoot;
    options.cache.guidIndex = buildGuidIndex(options.projectRoot);
  }
  return options.cache.guidIndex;
}

async function resolveFontAsset(filePath: string, options: FontResolutionOptions): Promise<{ font?: FontFile; failure?: FontFailure }> {
  let source: string;
  try {
    source = await options.readTextFile(filePath);
  } catch {
    return { failure: { kind: 'font-unresolved', message: `Font asset ${filePath} could not be read.` } };
  }

  const parsed = readFontAsset(source);
  if (parsed.kind === 'unrecognized') {
    return {
      failure: {
        kind: 'font-unsupported',
        message: `Font asset ${filePath} has an unrecognized format: ${parsed.reason}.`,
      },
    };
  }
  if (parsed.sourceFontGuid === null) {
    return { failure: { kind: 'font-unresolved', message: `Font asset ${filePath} has no source font reference.` } };
  }

  const sourcePath = (await guidIndex(options)).get(parsed.sourceFontGuid);
  if (sourcePath === null) {
    return {
      failure: {
        kind: 'font-unresolved',
        message: `Font asset ${filePath} references source font GUID ${parsed.sourceFontGuid}, but no .meta file with that GUID was found.`,
      },
    };
  }
  if (isTtc(sourcePath)) {
    return {
      failure: {
        kind: 'font-unsupported',
        message: `Font asset ${filePath} references ${sourcePath}; .ttc is not supported because the browser loads only the first face.`,
      },
    };
  }
  if (!isFontFile(sourcePath)) {
    return {
      failure: {
        kind: 'font-unsupported',
        message: `Font asset ${filePath} references ${sourcePath}, which is not a .ttf/.otf source font.`,
      },
    };
  }
  return { font: { filePath: sourcePath, faceInfo: parsed.faceInfo } };
}

async function resolveResourceFont(reference: string, options: FontResolutionOptions): Promise<FontLookup> {
  if (options.cache.resourceProjectRoot !== options.projectRoot || options.cache.resourceIndex === undefined) {
    options.cache.resourceProjectRoot = options.projectRoot;
    options.cache.resourceIndex = buildResourceIndex(options.projectRoot);
  }
  const index = await options.cache.resourceIndex;
  const candidates = index.assets.get(resourceName(reference)) ?? [];
  const paths = candidates.map(({ filePath }) => filePath);
  let failure: FontFailure | undefined;

  for (const candidate of candidates) {
    if (path.extname(candidate.filePath).toLowerCase() !== '.asset') continue;
    const resolved = await resolveFontAsset(candidate.filePath, options);
    if (resolved.font !== undefined) {
      return { font: resolved.font, candidates: paths, selected: candidate.filePath };
    }
    failure ??= resolved.failure;
  }

  const direct = candidates.find(({ filePath }) => isFontFile(filePath));
  if (direct !== undefined) {
    return { font: { filePath: direct.filePath }, candidates: paths, selected: direct.filePath };
  }

  const ttc = candidates.find(({ filePath }) => isTtc(filePath));
  if (ttc !== undefined) {
    return {
      font: null,
      candidates: paths,
      failure: {
        kind: 'font-unsupported',
        message: `Font resource('${reference}') resolved to ${ttc.filePath}; .ttc is not supported because the browser loads only the first face.`,
      },
    };
  }

  return {
    font: null,
    candidates: paths,
    failure: failure ?? (paths.length === 0
      ? { kind: 'font-unresolved', message: `Font resource('${reference}') was not found in any project Resources folder.` }
      : { kind: 'font-unsupported', message: `Font resource('${reference}') was found, but none of its assets resolves to a .ttf/.otf source font.` }),
  };
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
    let failure: FontFailure | undefined;
    if (reference.form === 'resource') {
      const lookup = await resolveResourceFont(reference.path, options);
      font = lookup.font;
      failure = lookup.failure;
      if (font !== null && lookup.candidates.length > 1) {
        diagnostics.push(diagnostic(
          'resource-ambiguous',
          `Font resource('${reference.path}') matched multiple project Resources assets. Selected ${lookup.selected ?? font.filePath}. Candidates: ${lookup.candidates.join(', ')}`,
          reference.path,
        ));
      }
    } else {
      const resolved = await options.resolvePath(reference.path);
      if (resolved === null) {
        failure = { kind: 'font-unresolved', message: `Font file ${reference.path} was not found.` };
      } else if (isFontFile(resolved.filePath)) {
        font = { filePath: resolved.filePath };
      } else if (isTtc(resolved.filePath)) {
        failure = {
          kind: 'font-unsupported',
          message: `Font file ${resolved.filePath} is a .ttc; the browser loads only the first face.`,
        };
      } else {
        const asset = await resolveFontAsset(resolved.filePath, options);
        font = asset.font ?? null;
        failure = asset.failure;
      }
    }
    if (font === null) {
      if (failure !== undefined) diagnostics.push(diagnostic(failure.kind, failure.message, reference.path));
      continue;
    }

    const resolved = await options.resolveIndexedPath(font.filePath);
    if (resolved === null) {
      diagnostics.push(diagnostic('font-unresolved', `Font file ${font.filePath} could not be opened.`, reference.path));
      continue;
    }
    fonts[key] = {
      uri: resolved.uri,
      family: `uxml-font-${family++}`,
      path: reference.path,
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
