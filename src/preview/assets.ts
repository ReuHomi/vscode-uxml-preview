import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { buildGuidIndex } from 'uxml-preview/unity-project';
import type { GuidIndex } from 'uxml-preview/unity-project';
import { packageCacheNotSearched } from './imports';
import { assetKey, type AssetDiagnostic, type AssetReference, type RenderRequest } from './protocol';

export { assetKey } from './protocol';

export interface ResolvedAsset {
  readonly filePath: string;
  readonly uri: string;
}

export interface AssetRoundTrip {
  readonly request: RenderRequest;
  readonly resourceRoots: readonly string[];
}

interface ResourceCandidate {
  readonly filePath: string;
  readonly depth: number;
}

type ResourceIndex = Map<string, readonly ResourceCandidate[]>;

export interface AssetIndexCache {
  guidProjectRoot?: string;
  guidIndex?: Promise<GuidIndex>;
  resourceProjectRoot?: string;
  resourceIndex?: Promise<ResourceIndex>;
}

interface AssetResolutionOptions {
  readonly cache: AssetIndexCache;
  readonly projectRoot: string;
  readonly resolvePath: (assetPath: string) => Promise<ResolvedAsset | null>;
  readonly resolveIndexedPath: (filePath: string) => Promise<ResolvedAsset | null>;
  readonly buildGuidIndex?: typeof buildGuidIndex;
  readonly buildResourceIndex?: typeof buildResourceIndex;
}

const COMMON_IMAGE_EXTENSIONS = new Set([
  '.bmp', '.exr', '.gif', '.hdr', '.jpeg', '.jpg', '.png', '.psd', '.svg', '.tga', '.tif', '.tiff',
]);

function resourceName(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\/+/, '');
}

async function buildResourceIndex(projectRoot: string): Promise<ResourceIndex> {
  const assetsRoot = path.join(projectRoot, 'Assets');
  const mutable = new Map<string, ResourceCandidate[]>();
  const add = (name: string, candidate: ResourceCandidate): void => {
    const candidates = mutable.get(name) ?? [];
    candidates.push(candidate);
    mutable.set(name, candidates);
  };
  const visit = async (directory: string, resourceRoot?: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath, entry.name === 'Resources' ? filePath : resourceRoot);
      } else if (entry.isFile() && resourceRoot !== undefined) {
        const relativePath = path.relative(resourceRoot, filePath).split(path.sep).join('/');
        const extension = path.extname(relativePath).toLowerCase();
        const candidate = {
          filePath,
          depth: path.relative(assetsRoot, resourceRoot).split(path.sep).filter(Boolean).length,
        };
        add(relativePath, candidate);
        if (COMMON_IMAGE_EXTENSIONS.has(extension)) add(relativePath.slice(0, -extension.length), candidate);
      }
    }
  };

  await visit(assetsRoot);
  return new Map([...mutable].map(([name, candidates]) => [
    name,
    candidates.sort((left, right) => left.depth - right.depth || left.filePath.localeCompare(right.filePath)),
  ]));
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
  misses: readonly AssetReference[],
  options: AssetResolutionOptions,
): Promise<AssetRoundTrip | null> {
  if (request.assetsResolved) return null;

  const assets = { ...request.assets };
  const diagnostics = [...request.assetDiagnostics];
  const resourceRoots = new Set<string>();
  const unresolved: Array<{ reference: string; guid: string }> = [];
  const references = new Map(misses.map((reference) => [assetKey(reference.path, reference.form), reference]));
  for (const { path: assetPath, form } of references.values()) {
    if (form === 'resource') {
      if (options.projectRoot === '') {
        diagnostics.push(diagnostic(
          'project-root-suggested',
          `Could not search project Resources for resource('${assetPath}') because uxmlPreview.projectRoot is empty. Set it to the Unity project root, then reopen the preview.`,
          assetPath,
        ));
        continue;
      }
      if (options.cache.resourceProjectRoot !== options.projectRoot || options.cache.resourceIndex === undefined) {
        options.cache.resourceProjectRoot = options.projectRoot;
        options.cache.resourceIndex = (options.buildResourceIndex ?? buildResourceIndex)(options.projectRoot);
      }
      const index = await options.cache.resourceIndex;
      const candidates = index.get(resourceName(assetPath)) ?? [];
      const selected = candidates[0];
      const resolved = selected === undefined ? null : await options.resolveIndexedPath(selected.filePath);
      if (resolved === null) {
        // Deliberate divergence: keep the core's magenta fallback instead of substituting Unity's built-in icon.
        diagnostics.push(diagnostic(
          'resource-unavailable',
          `No project Resources asset was found for resource('${assetPath}'). It may be a Unity Editor built-in resource, which is unavailable outside the Editor; the preview keeps the magenta fallback instead of substituting an icon.`,
          assetPath,
        ));
        continue;
      }
      assets[assetKey(assetPath, form)] = resolved.uri;
      resourceRoots.add(path.dirname(resolved.filePath));
      if (candidates.length > 1) {
        diagnostics.push(diagnostic(
          'resource-ambiguous',
          `resource('${assetPath}') matched multiple project Resources assets. Selected the shallower candidate observed by Unity 6000.0.40f1, but the general priority rule is unconfirmed: ${resolved.filePath}. Candidates: ${candidates.map(({ filePath }) => filePath).join(', ')}`,
          assetPath,
        ));
      }
      continue;
    }

    const resolved = await options.resolvePath(assetPath);
    if (resolved !== null) {
      assets[assetKey(assetPath, form)] = resolved.uri;
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
    const reused = options.cache.guidProjectRoot === options.projectRoot && options.cache.guidIndex !== undefined;
    if (!reused) {
      options.cache.guidProjectRoot = options.projectRoot;
      options.cache.guidIndex = (options.buildGuidIndex ?? buildGuidIndex)(options.projectRoot);
    }
    const index = await options.cache.guidIndex!;
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
      assets[assetKey(reference, 'url')] = resolved.uri;
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
