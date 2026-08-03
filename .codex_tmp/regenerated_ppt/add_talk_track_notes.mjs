import fs from "node:fs/promises";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const inputPptx =
  "D:/中国电子云/PenetrativeSupervision/outputs/穿透式监管平台-电子云-矢量重绘版.pptx";
const talkTrackMd =
  "D:/中国电子云/PenetrativeSupervision/outputs/穿透式监管平台-电子云-逐页讲解话术.md";
const outputPptx =
  "D:/中国电子云/PenetrativeSupervision/outputs/穿透式监管平台-电子云-矢量重绘版-含讲解备注.pptx";

function parseTalkTrack(markdown) {
  const sections = new Map();
  const re = /^## 第\s*(\d+)\s*页：(.+)$/gm;
  const matches = [...markdown.matchAll(re)];

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const slideNumber = Number(current[1]);
    const title = current[2].trim();
    const start = current.index + current[0].length;
    const end = next ? next.index : markdown.length;
    const body = markdown.slice(start, end).trim();

    sections.set(slideNumber, {
      title,
      body: `【讲解话术】\n${title}\n\n${body}`,
    });
  }

  return sections;
}

async function main() {
  const markdown = await fs.readFile(talkTrackMd, "utf8");
  const sections = parseTalkTrack(markdown);
  const presentation = await PresentationFile.importPptx(
    await FileBlob.load(inputPptx),
  );

  for (let i = 0; i < presentation.slides.items.length; i += 1) {
    const slideNumber = i + 1;
    const section = sections.get(slideNumber);
    if (!section) {
      throw new Error(`Missing talk track for slide ${slideNumber}`);
    }

    const slide = presentation.slides.getItem(i);
    const existing = String(slide.speakerNotes.text || "").trim();
    const sourceStart = existing.indexOf("[Sources]");
    const sources = sourceStart >= 0 ? existing.slice(sourceStart).trim() : existing;
    const nextNotes = sources
      ? `${section.body}\n\n${sources}`
      : section.body;

    slide.speakerNotes.setText(nextNotes);
    slide.speakerNotes.setVisible(true);
  }

  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(outputPptx);
  console.log(JSON.stringify({ outputPptx, slides: presentation.slides.items.length }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
