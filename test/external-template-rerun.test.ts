// @vitest-environment happy-dom

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { liveNodeCount, loadLayoutEngine, parse, render, serialize } from 'uxml-preview';
import { collectImports, createStylesheetReader } from '../src/preview/imports';
import { importKey } from '../src/preview/protocol';

const EXTERNAL = path.resolve('examples/external');

function projectRoot(file: string): string {
  const source = path.relative(EXTERNAL, file).split(path.sep)[0];
  if (!source) throw new Error(`external UXML has no source folder: ${file}`);
  return path.join(EXTERNAL, source);
}

describe('Step 6 external template re-observation', () => {
  beforeAll(async () => {
    await loadLayoutEngine();
  });

  it('opens all 14 files and records template-specific diagnostic changes', async () => {
    const relative = (await readdir(EXTERNAL, { recursive: true }))
      .filter((file) => file.endsWith('.uxml'))
      .sort();
    const totals = {
      documents: relative.length,
      rendered: 0,
      templateWarnings: 0,
      duplicateNames: 0,
      formerTemplateFallbacks: 0,
      missionElements: 0,
      missionZeroBoxes: 0,
      missionUnsupportedControls: 0,
      missionOverrideTextVisible: false,
    };

    for (const name of relative) {
      const file = path.join(EXTERNAL, name);
      const uxml = await readFile(file, 'utf8');
      const reader = createStylesheetReader(file, projectRoot(file), undefined, (target) =>
        readFile(target, 'utf8'),
      );
      const imports = await collectImports(uxml, undefined, reader.read);
      const resolved = new Map(
        [...imports.resolved.values()].map((item) => [importKey(item.url, item.from), item.text]),
      );
      const model = parse(uxml, undefined, {
        resolveImport: (url, from) => resolved.get(importKey(url, from)) ?? null,
      });
      expect(serialize(model).uxml, name).toBe(uxml);
      const container = document.createElement('div');
      const result = render(model, container, {
        size: { width: 1920, height: 1080 },
        measureText: (text, context) => ({
          width: text.length * context.fontSize * 0.5,
          height: context.fontSize,
        }),
      });
      if (result.elements.size > 0) totals.rendered++;
      for (const warning of result.warnings) {
        if (warning.kind.startsWith('template-') || warning.kind === 'override-target-missing') {
          totals.templateWarnings++;
        }
        if (warning.kind === 'duplicate-name-in-tree') totals.duplicateNames++;
        if (
          warning.kind === 'unsupported-control' &&
          /<(?:Template|Instance|AttributeOverrides|TemplateContainer)>/.test(warning.message)
        ) {
          totals.formerTemplateFallbacks++;
        }
      }
      if (name.endsWith('MissionSelectView.uxml')) {
        totals.missionElements = result.boxes.size;
        totals.missionZeroBoxes = [...result.boxes.values()].filter(
          (box) => box.width === 0 || box.height === 0,
        ).length;
        totals.missionUnsupportedControls = result.warnings.filter(
          (warning) => warning.kind === 'unsupported-control',
        ).length;
        totals.missionOverrideTextVisible = container.textContent.includes('Semper Fi');
      }
      result.dispose();
    }

    console.info(`EXTERNAL_TEMPLATE_RERUN ${JSON.stringify(totals)}`);
    expect(totals).toEqual({
      documents: 14,
      rendered: 14,
      templateWarnings: 0,
      duplicateNames: 1,
      formerTemplateFallbacks: 0,
      missionElements: 37,
      missionZeroBoxes: 0,
      missionUnsupportedControls: 0,
      missionOverrideTextVisible: true,
    });
    expect(liveNodeCount()).toBe(0);
  });
});
