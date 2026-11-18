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

export function effectiveProjectRoot(
  configuredRoot: string,
  suggestedRoot: string | null,
  workspaceRoot: string | undefined,
): string {
  return configuredRoot || suggestedRoot || workspaceRoot || '';
}

export function projectRootNote(
  configuredRoot: string,
  suggestedRoot: string | null,
  workspaceRoot: string | undefined,
): string | undefined {
  if (configuredRoot !== '') return undefined;
  if (suggestedRoot !== null) return `Using detected Unity project root: ${suggestedRoot}`;
  if (workspaceRoot !== undefined && workspaceRoot !== '') {
    return `Using workspace folder as project root: ${workspaceRoot}`;
  }
  return undefined;
}
