[한국어](README.ko.md)

# UXML Preview for Unity UI Toolkit

Version **0.4.0** uses **uxml-preview ^0.7.0**.

Preview composed Template/Instance UXML in VS Code without opening Unity, and
catch `element-name` override typos that Unity silently ignores. Layout is calculated by
[`uxml-preview`](https://github.com/ReuHomi/uxml-preview) with Yoga, the layout
engine used by UI Toolkit. This extension reads and watches files, hosts the
preview, and shows what the core renderer produced.

## What it renders — and what it does not

The renderer supports 15 controls: `VisualElement`, `Label`, `Button`, `Image`,
`ScrollView`, `GroupBox`, `Box`, `TextField`, `Slider`, `SliderInt`, `Toggle`,
`RadioButton`, `ProgressBar`, `TextElement`, and `RepeatButton`.
TextField does not show a caret or selection; RepeatButton is plain text, not a
button shape; scrollbars are not drawn. Other controls are replaced by plain boxes and reported in the
diagnostics panel; unsupported content is not silently hidden.

`Template` declarations and `Instance` uses are composed, including nested
templates, template-local stylesheets, and non-style `AttributeOverrides`.
Slots remain intentionally unsupported: slot children are not placed, and the
diagnostics panel names both the slot definitions and omitted children.
Unity ignores `style` AttributeOverrides during import, so the preview leaves
them unapplied and reports `override-style-ignored`. A missing `element-name`
target is reported as `override-target-missing`, including the names available
in that instance scope.

This scope was checked against 14 UXML documents from six external open-source
projects. The original baseline produced 131 `unsupported-control`
diagnostics; that is a diagnostic count, not 131 separate rendering failures.
In the one template-bearing document, the 0.5.0 rerun expanded all 15
instances: 31 template fallback diagnostic lines (one declaration, 15
instances, and 15 overrides) fell to zero. One newly visible duplicate-name
diagnostic is recorded separately. The sources, licences, and file-by-file
observations are in the
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

Failed `resource()` references deliberately remain visible as magenta
placeholders. Unity substitutes a built-in icon, but this extension does not:
that would make the screen look plausible while hiding the failure. This is an
intentional difference from Unity.

Packages are resolved only from `<projectRoot>/Packages`; Unity's
`Library/PackageCache` is not searched.

## Measured layout values

Layout-value agreement measures coordinates, not control coverage or the full
painted image. Current results are separated by theme and cohort in the core's
[accuracy document](https://github.com/ReuHomi/uxml-preview/blob/main/docs/accuracy.en.md)
with the cases, environment, tolerance, and exclusions.

## Open a preview

For a concept-first walkthrough, open the self-contained
[user manual](https://reuhomi.github.io/vscode-uxml-preview/manual.html) in a browser.

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

The default **Game screen** (`runtime`) theme uses Unity's runtime panel defaults.
Text and buttons can be larger than before. Its transparent background is shown
as a white/gray checkerboard, keeping the dark text visible in VS Code dark themes.
Choose **Editor screen** (`editor`) in the toolbar for the editor theme. The choice
is saved as `uxmlPreview.theme`; the toolbar shows the theme the core actually drew.
The editor theme is not an exact reproduction of older core versions.

The first preview shows a one-time explanation with an editor-theme action.
Forced `disabled` states no longer dim elements; authored `enabled="false"` still does.
Font fallback warnings count as renderer differences; a layout notice appears when
the core says coordinates may differ. Project fonts are not resolved by this extension.

`uxmlPreview.projectRoot` is the Unity project directory containing `Assets`,
`Packages`, and `ProjectSettings`. It is used for `project://` paths, `/Assets`
paths, package paths, and GUID fallback after a written asset path has gone
stale. Set it when the workspace folder containing the UXML file is not the
Unity project root. When it is empty, that workspace folder is used.

| Setting | Default | Purpose |
|---|---:|---|
| `uxmlPreview.theme` | `runtime` | Game screen (`runtime`) or editor screen (`editor`). |
| `uxmlPreview.canvas.width` | `1920` | Fixed root width in pixels. |
| `uxmlPreview.canvas.height` | `1080` | Fixed root height in pixels. |
| `uxmlPreview.canvas.fitToPanel` | `false` | Use the available preview area instead of the fixed size. |
| `uxmlPreview.projectRoot` | empty | Resolve Unity project paths and GUID references. |
| `uxmlPreview.states` | `{}` | Pseudo-class states keyed by USS selector; there is no selector UI in this version. |

---

`Unity` and `UI Toolkit` are trademarks of Unity Technologies. This project is
not affiliated with or endorsed by Unity Technologies.
