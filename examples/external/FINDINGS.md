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

## Step 8.5 path-resolution rerun

The same 14-file happy-dom observation was repeated after adding the path
forms seen above. Import failures fell from **31 to 27** while their diagnostic
lines fell from **62 to 54**. Asset failure occurrences fell from **27 to 10**.
After path-keyed grouping, those 10 asset occurrences occupy eight items. The
panel now shows **35 A items** for 35 distinct failed paths; their preserved
core and host information occupies 65 displayed lines.

- The eight removed import lines were the two `%20`-encoded World at War
  stylesheets, each observed through both the core and host warning sources in
  two UXML files.
- The 17 removed asset occurrences were the resolvable `%20` and `/Assets/`
  paths.
- The 54 remaining import lines describe 26 transitive relative import
  failures and one Debug UI package failure. Each failure keeps its separate
  core and host text inside one path-keyed item. The latter is not present under
  this sample's `Packages/` tree, and `Library/PackageCache` is deliberately not
  searched.
- The ten remaining asset occurrences are seven inline-style URLs that still
  reach the hook with XML entities (three in `MyGameUI`, four in `MessageBox`)
  and three Design System Showcase occurrences. Repeated paths reduce these to
  eight path-keyed items.

## Core 0.4.0 import-origin rerun

The same 14 files were observed again on 2026-08-12 with `uxml-preview` 0.4.0
and the extension resolving imports by `(url, from)`. The earlier figures above
remain the before-state. The result has three separate counting layers; merging
them would make newly observable references look like regressions.

1. **Imports:** `import-unresolved` fell from **54 diagnostic lines / 27
   problems** to **2 diagnostic lines / 1 problem**. The remaining problem is
   Debug UI's reference to a Packages stylesheet that does not exist in the
   sampled project. `Library/PackageCache` is deliberately not searched, so
   this is not an extension resolver failure. No ambiguous-parent warning was
   observed.
2. **Previously evaluated asset failures:** the existing cohort fell from
   **10 occurrences to 3**. The seven entity-escaped inline URLs now resolve;
   the three remaining occurrences are `resource('sinanata')` in
   `DesignSystemShowcase.uxml`.
3. **Newly surfaced asset references:** **420 occurrences** reached
   `resolveAsset` for the first time because the nested USS files now load.
   These are not newly created failures: the preview was already missing their
   effects while the stylesheets were unreadable, but could not diagnose the
   asset references inside them. They split into ThemePreview **177**,
   Showcase **242**, and MenuButton **1**. Of the 420, **419 use `resource()`**
   and **1 uses `url()`**. Together with the three previous-cohort failures,
   the current total is 423 occurrences, which is not comparable to the old
   total of 10.

The rerun also found seven Showcase boxes beyond four times the 1920×1080
canvas. This is a long-document result, not a renderer defect: one wrapping
container is 4,508px tall and the other six boxes are its bottom content at
top coordinates 4,332–4,636px. At 3840×4320 the same check found zero boxes
beyond four canvas widths or heights. The wrapping container's
`flex-direction`, `flex-wrap`, and padding come from the document's inline
style, so opening the nested stylesheets exposed the intended tall layout.

## `resource()` project lookup rerun

The same 14 files were observed after adding a lazy index of every `Resources`
folder below the configured project's `Assets` tree. The previously surfaced
**419-occurrence** `resource()` cohort split into **0 resolved project assets**
and **419 references with no matching project Resources asset**. ThemePreview
accounts for 177 and Showcase for 242. Including the three pre-existing
`resource('sinanata')` occurrences gives 422 total `resource()` calls, all with
no project match. The selective external corpus contains no matching image
files under its Resources folders, so zero resolutions is consistent with the
files present rather than evidence that the lookup path was skipped.

The unmatched references are classified in C, not B: after an exhaustive
project Resources lookup, an Editor built-in resource is a live possibility,
but the extension cannot possess Unity Editor's private resource files and no
future core rendering support can make those files available. A misspelled or
omitted project asset is observationally identical, so the diagnostic states
only the measured fact and the built-in possibility; it does not hardcode or
assert an Editor-resource name list. If `projectRoot` is empty and no search
was possible, that remains an actionable A diagnostic instead.

