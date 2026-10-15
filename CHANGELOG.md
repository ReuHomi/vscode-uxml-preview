# Changelog

## 0.3.1 - 2026-10-15

### Changed

- Upgrade the renderer dependency to `uxml-preview@^0.5.1`.
- Associate unresolved paths with the core's structured warning subjects.
- Group `not-uss` and `invalid-value` warnings as fixable and show the core's
  replacement names. Show `matches-unity` warnings under Notes without counting
  them as issues; unknown reasons keep their existing kind-based group.
- Show the core's layout notice when an unrendered property affects layout.
- Let diagnostics reveal their source offset in the entry UXML or an
  unambiguous imported stylesheet. Template diagnostics remain plain text.
- Prefetch template dependencies up to the core's `TEMPLATE_DEPTH_LIMIT`.
- Run webview tests on Node 20 as well as the full verification on Node 22.

## 0.3.0 - 2026-08-26

### Known limitations

- Template slots are not composed. Slot children stay omitted and an explicit
  diagnostic lists the definitions and children involved.
- `style` in `AttributeOverrides` is ignored to match Unity 6000.0.40f1 and is
  reported as `override-style-ignored`.
- Packages under `Library/PackageCache` are not searched.

### Added

- Upgrade the renderer dependency to `uxml-preview@^0.5.0`.
- Compose `Template` and `Instance`, including nesting, template-local
  stylesheets, non-style overrides, and cycle/depth guards.
- Rebuild the resolved file graph after entry, template UXML, or template-local
  stylesheet changes, then watch the newly resolved paths.
- Add and exhaustively classify nine core diagnostics:
  `template-src-unresolved`, `template-not-declared`, `template-cycle`,
  `template-depth-exceeded`, `override-target-missing`,
  `duplicate-name-in-tree`, `package-path-not-searched`,
  `template-slot-unsupported`, and `override-style-ignored`.
- Show a diagnostic's source document when the core provides it; diagnostics
  without provenance remain unlabeled.

### External sample results

- The only template-bearing document in the 14-file sample expanded all 15
  instances. Its 31 template fallback diagnostic lines (one declaration, 15
  instances, and 15 overrides) fell to zero; one `duplicate-name-in-tree`
  diagnostic became newly visible and is counted separately.
- All 14 documents still produced a render tree. This is structural test-DOM
  evidence, not Unity/browser pixel equality.

## 0.2.0 - 2026-08-15

### Changed

- Nested relative `@import` rules now resolve against the stylesheet that
  contains them.
- `resource()` image references now resolve from Resources folders anywhere
  under the project's Assets directory, with or without a file extension.
- Unity asset paths now accept `/Assets`, `/Packages`, and
  `project://database/Packages` forms.
- Asset diagnostics now report what was searched and how many Resources
  folders were checked instead of guessing why a reference was missing.

### External sample results

- Across 14 real-world documents, unresolved import problems fell from 27 to
  1, and failures among asset references that were already evaluated fell from
  10 to 3.
- Fixing nested imports caused 419 `resource()` references inside previously
  unread stylesheets to be evaluated for the first time. All 419 now resolve;
  they were not failures counted before this release.

## 0.1.0 - 2026-08-10

### Added

- Preview `.uxml` documents and their referenced USS stylesheets inside VS Code.
- Refresh the preview when the document or a resolved imported stylesheet is saved.
- Choose a fixed canvas size, use common size presets, or fit the layout to the
  preview panel.
- Apply `hover`, `active`, `focus`, and `disabled` states to every element from
  the control bar.
- Resolve relative and Unity project asset paths, including percent-encoded
  paths, `Assets`, `Packages`, and GUID fallback for moved assets.
- Group diagnostics by whether the reader can fix the document, wait for
  renderer support, or account for a known difference from Unity.
- Mark unsupported controls in the preview instead of silently hiding them.
- Open a preview from the editor title, Explorer context menu, or
  `Ctrl+Shift+V` (`Cmd+Shift+V` on macOS).
- Follow VS Code light, dark, and high-contrast themes.
- Provide English and Korean READMEs and an English browser manual.

### Supported scope

- Renders `VisualElement`, `Label`, `Button`, `Image`, and `ScrollView`.
- Other controls render as plain fallback boxes with diagnostics.

### Known limitations

- `Template` and `Instance` are not composed.
- Nested relative `@import` paths cannot use the importing stylesheet as their
  base yet.
- Asset URLs in inline `style` attributes can retain XML entities.
- Packages under `Library/PackageCache` are not searched.
- Text metrics, wrapping-container height, and main-axis percentages under an
  unsized parent can differ from Unity; the diagnostics panel identifies these
  renderer differences.
