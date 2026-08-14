/**
 * Purpose:  turn every stylesheet a document names into text, before rendering.
 * Ensures:  the map is complete — every URL the core will ask for is a hit, or
 *           is reported as unresolved. The webview never waits on a file.
 *
 * Why this exists: `resolveImport` is synchronous, and the core paints into the
 * DOM, so it runs inside the webview — where there is no filesystem. The hook
 * can therefore never read a file. The extension host resolves everything first
 * and hands over a finished map; inside the webview the hook is a Map lookup.
 *
 * Why a loop: a sheet reached through `<Style src>` can itself `@import`
 * another, and that URL is only discovered once the first sheet is parsed.
 * `parse()` runs without a DOM, so the host can run it purely to discover.
 *
 * Not our job: cycle detection. The core already guards imports with a `seen`
 * set. The round cap here is a cost ceiling, not a correctness device.
 */
import path from 'node:path';
import { parse } from 'uxml-preview';
import { importKey, type ImportDiagnostic, type ResolvedImport } from './protocol';

const MAX_ROUNDS = 16;

export interface ImportMap {
  /** JSON-safe `(url, from)` key to the stylesheet that pair resolved to. */
  readonly resolved: ReadonlyMap<string, ResolvedImport>;
  /** Disk paths for resolved stylesheets. Only these are safe to watch. */
  readonly paths: readonly string[];
  /** URLs asked for that no reader could turn into text. */
  readonly unresolved: readonly string[];
  /** Rounds used. Equal to MAX_ROUNDS means the walk was cut short. */
  readonly rounds: number;
}

export interface StylesheetSource {
  readonly text: string;
  readonly path: string;
}

/** Reads the text and disk path a URL stands for, or null. */
export type ReadStylesheet = (url: string, from: string | null) => Promise<StylesheetSource | null>;

export interface StylesheetReader {
  readonly read: ReadStylesheet;
  readonly diagnostics: readonly ImportDiagnostic[];
}

const PROJECT_ASSETS_PREFIX = 'project://database/Assets/';
const PROJECT_PACKAGES_PREFIX = 'project://database/Packages/';
const ROOT_ASSETS_PREFIX = '/Assets/';
const PACKAGES_PREFIX = 'Packages/';
const GUID_ONLY = /^(?:guid:\/\/)?[0-9a-f]{32}$/i;

function barePath(url: string): string {
  const end = [url.indexOf('?'), url.indexOf('#')]
    .filter((index) => index !== -1)
    .reduce((first, index) => Math.min(first, index), url.length);
  const bare = url.slice(0, end);
  try {
    return decodeURIComponent(bare);
  } catch {
    // A malformed escape is still a possible literal filename; let the filesystem reject it.
    return bare;
  }
}

export function packageCacheNotSearched(url: string): string | null {
  const bare = barePath(url);
  return bare.startsWith(PROJECT_PACKAGES_PREFIX) || bare.startsWith(PACKAGES_PREFIX)
    ? 'Packages/ was checked. Library/PackageCache is not searched.'
    : null;
}

/**
 * Purpose:      resolve the Unity path forms observed in real projects.
 * Ensures:      project-root paths use the project root; relative URLs use the
 *               UXML directory; GUID-only and unknown schemes stay unresolved.
 */
export function resolveStylesheetPath(
  url: string,
  uxmlPath: string,
  projectRoot: string | undefined,
  workspaceRoot: string | undefined,
): string | null {
  const bare = barePath(url);
  const root = projectRoot || workspaceRoot;

  if (GUID_ONLY.test(bare)) return null;

  if (bare.startsWith(PROJECT_ASSETS_PREFIX)) {
    return root === undefined
      ? null
      : path.resolve(root, 'Assets', bare.slice(PROJECT_ASSETS_PREFIX.length));
  }

  if (bare.startsWith(ROOT_ASSETS_PREFIX)) {
    return root === undefined
      ? null
      : path.resolve(root, 'Assets', bare.slice(ROOT_ASSETS_PREFIX.length));
  }

  if (bare.startsWith(PROJECT_PACKAGES_PREFIX)) {
    return root === undefined
      ? null
      : path.resolve(root, 'Packages', bare.slice(PROJECT_PACKAGES_PREFIX.length));
  }

  if (bare.startsWith(PACKAGES_PREFIX)) {
    return root === undefined ? null : path.resolve(root, bare);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(bare)) return null;
  return path.resolve(path.dirname(uxmlPath), bare);
}

