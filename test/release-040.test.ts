import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { supportedControlNames } from 'uxml-preview';

describe('0.4.0 release contract', () => {
  it('declares the extension and renderer versions', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    expect(pkg.version).toBe('0.4.0');
    expect(pkg.dependencies['uxml-preview']).toBe('^0.7.0');
    expect(lock.packages[''].version).toBe(pkg.version);
    expect(lock.packages['node_modules/uxml-preview'].version).toBe('0.7.0');
  });

  it.each(['README.md', 'README.ko.md'])('documents every supported control and theme in %s', (file) => {
    const readme = readFileSync(file, 'utf8');
    for (const name of supportedControlNames()) expect(readme).toContain('`' + name + '`');
    expect(readme).toContain('0.4.0');
    expect(readme).toContain('0.7.0');
    expect(readme).toContain('uxmlPreview.theme');
    expect(readme).toContain('runtime');
    expect(readme).toContain('editor');
  });

  it('keeps the unsupported fixture controls outside core coverage', () => {
    expect(supportedControlNames()).not.toContain('MinMaxSlider');
    expect(supportedControlNames()).not.toContain('DropdownField');
  });

  it('leaves the 0.4.0 changelog date unset for human release', () => {
    expect(readFileSync('CHANGELOG.md', 'utf8')).toMatch(/^## 0\.4\.0 \(draft\)$/m);
  });
});
