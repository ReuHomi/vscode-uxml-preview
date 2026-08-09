import path from 'node:path';
import { buildGuidIndex } from 'uxml-preview/unity-project';
import type { GuidIndex } from 'uxml-preview/unity-project';
import { packageCacheNotSearched } from './imports';
import type { AssetDiagnostic, RenderRequest } from './protocol';

export interface ResolvedAsset {
  readonly filePath: string;
  readonly uri: string;
}

export interface AssetRoundTrip {
  readonly request: RenderRequest;
  readonly resourceRoots: readonly string[];
}

export interface GuidIndexCache {
  projectRoot?: string;
  index?: Promise<GuidIndex>;
}

interface AssetResolutionOptions {
  readonly cache: GuidIndexCache;
  readonly projectRoot: string;
  readonly resolvePath: (assetPath: string) => Promise<ResolvedAsset | null>;
  readonly resolveIndexedPath: (filePath: string) => Promise<ResolvedAsset | null>;
  readonly buildGuidIndex?: typeof buildGuidIndex;
}

function assetGuid(reference: string): string | null {
  try {
    return new URL(reference, 'file:///').searchParams.get('guid');
  } catch {
    return null;
  }
}

function diagnostic(kind: AssetDiagnostic['kind'], message: string, assetPath?: string): AssetDiagnostic {
  return { source: 'host', kind, message, ...(assetPath === undefined ? {} : { path: assetPath }) };
}

export async function resolveAssetRoundTrip(
  request: RenderRequest,
  misses: readonly string[],
  options: AssetResolutionOptions,
): Promise<AssetRoundTrip | null> {
  if (request.assetsResolved) return null;

  const assets = { ...request.assets };
  const diagnostics = [...request.assetDiagnostics];
  const resourceRoots = new Set<string>();
  const unresolved: Array<{ reference: string; guid: string }> = [];
  for (const assetPath of new Set(misses)) {
    const resolved = await options.resolvePath(assetPath);
    if (resolved !== null) {
      assets[assetPath] = resolved.uri;
      resourceRoots.add(path.dirname(resolved.filePath));
      continue;
    }
    const packageNote = packageCacheNotSearched(assetPath);
    if (packageNote !== null) {
      diagnostics.push(diagnostic(
        'package-cache-skipped',
        `Could not resolve ${assetPath} under Packages/. ${packageNote}`,
        assetPath,
      ));
    }
    const guid = assetGuid(assetPath);
    if (guid !== null) unresolved.push({ reference: assetPath, guid });
  }

  if (unresolved.length > 0 && options.projectRoot === '') {
    diagnostics.push(diagnostic(
      'guid-index-skipped',
      'GUID lookup was skipped because uxmlPreview.projectRoot is empty. Set it to the Unity project root, then reopen the preview.',
    ));
  } else if (unresolved.length > 0) {
    const reused = options.cache.projectRoot === options.projectRoot && options.cache.index !== undefined;
    if (!reused) {
      options.cache.projectRoot = options.projectRoot;
      options.cache.index = (options.buildGuidIndex ?? buildGuidIndex)(options.projectRoot);
    }
    const index = await options.cache.index!;
    const count = `${index.size} indexed asset${index.size === 1 ? '' : 's'}`;
    diagnostics.push(diagnostic(
      'guid-index',
      `${reused ? 'Reused' : 'Built'} GUID index with ${count} from ${options.projectRoot}. The index is not watched; reopen the preview after .meta files change.${index.size === 0 ? ' A zero-size index usually means projectRoot is not the Unity project root.' : ''}`,
    ));
    for (const { reference, guid } of unresolved) {
      const actualPath = index.get(guid);
      const resolved = actualPath === null ? null : await options.resolveIndexedPath(actualPath);
      if (resolved === null) {
        diagnostics.push(diagnostic(
          'guid-unresolved',
          `Could not resolve ${reference} after searching ${count}. Check the GUID and uxmlPreview.projectRoot.`,
          reference,
        ));
        continue;
      }
      assets[reference] = resolved.uri;
      resourceRoots.add(path.dirname(resolved.filePath));
      diagnostics.push(diagnostic(
        'asset-path-stale',
        `The written asset path could not be found, but its GUID resolved. The UXML/USS path is stale: ${reference} -> ${resolved.filePath}`,
        reference,
      ));
    }
  }

  return {
    request: { ...request, assetDiagnostics: diagnostics, assets, assetsResolved: true },
    resourceRoots: [...resourceRoots],
  };
}
