import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const inputPptx = "D:/中国电子云/PenetrativeSupervision/outputs/穿透式监管平台-电子云-核心功能体系重构版-话术增强版.pptx";
const outDir = "D:/中国电子云/PenetrativeSupervision/.codex_tmp/regenerated_ppt/enhanced_notes_render";

async function writeBlob(filePath, blob) { await fs.mkdir(path.dirname(filePath), { recursive: true }); await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer())); }
async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const presentation = await PresentationFile.importPptx(await FileBlob.load(inputPptx));
  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = "slide-" + String(index + 1).padStart(2, "0");
    await writeBlob(outDir + "/" + stem + ".png", await presentation.export({ slide, format: "png", scale: 1 }));
  }
  const inspect = await presentation.inspect({ kind: "slide,notes", maxChars: 240000 });
  await fs.writeFile(outDir + "/inspect.ndjson", inspect.ndjson, "utf8");
  console.log(JSON.stringify({ slides: presentation.slides.items.length, outDir }));
}

main().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
