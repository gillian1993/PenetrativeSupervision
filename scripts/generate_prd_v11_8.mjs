import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
const sourcePath = path.join(
  projectDir,
  "outputs",
  "穿透式监管产品PRD-v11.7-工程功能对齐应用操作版.md",
);
const sectionPath = path.join(scriptDir, "prd_v11_8_ontology_graph_section.md");
const outputPath = path.join(
  projectDir,
  "outputs",
  "穿透式监管产品PRD-v11.8-本体图谱节点模型对齐版.md",
);

const source = fs.readFileSync(sourcePath, "utf8");
const replacement = fs.readFileSync(sectionPath, "utf8").trimEnd();
const startMarker = "#### 10.3.5 本体与图谱";
const endMarker = "#### 10.3.6 系统管理";
const startIndex = source.indexOf(startMarker);
const endIndex = source.indexOf(endMarker, startIndex);

if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
  throw new Error("未找到唯一且有效的 10.3.5 章节边界");
}

let output = `${source.slice(0, startIndex)}${replacement}\n\n${source.slice(endIndex)}`;

output = output
  .replace(
    "# 穿透式监管智能应用平台 PRD（v11.7 工程功能对齐应用操作版）",
    "# 穿透式监管智能应用平台 PRD（v11.8 本体图谱节点模型对齐版）",
  )
  .replace("| PRD提交日期 | 2026-07-22 |", "| PRD提交日期 | 2026-07-23 |")
  .replace(
    "| 当前版本 | v11.7 工程功能对齐应用操作版 |",
    "| 当前版本 | v11.8 本体图谱节点模型对齐版 |",
  )
  .replace(
    "| --- | --- | --- | --- | --- | --- |\n",
    "| --- | --- | --- | --- | --- | --- |\n| 2026-07-23 | 按当前工程更新本体与图谱章节，统一类/属性/关系本体模型、节点实例/关系映射模型及节点/关系统计口径 | 对齐事件映射节点化、数据源与图谱删除约束、当前活动页面及服务端状态规则 | [TODO] | [TODO] | v11.8 |\n",
  );

if ((output.match(/^#### 10\.3\.5 本体与图谱$/gm) ?? []).length !== 1) {
  throw new Error("生成结果中的 10.3.5 章节数量异常");
}

fs.writeFileSync(outputPath, output, "utf8");
console.log(outputPath);
