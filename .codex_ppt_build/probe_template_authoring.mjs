import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = "D:/中国电子云/PenetrativeSupervision/.codex_ppt_build/template-source.pptx";
const output = "D:/中国电子云/PenetrativeSupervision/.codex_ppt_build/probe-template-output.pptx";

const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
while (presentation.slides.items.length) {
  presentation.slides.items[0].delete();
}
const coverLayout = presentation.layouts.items[1];
const slide = presentation.slides.add();
slide.setLayout(coverLayout);
slide.placeholders.getItem("title").text = "穿透式监管智能应用平台";
slide.placeholders.getItem("body").text = "产品介绍";
const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(output);
console.log(output);