Unity 6000.0.40f1 substitutes an Editor icon after a failed `resource()`
lookup. The extension intentionally keeps the core's magenta fallback and the
warning. Substitution would make an unavailable or misspelled asset look
plausibly correct, violating the viewer's rule that failed rendering stays
visible.

## Correction — the 419-resource C diagnosis was wrong

The preceding section records a diagnosis the extension should not have made.
It changed one measured fact — no match in the collected project Resources —
into an unsupported cause: that the reference might be an Editor built-in.
That inference put all 419 occurrences in C, where the panel tells the user
there is nothing they can do. In a complete copy of this project, every one of
those references resolves.

The evidence is conclusive. The 419 occurrences reduce to 120 unique names,
all under `Textures/Icons/`. None of the 120 uses the observed Editor-icon
forms such as a `d_` or `console.` prefix. The pinned source commit contains all
120 corresponding SVG files under
`Assets/DesignSystem/Resources/Textures/Icons/`; the local sample contained
the importing USS files but omitted that directory. The first collection took
UXML, its stylesheets, and images referenced directly by URL, so it missed
assets reached only through `resource()`.

The collection now includes those 120 SVGs byte-for-byte from commit
`76e4bb0`; SHA-256 comparison against the downloaded source found zero
mismatches. Re-running all 14 documents splits the surfaced cohort into
**419 resolved and drawn / 0 absent after searching Resources (A) / 0 other
causes**: ThemePreview 177 and Showcase 242. The three pre-existing
`resource('sinanata')` occurrences remain separate from that cohort.

The host diagnostic was corrected at the same time. It now reports only the
number of Resources folders searched, the failed name, and the configured
project root. Zero folders and a missing target both stay in A; a target found
only in a format the preview cannot load goes to B. There is no built-in-name
list and no cause guessed from a failed lookup.

## Core issue — give `resolveImport` the importing stylesheet URL

Filed as [`ReuHomi/uxml-preview#1`](https://github.com/ReuHomi/uxml-preview/issues/1).

**Title:** Pass the importing stylesheet URL to `resolveImport`

**Body:**

`resolveImport` currently receives only the requested URL. That is sufficient
for a `<Style src>` reference, but not for a relative `@import`: `a.uss` importing
`"b.uss"` means `b.uss` is relative to `a.uss`, not to the UXML document.

This was reproduced with two files from the Step 8 external corpus:
`ThemePreview.uxml` and `DesignSystemShowcase.uxml`. Both load
`DesignSystem.uss`, whose 13 sibling relative imports then fail. That is 26
failed imports across the two files. They occupy 26 A items and retain 52
diagnostic lines because the VS Code preview preserves both the core and host
information inside each item.

The extension cannot infer the base safely from request order, and parsing a
warning message would make prose into an API. Suggested backward-compatible
shape:

```ts
resolveImport?: (url: string, from: string | null) => string | null;
```

`from` is the URL of the stylesheet containing this import. It is `null` for a
stylesheet referenced directly by `<Style src>`. Existing one-argument
callbacks remain valid TypeScript and JavaScript implementations.

Acceptance: nested relative imports resolve against the URL of their containing
stylesheet; direct `<Style src>` calls receive `from === null`; existing
one-argument resolvers continue to work.

## Core issue — decode XML entities in inline-style asset URLs

Filed as [`ReuHomi/uxml-preview#2`](https://github.com/ReuHomi/uxml-preview/issues/2).

**Title:** Decode XML entities before passing inline-style asset URLs to `resolveAsset`

**Body:**

Asset URLs extracted from an inline UXML `style` attribute reach
`resolveAsset` with their XML source spelling intact. For example, the hook
receives a value wrapped in `&apos;` whose query uses `&amp;`. In the same parser,
URLs from `<Style src>` are already entity-decoded before their resolver hook is
called.

This was reproduced in two Step 8 files: three URLs in `MyGameUI.uxml` and four
in `MessageBox-template.uxml`. After the extension learned `%20` paths, all
seven still produced `asset-unresolved`, while neighbouring plain URLs against
the same copied asset tree resolved.

The extension cannot safely decode this after parsing: it no longer knows which
ampersands came from entities and which were literal URL data. Decoding belongs
at the parser boundary, before calling the hook.

Acceptance: inline `style="...url(&apos;...?...&amp;...&apos;)..."` reaches
`resolveAsset` as the same decoded URL that an equivalent USS declaration would
provide, without changing literal ampersands that are valid URL content.
