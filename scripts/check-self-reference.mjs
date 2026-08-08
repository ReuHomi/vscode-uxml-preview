/**
 * Fails if this package's own name collides with any dependency name.
 *
 * Node lets a package import itself by name once it has an `exports` field. If
 * the extension were called `uxml-preview`, `import 'uxml-preview'` would then
 * resolve to the extension instead of the core — silently, with no error and no
 * warning. Verified by experiment; the failure is invisible until something
 * behaves wrongly far from the cause.
 *
 * The check is broader than that one package on purpose: any future dependency
 * would fall into the same hole.
 */
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const clash = names.filter((n) => n === pkg.name);

if (clash.length > 0) {
  console.error(
    `package name "${pkg.name}" collides with a dependency of the same name.\n` +
      `With an "exports" field present, imports of that name resolve to this\n` +
      `package instead of the dependency, with no error. Rename the package.`,
  );
  process.exit(1);
}
console.log(`self-reference: ok (${pkg.name} vs ${names.length} deps)`);
