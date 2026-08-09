[한국어](README.ko.md)

# UXML Preview for Unity UI Toolkit

Render Unity UI Toolkit `.uxml` documents inside VS Code without opening the
Unity Editor. Layout is calculated by
[`uxml-preview`](https://github.com/ReuHomi/uxml-preview) with Yoga, the layout
engine used by UI Toolkit. This extension reads and watches files, hosts the
preview, and shows what the core renderer produced.

## What it renders — and what it does not

The renderer supports `VisualElement`, `Label`, `Button`, `Image`, and
`ScrollView`. Other controls are replaced by plain boxes and reported in the
diagnostics panel; unsupported content is not silently hidden.

`Template` and `Instance` are not rendered yet. This is a common limitation in
real UI Toolkit documents, where reusable UI is often composed from templates.

This scope was checked against 14 UXML documents from six external open-source
projects. The sample produced 131 `unsupported-control` diagnostics. That is
not 131 separate rendering failures: it is another way of seeing that only the
five control types above are currently supported. The sources, licences, and
file-by-file observations are in the
[external sample findings](examples/external/FINDINGS.md).

This extension:

- is a viewer and never edits your files;
- does not validate USS; syntax and validation belong to existing language
  extensions;
- does not promise to reproduce every UI Toolkit control or visual property.

## Known limitations

The core renderer publishes three known differences from Unity:

- Browser font metrics differ from Unity font assets, so text-dependent layout
  can move by a few pixels.
- Unity's rule for the height of a container whose children wrap has not been
  identified, so that height can differ.
- A percentage on the main axis under a parent without a definite size can
  resolve differently because the Yoga version used by Unity 6000.0.40f1 and
  the Yoga version used by the renderer behave differently.

Two path cases found in external projects are also unresolved:

- Relative `@import` cannot be based on the importing stylesheet until the core
  tells the resolver which stylesheet requested it
  ([uxml-preview#1](https://github.com/ReuHomi/uxml-preview/issues/1)).
- Asset URLs in inline `style` attributes can reach the resolver with XML
  entities still encoded
  ([uxml-preview#2](https://github.com/ReuHomi/uxml-preview/issues/2)).

Packages are resolved only from `<projectRoot>/Packages`; Unity's
`Library/PackageCache` is not searched.

## Measured layout values

Against Unity 6000.0.40f1, **548 of 564 compared layout values matched**. The
564 values are `x`, `y`, `width`, and `height` for 141 elements. This measures
Yoga's layout coordinates for that case set, not control coverage or the full
painted image. See the core's
[accuracy document](https://github.com/ReuHomi/uxml-preview/blob/main/docs/accuracy.en.md)
for the cases, environment, tolerance, and exclusions.

## Open a preview

For a concept-first walkthrough, open the self-contained
[user manual](docs/manual.html) in a browser.

With a `.uxml` file selected:

1. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> on Windows/Linux or
   <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> on macOS.
2. Use the preview icon in the editor title bar.
3. Right-click the file in Explorer and choose **UXML Preview: Open Preview to
   the Side**.

Saving the UXML document or a resolved imported stylesheet refreshes the
preview. The canvas starts at a fixed 1920×1080 so the same document lays out
at the same size for different readers; **Fit to panel** is available when a
responsive preview is wanted.

The control bar can apply `hover`, `active`, `focus`, and `disabled` to every
element at once. The active states and the canvas size remain visible beside
the preview in the control bar.

## Settings

`uxmlPreview.projectRoot` is the Unity project directory containing `Assets`,
`Packages`, and `ProjectSettings`. It is used for `project://` paths, `/Assets`
paths, package paths, and GUID fallback after a written asset path has gone
stale. Set it when the workspace folder containing the UXML file is not the
Unity project root. When it is empty, that workspace folder is used.

| Setting | Default | Purpose |
|---|---:|---|
| `uxmlPreview.canvas.width` | `1920` | Fixed root width in pixels. |
| `uxmlPreview.canvas.height` | `1080` | Fixed root height in pixels. |
| `uxmlPreview.canvas.fitToPanel` | `false` | Use the available preview area instead of the fixed size. |
| `uxmlPreview.projectRoot` | empty | Resolve Unity project paths and GUID references. |
| `uxmlPreview.states` | `{}` | Pseudo-class states keyed by USS selector; there is no selector UI in this version. |

---

`Unity` and `UI Toolkit` are trademarks of Unity Technologies. This project is
not affiliated with or endorsed by Unity Technologies.
