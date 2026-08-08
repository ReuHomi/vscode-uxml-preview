# UXML Preview for Unity UI Toolkit

Render Unity UI Toolkit `.uxml` / `.uss` files inside VS Code, without opening
the Unity Editor.

Layout comes from [`uxml-preview`](https://github.com/ReuHomi/uxml-preview),
which uses Yoga compiled to WebAssembly — the same layout engine UI Toolkit
itself uses. This extension reads files, watches them, and shows what the
renderer produced. It does not parse or lay out anything on its own.

## What it does not do

- **It does not edit.** This is a viewer. It never writes to your files.
- **It does not check your USS.** Syntax highlighting and validation are already
  covered by other extensions; this one stays out of that.
- **It does not draw everything yet.** Controls outside the supported set fall
  back to a plain box, and every fallback is reported in the panel. What could
  not be drawn is always visible — a preview that hides its gaps is worse than
  no preview.

## Status

Pre-release. Not yet published.

---

`Unity` and `UI Toolkit` are trademarks of Unity Technologies. This project is
not affiliated with or endorsed by Unity Technologies.
