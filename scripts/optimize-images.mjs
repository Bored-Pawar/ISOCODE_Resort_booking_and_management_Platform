// Idempotent: converts any PNG in public/images to JPG q80 (max 2000px wide), then removes the PNG.
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const dir = path.resolve("public/images");
const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".png"));
if (files.length === 0) console.log("No PNGs in public/images, nothing to do.");
for (const f of files) {
  const src = path.join(dir, f);
  const out = path.join(dir, f.replace(/\.png$/i, ".jpg"));
  await sharp(src)
    .resize({ width: 2000, withoutEnlargement: true })
    .flatten({ background: "#fff" })
    .jpeg({ quality: 80, progressive: true })
    .toFile(out);
  await unlink(src);
  console.log(`${f} -> ${path.basename(out)}`);
}
