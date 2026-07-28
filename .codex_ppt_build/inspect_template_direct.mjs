import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = process.argv[2];
const outDir = process.argv[3];

if (!source || !outDir) {
  console.error("Usage: node inspect_template_direct.mjs <source.pptx> <out-dir>");
  process.exit(1);
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, Buffer.from(await blob.arrayBuffer()));
}

await fs.mkdir(outDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const inspect = await presentation.inspect({
  kind: "deck,slide,textbox,shape,image,table,chart,notes,layout",
  include: "id,slide,name,title,textPreview,textChars,textLines,bbox,bboxUnit,isPlaceholder,alt,rows,cols,chartType,placeholders",
  maxChars: 50000,
});
await fs.writeFile(path.join(outDir, "template-inspect.ndjson"), inspect.ndjson, "utf8");

const manifest = {
  source,
  slideCount: presentation.slides.items.length,
  slides: [],
};

for (const [index, slide] of presentation.slides.items.entries()) {
  const num = String(index + 1).padStart(2, "0");
  const pngPath = path.join(outDir, `slide-${num}.png`);
  const layoutPath = path.join(outDir, `slide-${num}.layout.json`);
  await writeBlob(pngPath, await presentation.export({ slide, format: "png", scale: 1 }));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(layoutPath, await layout.text(), "utf8");
  manifest.slides.push({ slide: index + 1, pngPath, layoutPath });
}

await writeBlob(
  path.join(outDir, "template-montage.webp"),
  await presentation.export({ format: "webp", montage: true, scale: 1 }),
);
await fs.writeFile(path.join(outDir, "template-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify({ slideCount: manifest.slideCount, outDir }, null, 2));
