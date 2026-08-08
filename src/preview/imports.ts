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
import { parse } from 'uxml-preview';

const MAX_ROUNDS = 16;

export interface ImportMap {
  /** URL exactly as it appears in the file, to stylesheet text. */
  readonly resolved: ReadonlyMap<string, string>;
  /** URLs asked for that no reader could turn into text. */
  readonly unresolved: readonly string[];
  /** Rounds used. Equal to MAX_ROUNDS means the walk was cut short. */
  readonly rounds: number;
}

/** Reads the text a URL stands for, or null. Async because the host can be. */
export type ReadStylesheet = (url: string) => Promise<string | null>;

export async function collectImports(
  uxml: string,
  uss: string | undefined,
  read: ReadStylesheet,
): Promise<ImportMap> {
  const resolved = new Map<string, string>();
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
      const text = await read(url);
      if (text === null) unresolved.add(url);
      else resolved.set(url, text);
    }
  }

  return { resolved, unresolved: [...unresolved], rounds };
}
