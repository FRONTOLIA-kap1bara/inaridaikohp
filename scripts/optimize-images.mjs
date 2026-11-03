import { readdir, readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const output = new URL("src/assets/optimized/", root);
await mkdir(output, { recursive: true });

// Match the homepage's preference for custom images over the bundled originals.
const sources = new Map();
const photoBases = new Set([
  "hero", "hero2", "hero3", "hero4", "hero5",
  "info", "info2", "info3", "news", "news2", "sns", "sns2", "sns3"
]);
for (const directory of ["src/assets/raw/", "images/"]) {
  for (const name of (await readdir(new URL(directory, root))).sort()) {
    const base = name.replace(/\.[^.]+$/, "").toLowerCase();
    if (photoBases.has(base) && /\.(png|jpe?g|webp)$/i.test(name)) {
      sources.set(base, new URL(`${directory}${name}`, root));
    }
  }
}

let originalBytes = 0;
let optimizedBytes = 0;
const generatedFiles = new Set();
for (const [base, path] of sources) {
  const original = await readFile(path);
  const metadata = await sharp(original).metadata();
  const widths = [...new Set([640, base.startsWith("hero") ? 1920 : 1280]
    .map((width) => Math.min(width, metadata.width)))];
  originalBytes += original.byteLength;
  for (const width of widths) {
    const bytes = await sharp(original).rotate().resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 }).toBuffer();
    const filename = `${base}-${width}.webp`;
    generatedFiles.add(filename);
    const target = new URL(filename, output);
    const current = await readFile(target).catch(() => null);
    if (!current?.equals(bytes)) await writeFile(target, bytes);
    if (width === widths.at(-1)) optimizedBytes += bytes.byteLength;
  }
}
// Remove only obsolete derivatives owned by this script, inside its output folder.
for (const filename of await readdir(output)) {
  const match = /^(.*)-\d+\.webp$/.exec(filename);
  if (match && photoBases.has(match[1]) && !generatedFiles.has(filename)) {
    await unlink(new URL(filename, output));
  }
}
console.log(`Homepage photos: ${(originalBytes / 1024 / 1024).toFixed(2)} MB → ${(optimizedBytes / 1024 / 1024).toFixed(2)} MB (largest variants)`);