/**
 * Deps/Effects: calls the injected filesystem reader once for a resolvable URL.
 * Ensures:      unresolved paths and filesystem failures both return null.
 */
export async function readStylesheet(
  url: string,
  uxmlPath: string,
  projectRoot: string | undefined,
  workspaceRoot: string | undefined,
  readFile: (path: string) => Promise<string>,
): Promise<StylesheetSource | null> {
  const resolved = resolveStylesheetPath(url, uxmlPath, projectRoot, workspaceRoot);
  if (resolved === null) return null;

  try {
    return { text: await readFile(resolved), path: resolved };
  } catch {
    return null;
  }
}

/**
 * Purpose:      keep the URL-to-disk-path history needed to resolve `from`.
 * Deps/Effects: reads files through `readFile`; appends a host diagnostic when
 *               one parent URL names multiple disk paths.
 * Ensures:      ambiguous relative imports return null instead of choosing a path.
 */
export function createStylesheetReader(
  uxmlPath: string,
  projectRoot: string | undefined,
  workspaceRoot: string | undefined,
  readFile: (path: string) => Promise<string>,
): StylesheetReader {
  const pathsByUrl = new Map<string, Set<string>>();
  const diagnostics: ImportDiagnostic[] = [];

  return {
    diagnostics,
    read: async (url, from) => {
      let basePath = uxmlPath;
      const bare = barePath(url);
      const rootFixed = /^[a-z][a-z0-9+.-]*:/i.test(bare) || bare.startsWith('/');
      if (from !== null && !rootFixed) {
        const candidates = [...(pathsByUrl.get(from) ?? [])].sort();
        if (candidates.length === 0) return null;
        if (candidates.length > 1) {
          diagnostics.push({
            source: 'host',
            kind: 'import-base-ambiguous',
            path: from,
            message: `Cannot resolve ${url} from ${from} because it names multiple files: ${candidates.join(', ')}`,
          });
          return null;
        }
        basePath = candidates[0]!;
      }

      const source = await readStylesheet(url, basePath, projectRoot, workspaceRoot, readFile);
      if (source !== null) {
        const paths = pathsByUrl.get(url) ?? new Set<string>();
        paths.add(source.path);
        pathsByUrl.set(url, paths);
      }
      return source;
    },
  };
}

export async function collectImports(
  uxml: string,
  uss: string | undefined,
  read: ReadStylesheet,
): Promise<ImportMap> {
  const resolved = new Map<string, ResolvedImport>();
  const paths = new Set<string>();
  const unresolved = new Map<string, { readonly url: string; readonly from: string | null }>();
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds += 1;

    // The hook records what it was asked for. Reading the URL out of a warning
    // message would mean parsing prose the core is free to reword.
    const asked = new Map<string, { readonly url: string; readonly from: string | null }>();
    parse(uxml, uss, {
      resolveImport: (url, from) => {
        const key = importKey(url, from);
        asked.set(key, { url, from });
        return resolved.get(key)?.text ?? null;
      },
    });

    const misses = [...asked].filter(([key]) => !resolved.has(key) && !unresolved.has(key));
    if (misses.length === 0) break;

    for (const [key, reference] of misses) {
      const source = await read(reference.url, reference.from);
      if (source === null) unresolved.set(key, reference);
      else {
        resolved.set(key, { ...reference, text: source.text });
        paths.add(source.path);
      }
    }
  }

  return { resolved, paths: [...paths], unresolved: [...unresolved.values()].map(({ url }) => url), rounds };
}

export function watchTargets(uxmlPath: string, importPaths: readonly string[]): string[] {
  return [...new Set([uxmlPath, ...importPaths])];
}
