import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
const sourcePath = path.join(
  projectDir,
  "outputs",
  "穿透式监管产品PRD-v11.8-本体图谱节点模型对齐版.md",
);
const sectionPath = path.join(scriptDir, "prd_v11_9_scene_rule_section.md");
const outputPath = path.join(
  projectDir,
  "outputs",
  "穿透式监管产品PRD-v11.9-场景规则Skill功能对齐版.md",
);

const source = fs.readFileSync(sourcePath, "utf8");
const replacement = fs.readFileSync(sectionPath, "utf8").trimEnd();
const startMarker = "#### 10.3.4 场景与规则";
const endMarker = "#### 10.3.5 本体与图谱";
const startIndex = source.indexOf(startMarker);
const endIndex = source.indexOf(endMarker, startIndex);

if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
  throw new Error("未找到唯一且有效的 10.3.4 章节边界");
}

let output = `${source.slice(0, startIndex)}${replacement}\n\n${source.slice(endIndex)}`;

output = output
  .replace(
    "# 穿透式监管智能应用平台 PRD（v11.8 本体图谱节点模型对齐版）",
    "# 穿透式监管智能应用平台 PRD（v11.9 场景规则Skill功能对齐版）",
  )
  .replace(
    "| 当前版本 | v11.8 本体图谱节点模型对齐版 |",
    "| 当前版本 | v11.9 场景规则Skill功能对齐版 |",
  )
  .replace(
    "| --- | --- | --- | --- | --- | --- |\n",
    "| --- | --- | --- | --- | --- | --- |\n| 2026-07-23 | 按当前工程重写场景与规则章节，补充智能Skill资产、统一校验试跑发布、六类规则配置及多场景版本引用 | 对齐场景编排标准规则和智能Skill的最新页面、接口、状态流转与删除约束 | [TODO] | [TODO] | v11.9 |\n",
  );

if ((output.match(/^#### 10\.3\.4 场景与规则$/gm) ?? []).length !== 1) {
  throw new Error("生成结果中的 10.3.4 章节数量异常");
}

fs.writeFileSync(outputPath, output, "utf8");
console.log(outputPath);
