# External sample findings

Observed on 2026-08-09 with `uxml-preview` 0.3.0 at 1920×1080. The same core
parse/render path ran under happy-dom with deterministic text measurement. Each
source folder was treated as its `projectRoot`; relative and project stylesheet
reads used the extension's current resolver. Asset discovery was followed by
one path-resolution rerender, matching the extension's two-render cap.

`C` includes the three always-present `KNOWN_DIVERGENCES`; an additional
`version-dependent` warning raises it to four or five. In `A`, the first number
is the number of failure occurrences and the parenthesised number is the number
of diagnostic lines. One unresolved import produces a core line and a host
line; both are preserved because they carry different information.

| File | Render | A (problems; lines) | B | C | Observation |
|---|---:|---|---|---|---|
| `unity-royale/Assets/UI/Uxml/TitleScreen.uxml` | rendered | 4 assets (4 lines) | 3 `unsupported-property` | 4 | Labels and boxes render; existing `/Assets/...` images do not resolve, and 9-slice is not painted. |
| `unity-royale/Assets/UI/Uxml/GameScreen.uxml` | rendered | 2 assets (2 lines) | 0 | 3 | Five nonzero boxes render, but both visible background layers are missing because `/Assets/...` is unresolved. |
| `unity-royale/Assets/UI/Uxml/Options.uxml` | rendered | 2 assets (2 lines) | 3 `unsupported-control`, 2 `unsupported-property` | 4 | Output text is only `Options 1 Back`; Toggle/SliderInt labels disappear and two boxes have zero size, both covered by warnings. |
| `unity-royale/Assets/UI/Uxml/CardUI.uxml` | rendered | 4 assets (4 lines) | 1 `unsupported-control` | 3 | Card numbers render, while every image layer is absent; the custom card root is explicitly downgraded. |
| `unity-royale/Assets/UI/Uxml/HealthUI.uxml` | rendered | 2 assets (2 lines) | 1 `unsupported-property` | 3 | All five boxes are finite, but the health textures and Unity tint behaviour are absent with warnings. |
| `world-at-war/Assets/Resources/Views/MissionSelectView.uxml` | rendered | 2 imports (4 lines) | 31 `unsupported-control` | 3 | Only two labels remain meaningful; 32 of 38 boxes are zero-sized. Template, Instance and AttributeOverrides are all explicit fallbacks. |
| `world-at-war/Assets/UI Toolkit/Templates/MenuButton.uxml` | rendered | 2 imports (4 lines) | 0 | 4 | `SOLO` renders in two finite boxes, but both existing stylesheets fail to load because `%20` remains in the disk path. |
| `ui-toolkit-demos/Assets/Resources/UI/Game/MyGameUI.uxml` | rendered | 3 assets (3 lines) | 1 `unsupported-control`, 3 `unsupported-property` | 3 | One plain project asset resolves; three inline entity-escaped URLs remain unresolved and the custom button is downgraded. |
| `ui-toolkit-demos/Assets/Resources/UI/MessageBox/MessageBox-template.uxml` | rendered | 7 assets (7 lines) | 10 `unsupported-property` | 4 | Text and all 15 boxes render, but image-backed modal chrome is absent through `%20` and entity-escaped URLs; 9-slice/font differences are reported. |
| `ui-toolkit-demos/Assets/Resources/UI/MySpecialButton/MySpecialButton-template.uxml` | rendered | 0 (0 lines) | 0 | 4 | The referenced image resolves and all three boxes are finite; no document-specific gap was observed automatically. |
| `debug-ui/sandbox/DebugUI.Sandbox/Assets/Sandbox/UXML/UXMLSandbox.uxml` | rendered | 1 import (2 lines) | 9 `unsupported-control` | 4 | Only `Button Label` remains as text; eight of twelve boxes are zero-sized, all attached to explicit unsupported-control warnings. |
| `design-system/Assets/DesignSystem/Editor/Theme/ThemePreview.uxml` | rendered | 13 imports (26 lines) | 35 `unsupported-control` | 5 | The first stylesheet loads, but its 13 relative `@import`s do not. 843 elements survive; 320 boxes are zero-sized after the style loss/control fallbacks. |
| `design-system/Assets/Showcase/Resources/DesignSystemShowcase.uxml` | rendered | 13 imports + 3 assets (29 lines) | 50 `unsupported-control` | 5 | 1,129 elements render without a crash, but nested styles are absent and 482 boxes are zero-sized. No coordinate exceeded four canvas widths/heights. |
| `uitoolkit-helpers/Scripts/AspectRatioPadding/Sample.uxml` | rendered | 0 (0 lines) | 1 `unsupported-control` | 3 | The custom aspect-ratio container becomes a plain element; two zero-sized structural boxes occur alongside the explicit fallback warning. |

Across the corpus, A contains **58 failure occurrences** represented by **89
diagnostic lines**. These units are not interchangeable.

No sample produced an empty DOM, runaway coordinates, or an exception. The
extension panel therefore had something to say for all 14 inputs.

## Findings grouped by cause

### Core — unsupported controls and template semantics

`Template`, `Instance`, `AttributeOverrides`, Toggle, SliderInt, editor fields,
and project-specific controls all become plain elements. The Mission Select,
Debug UI, and design-system files show the largest visible loss. Every observed
case emitted `unsupported-control`; this is loud partial coverage, not a silent
failure.

### Extension — percent-encoded project paths are not decoded

The World at War `core.uss` and `screens.uss` files are present under
`Assets/UI Toolkit/Styles`, but their URLs contain `UI%20Toolkit`. The current
path resolver looks for a literal `%20` directory, producing two failed imports
and four diagnostic lines per file. This is an extension path-resolution problem; it was
recorded and not fixed here.

The same limitation leaves image paths containing `%20` unresolved in the
message-box sample even though the selected source assets are present.

### Extension — additional Unity path forms are unsupported

Unity Royale uses root-style `/Assets/...` image URLs. The matching copied
images exist under each source project, but the resolver treats the leading
slash as a filesystem root rather than the Unity project root.

Debug UI uses `project://database/Packages/...`; the extension intentionally
only recognizes `Assets/` today, so the package stylesheet stays unresolved.

### Core — inline style asset URLs retain XML entities

In `MyGameUI.uxml` and `MessageBox-template.uxml`, URLs inside a `style`
attribute reach `asset-unresolved` still wrapped in `&apos;` and with `&amp;` in
the query. A neighbouring non-escaped project URL resolves against the same
copied asset tree. This isolates the failure to extraction/decoding before the
extension resolver and is classified as a core problem.

### Unresolved — relative imports need the importing stylesheet as their base

`DesignSystem.uss` resolves, then its 13 sibling `@import "..."` references do
not. The extension currently resolves every relative URL against the UXML
folder, while the core's synchronous hook supplies the URL but no importing
stylesheet origin. The failure sits on that API boundary; without a confirmed
contract for the base URL, assigning it solely to core or extension would be
guesswork.

### Core — unsupported properties are reported, not hidden

The recurring property gaps are 9-slice (`-unity-slice-*`), Unity image tint,
and Unity font assets. They materially remove chrome from the Royale and modal
samples, but each has an `unsupported-property` warning, so they are classified
as known unsupported core coverage rather than silent wrong output.

## Silent-failure check

No warning-free visual error was confirmed by this non-browser run. Every
zero-sized or visibly stripped cluster had an import, asset, control, or
property warning somewhere in its causal path. `MySpecialButton-template.uxml`
was the only sample with no A/B entries; its asset resolved and all boxes were
finite. Pixel comparison against Unity was not available, so subtler silent
differences remain unclassified rather than being asserted away.
