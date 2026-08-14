# Changelog

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
