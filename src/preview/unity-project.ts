import path from 'node:path';

export async function suggestUnityProjectRoot(
  uxmlPath: string,
  configuredRoot: string,
  isDirectory: (candidate: string) => Promise<boolean>,
): Promise<string | null> {
  if (configuredRoot !== '') return null;

  let directory = path.dirname(uxmlPath);
  let match: string | null = null;
  while (true) {
    if (
      await isDirectory(path.join(directory, 'Assets'))
      && await isDirectory(path.join(directory, 'ProjectSettings'))
    ) match = directory;

    const parent = path.dirname(directory);
    if (parent === directory) return match;
    directory = parent;
  }
}
