import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { suggestUnityProjectRoot } from '../src/preview/unity-project';

const root = path.join(path.parse(process.cwd()).root, 'project');
const nested = path.join(root, 'Assets', 'Package', 'Assets');
const file = path.join(nested, 'UI', 'screen.uxml');

function directories(...values: string[]) {
  const entries = new Set(values.map((value) => path.resolve(value)));
  return async (value: string) => entries.has(path.resolve(value));
}

describe('Unity project root suggestion', () => {
  it('finds the project containing the UXML file', async () => {
    await expect(suggestUnityProjectRoot(file, '', directories(
      path.join(root, 'Assets'),
      path.join(root, 'ProjectSettings'),
    ))).resolves.toBe(root);
  });

  it('rejects a folder with Assets but no ProjectSettings', async () => {
    await expect(suggestUnityProjectRoot(file, '', directories(
      path.join(root, 'Assets'),
    ))).resolves.toBeNull();
  });

  it('chooses the outer Unity root when Assets is nested', async () => {
    await expect(suggestUnityProjectRoot(file, '', directories(
      path.join(nested, 'Assets'),
      path.join(nested, 'ProjectSettings'),
      path.join(root, 'Assets'),
      path.join(root, 'ProjectSettings'),
    ))).resolves.toBe(root);
  });

  it('does not inspect the filesystem when projectRoot is configured', async () => {
    let calls = 0;
    await expect(suggestUnityProjectRoot(file, root, async () => {
      calls += 1;
      return true;
    })).resolves.toBeNull();
    expect(calls).toBe(0);
  });
});
