# Changelog

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
