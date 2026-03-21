# AVS Generator

Desktop app for generating **After Visit Summary (AVS)** PDFs for a **weight management** program. Paste a visit letter plus structured measurement lines; the app parses the text, fills a styled HTML template (including a weight chart), and exports a Letter-size PDF.

Built with [Electron](https://www.electronjs.org/) for macOS (packaged via [electron-builder](https://www.electron.build/)).

## Requirements

- **Node.js** (LTS recommended)
- **macOS** for the default build target (`arm64` DMG). Adjust `package.json` scripts/build config for other platforms if needed.

## Install & run

```bash
npm install
npm start
```

## Build a distributable (macOS)

```bash
npm run build
```

This produces **Apple Silicon (arm64)** artifacts for M1/M2/M3/M4 Macs:

| Output | Use |
|--------|-----|
| `dist/AVS Generator-1.0.0-arm64.dmg` | Open the DMG, drag **AVS Generator** to **Applications**, launch from there (or Spotlight). |
| `dist/mac-arm64/AVS Generator.app` | Run the app directly without installing: double-click or `open "dist/mac-arm64/AVS Generator.app"`. |

`dist/` is gitignored. Publishing to GitHub Releases is disabled (`publish: null`); remove that if you configure `GH_TOKEN` and want automated uploads.

### Gatekeeper / unsigned builds

Unless you sign and notarize the app, macOS may show **“cannot be opened because the developer cannot be verified.”** Right-click the app → **Open** → **Open**, or in **System Settings → Privacy & Security** approve the app after a failed launch.

## Usage

1. Enter the **patient name**.
2. Paste **letter text** first, then **measurement lines** at the bottom.
3. Each measurement line should start with `Date:` (case-insensitive) and use pipe-separated fields. The **first** measurement row must include a `|` so the app can tell measurements apart from normal letter lines. Example:

   ```
   Date: 8/19/2025 | Weight: 237.1 lbs | Waist: 40 in | Neck: 16 in | Hip: 49 in | BMI: 36.85
   ```

4. Click **Generate PDF**. Choose a save location (default folder: `~/clawd/output/avs`).
5. Use **Open PDF** or **Print** after a successful save.

### Letter sections (optional)

The parser recognizes section headers in the letter (case-insensitive), including:

- SMART goals (nutrition / exercise)
- Medication
- Exercise prescription / FITTE
- Nutrition guidelines / goals
- Next steps
- Lifestyle (parsed for structure; the PDF layout matches the standard template without a separate Lifestyle block)
- Action plan (header line is skipped; following lines stay in the current section)

Content under each heading is rendered into the PDF layout.

## Project layout

| File | Role |
|------|------|
| `main.js` | Electron main process: window, PDF generation (`printToPDF`), save dialog, open file, print |
| `preload.js` | Exposes a small `window.api` to the renderer |
| `index.html` / `renderer.js` | Form UI and generate/open/print actions |
| `generator.js` | Parse letter + measurements, compute stats, fill template placeholders |
| `avs_template.html` | PDF layout and styles (Google Fonts, placeholders like `{{PATIENT_NAME}}`) |

Parsing/rendering logic in `generator.js` was ported from an earlier Python script (`generate_avs.py`).

## Behavior notes

- **PDF rendering**: Filled HTML is written to a temp file, loaded in a hidden window, then printed to PDF (Letter, margins 0, background graphics on). A short delay allows fonts/images to load.
- **Weight chart**: SVG chart and measurement table are built from parsed rows; hero messaging can reflect percent weight lost.
- **QR code**: The template uses a remote QR image URL; generating a PDF may require network access for that asset.
- **Print**: The main process runs `lp` via `execFile` (no shell) with a **fixed queue name** (`DEFAULT_LP_PRINTER` in `main.js`). Change that constant for your environment or print from Preview.
- **Errors**: Failed PDF generation or save surfaces an error in the status line; **Open PDF** reports failures returned from the OS.

## License / attribution

See `package.json` for package metadata and author. Use and distribution terms are not specified in this repository; add a `LICENSE` file if you need explicit licensing.
