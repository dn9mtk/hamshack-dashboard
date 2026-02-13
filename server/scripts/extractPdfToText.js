#!/usr/bin/env node
/**
 * Extract PDF to antennas.txt (one-time).
 * Usage: node server/scripts/extractPdfToText.js [path/to/file.pdf]
 * Default: server/data/antennas.pdf
 *
 * Large PDFs (e.g. 180 MB): Uses first 100 pages to limit memory/time.
 * Output: server/data/antennas.txt (first ~12k chars used by the AI).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const MAX_CHARS = 12000;
const MAX_PAGES = 100;

const pdfPath = process.argv[2] || path.join(DATA_DIR, "antennas.pdf");
const outPath = path.join(DATA_DIR, "antennas.txt");

if (!fs.existsSync(pdfPath)) {
  console.error("PDF not found:", pdfPath);
  console.error("Usage: node extractPdfToText.js [path/to/file.pdf]");
  process.exit(1);
}

const stat = fs.statSync(pdfPath);
const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
console.log(`Extracting ${pdfPath} (${sizeMB} MB)...`);
console.log(`Limiting to first ${MAX_PAGES} pages to avoid memory issues.`);

try {
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = fs.readFileSync(pdfPath);
  const { text, numpages, numrender } = await pdfParse(buffer, { max: MAX_PAGES });
  const t = (text || "").trim().replace(/\s+/g, " ");
  const out = t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) + "\n[… gekürzt - weitere " + (t.length - MAX_CHARS) + " Zeichen]" : t;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(outPath, out, "utf8");
  console.log(`Done. antennas.txt written (${out.length} chars from ${numrender}/${numpages} pages).`);
} catch (e) {
  console.error("Extraction failed:", e?.message || e);
  if (parseFloat(sizeMB) > 50) {
    console.error("\nPDF very large. Try:");
    console.error("  1. Online: smallpdf.com/pdf-to-text or pdf2go.com/pdf-to-text");
    console.error("  2. Adobe Reader: File > Save As Other > Text");
    console.error("  3. Copy-paste key sections into antennas.txt manually");
  }
  process.exit(1);
}
