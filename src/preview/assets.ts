import path from 'node:path';
import type { RenderRequest } from './protocol';

export interface ResolvedAsset {
  readonly filePath: string;
  readonly uri: string;
}

export interface AssetRoundTrip {
  readonly request: RenderRequest;
  readonly resourceRoots: readonly string[];
}

export async function resolveAssetRoundTrip(
  request: RenderRequest,
  misses: readonly string[],
  resolve: (assetPath: string) => Promise<ResolvedAsset | null>,
): Promise<AssetRoundTrip | null> {
  if (request.assetsResolved) return null;

  const assets = { ...request.assets };
  const resourceRoots = new Set<string>();
  for (const assetPath of new Set(misses)) {
    const resolved = await resolve(assetPath);
    if (resolved === null) continue;
    assets[assetPath] = resolved.uri;
    resourceRoots.add(path.dirname(resolved.filePath));
  }

  return {
    request: { ...request, assets, assetsResolved: true },
    resourceRoots: [...resourceRoots],
  };
}
