import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

/** The extension host runs in Node and must not bundle `vscode`. */
const extension = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  outfile: 'dist/extension.js',
  sourcemap: true,
};

/**
 * The webview runs in a browser context. Yoga ships its WebAssembly inline as
 * base64, so there is no `.wasm` file to copy and no loader to configure — but
 * the panel's CSP still needs 'wasm-unsafe-eval'. See src/preview/csp.ts.
 */
const webview = {
  entryPoints: ['webview/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/webview.js',
  sourcemap: true,
};

if (watch) {
  for (const cfg of [extension, webview]) (await context(cfg)).watch();
} else {
  await Promise.all([build(extension), build(webview)]);
}
