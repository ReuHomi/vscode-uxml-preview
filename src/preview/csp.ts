/**
 * Purpose:  the webview's Content-Security-Policy.
 * Ensures:  WebAssembly can be instantiated.
 *
 * `'wasm-unsafe-eval'` is not optional. The core lays out through Yoga compiled
 * to WebAssembly; without it the render dies and the symptom is a blank panel
 * with nothing in the console to point at the cause. Do not remove it while
 * tightening this string.
 */
export function contentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    `default-src 'none'`,
    `img-src ${cspSource} data: https:`,
    `font-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
  ].join('; ');
}

export function nonce(): string {
  let out = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
