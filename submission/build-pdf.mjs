// Renders writeup.md to floor-writeup.pdf with headless Chrome.
import { chromium } from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const dir = path.dirname(new URL(import.meta.url).pathname);
const body = execFileSync("python3", ["-c", "import markdown,sys;print(markdown.markdown(open(sys.argv[1]).read(),extensions=['extra']))", path.join(dir, "writeup.md")]).toString();
const css = `
@page { size: Letter; margin: 18mm 18mm 18mm 18mm; }
body { font-family: Inter, "Helvetica Neue", Arial, sans-serif; color: #1c1b19; font-size: 10.5pt; line-height: 1.5; }
h1 { font-size: 24pt; letter-spacing: -0.5px; margin: 0 0 2pt; }
h1 + p { color: #6b6962; margin-top: 0; }
h2 { font-size: 14pt; margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #e3e0d8; break-after: avoid; }
ul { padding-left: 16pt; } li { margin: 2pt 0; }
code { font-family: "DejaVu Sans Mono", Menlo, monospace; font-size: 9pt; background: #f1efe9; padding: 0 3pt; border-radius: 3pt; }
a { color: #2448c8; text-decoration: none; }
figure { margin: 10pt 0; break-inside: avoid; }
figure img { width: 100%; border: 1px solid #e3e0d8; border-radius: 6pt; display: block; }
figcaption { font-size: 9pt; color: #6b6962; margin-top: 4pt; }
.row { display: flex; gap: 14pt; break-inside: avoid; }
.row figure.phone { flex: 1; margin: 6pt 0; }
.row figure.phone img { width: 62%; margin: 0 auto; }
.row figcaption { text-align: center; }
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><base href="file://${dir}/"><style>${css}</style></head><body>${body}</body></html>`;
fs.writeFileSync(path.join(dir, ".writeup.html"), html);
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage();
await p.goto("file://" + path.join(dir, ".writeup.html"), { waitUntil: "load" });
await p.pdf({ path: path.join(dir, "floor-writeup.pdf"), format: "Letter", printBackground: true, margin: { top: "18mm", bottom: "18mm", left: "18mm", right: "18mm" }, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="font-size:8pt;color:#8a877f;width:100%;text-align:center;font-family:Arial">Floor, Nexconn Build Challenge 2026, page <span class="pageNumber"></span> of <span class="totalPages"></span></div>' });
await b.close();
fs.rmSync(path.join(dir, ".writeup.html"));
console.log("ok");
