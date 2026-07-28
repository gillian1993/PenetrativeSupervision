import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const workspace = process.env.TMP_DIR || '.codex_tmp/ppt_product_intro';
const source = path.join(workspace, 'template_source.pptx');
const outDir = path.join(workspace, 'manual-template-inspect');
await fs.mkdir(outDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const inspect = await presentation.inspect({ kind: 'deck,slide,textbox,shape,image,table,chart,layout,notes', maxChars: 200000 });
await fs.writeFile(path.join(outDir, 'template-inspect.ndjson'), inspect.ndjson, 'utf8');
const montage = await presentation.export({ format: 'webp', montage: true, scale: 0.35 });
await fs.writeFile(path.join(outDir, 'template-montage.webp'), new Uint8Array(await montage.arrayBuffer()));
for (const [index, slide] of presentation.slides.items.entries()) {
  const n = String(index + 1).padStart(2, '0');
  const png = await presentation.export({ slide, format: 'png', scale: 0.6 });
  await fs.writeFile(path.join(outDir, `slide-${n}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(path.join(outDir, `slide-${n}.layout.json`), await layout.text(), 'utf8');
}
const slideSummaries = [];
for (const line of inspect.ndjson.split('\n')) {
  if (!line.trim()) continue;
  const obj = JSON.parse(line);
  if (obj.kind === 'slide') slideSummaries.push(obj);
}
await fs.writeFile(path.join(outDir, 'slide-summaries.json'), JSON.stringify(slideSummaries, null, 2), 'utf8');
console.log(JSON.stringify({ slides: presentation.slides.items.length, outDir }, null, 2));
