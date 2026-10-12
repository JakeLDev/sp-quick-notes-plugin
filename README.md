# Quick Notes: a Super Productivity plugin

A full-screen scratchpad for quick notes, such as what to do when you come back from a break.

- One global note. It does not change with the project or tag.
- Saves 500 ms after you stop typing, and when the box loses focus or the pane closes.
- Stored with `PluginAPI.persistDataSynced`, so it stays after a restart and syncs with your other devices.
- What you see is what you get. There is no separate edit or preview screen.
- Markdown shortcuts. Type the marker at the start of a line, then a space:
  - `#`, `##`, `###` for headings
  - `-`, `*`, `+` for a bullet list, `1.` for a numbered list. Nested numbered items show as a., b., then i., ii.
  - `[]` or `- [ ]` for a checkbox. `[x]` gives a ticked box.
- Tab and Shift+Tab nest and un-nest list items.
- Click a box, or press `Cmd/Ctrl+Enter`, to tick it.
- Backspace at the start of a heading or checkbox removes its format.
- Paste is plain text. Bold, italic, links and code are not supported.
- Notes are stored as markdown text, so old notes still load.

## Install

1. Build the zip:
   ```bash
   npm run zip
   ```
2. In Super Productivity, go to **Settings → Plugins → Upload Plugin** and select the zip.
3. Open **Quick Notes** from the menu.

## Tests

The tests open `index.html` in headless Chromium with a fake `PluginAPI`. They need a real browser, because the editor uses Chromium's own editing behavior. They take about 2 seconds.

```bash
npm install
npx playwright install --only-shell chromium
npm test
```

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Plugin name, version and permissions |
| `index.html` | The pane. Its script is inline, because Super Productivity serves only this file to the plugin frame |
| `plugin.js` | Empty on purpose. The menu entry opens `index.html` |
| `icon.svg` | Menu icon |
| `test/editor.test.js` | Browser tests. Not in the zip |
