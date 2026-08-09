/** These path expectations precede the resolver implementation. Do not derive them from it. */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readStylesheet, resolveStylesheetPath } from '../src/preview/imports';

const PROJECT = path.join(path.parse(process.cwd()).root, 'unity-project');
const UXML = path.join(PROJECT, 'Assets', 'UI', 'screen.uxml');

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
});
