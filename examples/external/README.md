# External UXML samples

Collected on 2026-08-09 to expose gaps with UXML written outside this project.
Every copied source file is byte-for-byte unchanged and remains under its
original repository path below the source folder. The collection is selective:
it includes the sampled UXML, its directly referenced USS, the asset paths used
to distinguish resolver failures from absent files, and the applicable licence.
It is not a vendored copy of each Unity project.

The first collection copied UXML, the stylesheets needed to open it, and image
files referenced directly by URL. That missed assets reached indirectly through
`resource()`. On 2026-08-15 the design-system sample was expanded with the 120
SVG files from `Assets/DesignSystem/Resources/Textures/Icons/` at the same
pinned commit. They are copied byte-for-byte; the rest of each source project
remains selective.

For `project://database/Assets/...` references, set `uxmlPreview.projectRoot`
to the source folder (`examples/external/<source>`). Some failures below are the
point of the sample, so do not rewrite paths to make them render.

## Sources and licences

| Folder | Source commit | Licence | Included licence |
|---|---|---|---|
| `unity-royale` | [Unity-Technologies/UIToolkitUnityRoyaleRuntimeDemo@9b5006d](https://github.com/Unity-Technologies/UIToolkitUnityRoyaleRuntimeDemo/tree/9b5006d2580101b4d08d59d03d7dadc697d75311) | MIT | `LICENSE.md` |
| `world-at-war` | [SBUplakankus/world-at-war-ui-toolkit@303ead2](https://github.com/SBUplakankus/world-at-war-ui-toolkit/tree/303ead2c2ff86b1ddf2fd5b80e655a10b6ef1ac6) | MIT | `LICENSE` |
| `ui-toolkit-demos` | [ccfoo242/unity-ui-toolkit-demos@dae35f1](https://github.com/ccfoo242/unity-ui-toolkit-demos/tree/dae35f1352ccf5ef7b2f6cded8006764a48996b2) | MIT; copied Kenney asset licences remain beside those assets | `LICENSE` and asset `License.txt` files |
| `debug-ui` | [annulusgames/DebugUI@eadce6b](https://github.com/annulusgames/DebugUI/tree/eadce6b0604ad8a5a06117751eeae7de2d64707b) | MIT | `LICENSE` |
| `design-system` | [sinanata/unity-ui-toolkit-design-system@76e4bb0](https://github.com/sinanata/unity-ui-toolkit-design-system/tree/76e4bb000e2378bb8bc5cb50ceca95570cad35ac) | MIT | `LICENSE` |
| `uitoolkit-helpers` | [spaghettioh/UIToolkitHelpers@8fac813](https://github.com/spaghettioh/UIToolkitHelpers/tree/8fac81337c5929010c84d8038160fe3406b7137c) | Unlicense | `UNLICENSE` |

## Sample manifest

The original entries were collected on 2026-08-09; the 120-icon row was added
on 2026-08-15. No copied source file was modified.

| Local file | Original URL | Licence | Why it is here |
|---|---|---|---|
| `unity-royale/Assets/UI/Uxml/TitleScreen.uxml` | [original](https://github.com/Unity-Technologies/UIToolkitUnityRoyaleRuntimeDemo/blob/9b5006d2580101b4d08d59d03d7dadc697d75311/Assets/UI/Uxml/TitleScreen.uxml) | MIT | UI Builder runtime menu with two stylesheets and sliced image buttons. |
| `unity-royale/Assets/UI/Uxml/GameScreen.uxml` | [original](https://github.com/Unity-Technologies/UIToolkitUnityRoyaleRuntimeDemo/blob/9b5006d2580101b4d08d59d03d7dadc697d75311/Assets/UI/Uxml/GameScreen.uxml) | MIT | Runtime HUD layout whose visible structure depends on background assets. |
| `unity-royale/Assets/UI/Uxml/Options.uxml` | [original](https://github.com/Unity-Technologies/UIToolkitUnityRoyaleRuntimeDemo/blob/9b5006d2580101b4d08d59d03d7dadc697d75311/Assets/UI/Uxml/Options.uxml) | MIT | Custom root plus Toggle and SliderInt controls. |
| `unity-royale/Assets/UI/Uxml/CardUI.uxml` | [original](https://github.com/Unity-Technologies/UIToolkitUnityRoyaleRuntimeDemo/blob/9b5006d2580101b4d08d59d03d7dadc697d75311/Assets/UI/Uxml/CardUI.uxml) | MIT | Custom card control with absolute overlays and several image layers. |
| `unity-royale/Assets/UI/Uxml/HealthUI.uxml` | [original](https://github.com/Unity-Technologies/UIToolkitUnityRoyaleRuntimeDemo/blob/9b5006d2580101b4d08d59d03d7dadc697d75311/Assets/UI/Uxml/HealthUI.uxml) | MIT | Small runtime component using tinted image layers. |
| `world-at-war/Assets/Resources/Views/MissionSelectView.uxml` | [original](https://github.com/SBUplakankus/world-at-war-ui-toolkit/blob/303ead2c2ff86b1ddf2fd5b80e655a10b6ef1ac6/Assets/Resources/Views/MissionSelectView.uxml) | MIT | Template/Instance/AttributeOverrides stress case with percent-encoded project URLs. |
| `world-at-war/Assets/UI Toolkit/Templates/MenuButton.uxml` | [original](https://github.com/SBUplakankus/world-at-war-ui-toolkit/blob/303ead2c2ff86b1ddf2fd5b80e655a10b6ef1ac6/Assets/UI%20Toolkit/Templates/MenuButton.uxml) | MIT | The instantiated template in isolation, retaining project URLs with spaces. |
| `ui-toolkit-demos/Assets/Resources/UI/Game/MyGameUI.uxml` | [original](https://github.com/ccfoo242/unity-ui-toolkit-demos/blob/dae35f1352ccf5ef7b2f6cded8006764a48996b2/Assets/Resources/UI/Game/MyGameUI.uxml) | MIT | Hand-written runtime UI with a custom control and inline asset URLs. |
| `ui-toolkit-demos/Assets/Resources/UI/MessageBox/MessageBox-template.uxml` | [original](https://github.com/ccfoo242/unity-ui-toolkit-demos/blob/dae35f1352ccf5ef7b2f6cded8006764a48996b2/Assets/Resources/UI/MessageBox/MessageBox-template.uxml) | MIT | Inline-heavy modal with 9-sliced image assets and entity-escaped URLs. |
| `ui-toolkit-demos/Assets/Resources/UI/MySpecialButton/MySpecialButton-template.uxml` | [original](https://github.com/ccfoo242/unity-ui-toolkit-demos/blob/dae35f1352ccf5ef7b2f6cded8006764a48996b2/Assets/Resources/UI/MySpecialButton/MySpecialButton-template.uxml) | MIT | Small custom-button template and a resolvable image control case. |
| `debug-ui/sandbox/DebugUI.Sandbox/Assets/Sandbox/UXML/UXMLSandbox.uxml` | [original](https://github.com/annulusgames/DebugUI/blob/eadce6b0604ad8a5a06117751eeae7de2d64707b/sandbox/DebugUI.Sandbox/Assets/Sandbox/UXML/UXMLSandbox.uxml) | MIT | Package stylesheet plus editor-style fields and custom controls. |
| `design-system/Assets/DesignSystem/Editor/Theme/ThemePreview.uxml` | [original](https://github.com/sinanata/unity-ui-toolkit-design-system/blob/76e4bb000e2378bb8bc5cb50ceca95570cad35ac/Assets/DesignSystem/Editor/Theme/ThemePreview.uxml) | MIT | Large editor preview with nested stylesheet imports and many control families. |
| `design-system/Assets/Showcase/Resources/DesignSystemShowcase.uxml` | [original](https://github.com/sinanata/unity-ui-toolkit-design-system/blob/76e4bb000e2378bb8bc5cb50ceca95570cad35ac/Assets/Showcase/Resources/DesignSystemShowcase.uxml) | MIT | Large runtime showcase: more than a thousand rendered model elements. |
| `design-system/Assets/DesignSystem/Resources/Textures/Icons/*.svg` (120 files) | [original directory](https://github.com/sinanata/unity-ui-toolkit-design-system/tree/76e4bb000e2378bb8bc5cb50ceca95570cad35ac/Assets/DesignSystem/Resources/Textures/Icons) | MIT | Project resources omitted by the first URL-only asset collection; required to observe `resource()` honestly. |
| `uitoolkit-helpers/Scripts/AspectRatioPadding/Sample.uxml` | [original](https://github.com/spaghettioh/UIToolkitHelpers/blob/8fac81337c5929010c84d8038160fe3406b7137c/Scripts/AspectRatioPadding/Sample.uxml) | Unlicense | Minimal hand-written custom container with visible child colours. |

## Rejected source

`Unity-Technologies/ui-toolkit-manual-code-examples` was inspected but no files
were copied. Its UXML snippets use the Unity Companion License restricted to
Unity-dependent projects, while other repository material is CC BY-NC-ND. That
licence boundary was not clear enough for redistribution in this extension.
