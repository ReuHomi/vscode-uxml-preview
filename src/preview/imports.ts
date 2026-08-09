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

const MAX_ROUNDS = 16;

export interface ImportMap {
  /** URL exactly as it appears in the file, to stylesheet text. */
  readonly resolved: ReadonlyMap<string, string>;
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
export type ReadStylesheet = (url: string) => Promise<StylesheetSource | null>;

const PROJECT_ASSETS_PREFIX = 'project://database/Assets/';
const GUID_ONLY = /^(?:guid:\/\/)?[0-9a-f]{32}$/i;

/**
 * Purpose:      resolve only the path forms Step 2 has evidence for.
 * Ensures:      project URLs use the project root; relative URLs use the UXML
 *               directory; GUID-only and unknown schemes stay unresolved.
 */
export function resolveStylesheetPath(
  url: string,
  uxmlPath: string,
  projectRoot: string | undefined,
  workspaceRoot: string | undefined,
): string | null {
  const query = url.indexOf('?');
  const bare = query === -1 ? url : url.slice(0, query);

  if (GUID_ONLY.test(bare)) return null;

  if (bare.startsWith(PROJECT_ASSETS_PREFIX)) {
    const root = projectRoot || workspaceRoot;
    return root === undefined
      ? null
      : path.resolve(root, 'Assets', bare.slice(PROJECT_ASSETS_PREFIX.length));
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

export async function collectImports(
  uxml: string,
  uss: string | undefined,
  read: ReadStylesheet,
): Promise<ImportMap> {
  const resolved = new Map<string, string>();
  const paths = new Set<string>();
  const unresolved = new Set<string>();
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds += 1;

    // The hook records what it was asked for. Reading the URL out of a warning
    // message would mean parsing prose the core is free to reword.
    const asked = new Set<string>();
    parse(uxml, uss, {
      resolveImport: (url) => {
        asked.add(url);
        return resolved.get(url) ?? null;
      },
    });

    const misses = [...asked].filter((u) => !resolved.has(u) && !unresolved.has(u));
    if (misses.length === 0) break;

    for (const url of misses) {
      const source = await read(url);
      if (source === null) unresolved.add(url);
      else {
        resolved.set(url, source.text);
        paths.add(source.path);
      }
    }
  }

  return { resolved, paths: [...paths], unresolved: [...unresolved], rounds };
}

export function watchTargets(uxmlPath: string, importPaths: readonly string[]): string[] {
  return [uxmlPath, ...importPaths];
}
