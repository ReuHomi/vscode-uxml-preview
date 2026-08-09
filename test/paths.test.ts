/** These path expectations precede the resolver implementation. Do not derive them from it. */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  packageCacheNotSearched,
  readStylesheet,
  resolveStylesheetPath,
} from '../src/preview/imports';

const PROJECT = path.join(path.parse(process.cwd()).root, 'unity-project');
const UXML = path.join(PROJECT, 'Assets', 'UI', 'screen.uxml');
const WORLD_STYLE = 'project://database/Assets/UI%20Toolkit/Styles/core.uss?fileID=7433441132597879392&guid=7ddee200e3647634fad40c422ee9bf29&type=3#core';
const ROYALE_ASSET = '/Assets/UI/Elements/ui_card_front.png';
const DEBUG_PACKAGE = 'project://database/Packages/com.annulusgames.debug-ui/Package%20Resources/Debug%20UI.uss?fileID=7433441132597879392&guid=e9f02f385e5b745d8aa12c1ffa8e5e8e&type=3#Debug UI';
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('resolveStylesheetPath', () => {
  it('resolves project://database/Assets from projectRoot', () => {
    expect(resolveStylesheetPath('project://database/Assets/UI/base.uss', UXML, PROJECT, undefined))
      .toBe(path.join(PROJECT, 'Assets', 'UI', 'base.uss'));
  });

  it('strips a project URL query string before resolving', () => {
    expect(resolveStylesheetPath('project://database/Assets/UI/base.uss?fileID=7&guid=abc', UXML, PROJECT, undefined))
      .toBe(path.join(PROJECT, 'Assets', 'UI', 'base.uss'));
  });

  it('resolves relative paths from the UXML directory', () => {
    expect(resolveStylesheetPath('../Shared/base.uss', UXML, PROJECT, undefined))
      .toBe(path.join(PROJECT, 'Assets', 'Shared', 'base.uss'));
  });

  it('does not resolve a GUID-only reference', () => {
    expect(resolveStylesheetPath('guid://0123456789abcdef0123456789abcdef', UXML, PROJECT, undefined))
      .toBeNull();
  });

  it('uses the containing workspace when projectRoot is unset', () => {
    expect(resolveStylesheetPath('project://database/Assets/UI/base.uss', UXML, '', PROJECT))
      .toBe(path.join(PROJECT, 'Assets', 'UI', 'base.uss'));
  });

  it('decodes the percent-encoded path from the World at War sample', () => {
    expect(resolveStylesheetPath(WORLD_STYLE, UXML, PROJECT, undefined))
      .toBe(path.join(PROJECT, 'Assets', 'UI Toolkit', 'Styles', 'core.uss'));
  });

  it('resolves the root-style Assets path from the Unity Royale sample', () => {
    expect(resolveStylesheetPath(ROYALE_ASSET, UXML, PROJECT, undefined))
      .toBe(path.join(PROJECT, 'Assets', 'UI', 'Elements', 'ui_card_front.png'));
  });

  it('resolves the package URL from the Debug UI sample', () => {
    expect(resolveStylesheetPath(DEBUG_PACKAGE, UXML, PROJECT, undefined))
      .toBe(path.join(PROJECT, 'Packages', 'com.annulusgames.debug-ui', 'Package Resources', 'Debug UI.uss'));
  });

  it('resolves the equivalent Packages-relative form', () => {
    expect(resolveStylesheetPath('Packages/com.annulusgames.debug-ui/Package%20Resources/Debug%20UI.uss', UXML, PROJECT, undefined))
      .toBe(path.join(PROJECT, 'Packages', 'com.annulusgames.debug-ui', 'Package Resources', 'Debug UI.uss'));
  });

  it('does not throw on malformed percent encoding', () => {
    const malformed = WORLD_STYLE.replace('UI%20Toolkit', 'UI%2GToolkit');
    expect(() => resolveStylesheetPath(malformed, UXML, PROJECT, undefined)).not.toThrow();
    expect(resolveStylesheetPath(malformed, UXML, PROJECT, undefined))
      .toBe(path.join(PROJECT, 'Assets', 'UI%2GToolkit', 'Styles', 'core.uss'));
  });
});

describe('readStylesheet', () => {
  it('returns the text with the resolved disk path', async () => {
    const result = await readStylesheet('base.uss', UXML, PROJECT, undefined, async () => '.x {}');

    expect(result).toEqual({
      text: '.x {}',
      path: path.join(PROJECT, 'Assets', 'UI', 'base.uss'),
    });
  });

  it('returns null when the resolved file does not exist', async () => {
    const result = await readStylesheet('missing.uss', UXML, PROJECT, undefined, async () => {
      throw new Error('ENOENT');
    });

    expect(result).toBeNull();
  });

  it('does not search Library/PackageCache and explains that limit', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'uxml-package-cache-'));
    temporaryRoots.push(root);
    const cached = path.join(root, 'Library', 'PackageCache', 'com.annulusgames.debug-ui', 'Package Resources', 'Debug UI.uss');
    await mkdir(path.dirname(cached), { recursive: true });
    await writeFile(cached, '.cached {}');

    const result = await readStylesheet(DEBUG_PACKAGE, path.join(root, 'Assets', 'screen.uxml'), root, undefined, async (filePath) => readFile(filePath, 'utf8'));

    expect(result).toBeNull();
    expect(packageCacheNotSearched(DEBUG_PACKAGE)).toContain('Library/PackageCache is not searched');
  });
});
