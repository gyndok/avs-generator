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

Output goes to `dist/` (DMG and app bundle). `dist/` is gitignored.

## Usage

1. Enter the **patient name**.
2. Paste **letter text** first, then **measurement lines** at the bottom.
3. Each measurement line should start with `Date:` and use pipe-separated fields, for example:

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
- Lifestyle / action plan (action plan lines are skipped as a section header)

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
- **Print**: The main process uses macOS `lp` with a **fixed printer name** (`HP_Color_LaserJet_Pro_M453_4`). Change this in `main.js` for your environment or use the system print dialog from Preview after opening the PDF.

## License / attribution

See `package.json` for package metadata and author. Use and distribution terms are not specified in this repository; add a `LICENSE` file if you need explicit licensing.
