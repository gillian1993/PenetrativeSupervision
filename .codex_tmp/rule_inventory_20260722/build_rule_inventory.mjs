import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const API_BASE = "http://127.0.0.1:4173";
const OUTPUT_DIR = "D:/中国电子云/PenetrativeSupervision/outputs/现有规则清单_20260722";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "现有规则领域场景阶段清单_20260722.xlsx");
const QA_DIR = "D:/中国电子云/PenetrativeSupervision/.codex_tmp/rule_inventory_20260722/qa";

async function getJson(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) throw new Error(`${endpoint} 请求失败：${response.status}`);
  return response.json();
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function unique(values) {
  return [...new Set(values.filter((value) => String(value ?? "").trim()).map((value) => String(value).trim()))];
}

function joinLines(values, fallback) {
  const cleaned = unique(values);
  return cleaned.length ? cleaned.join("\n") : fallback;
}

function normalizeStage(values) {
  const phases = new Set();
  for (const value of values) {
    for (const part of String(value ?? "").split(/[\/、,，;；]/)) {
      const phase = part.trim();
      if (["事前", "事中", "事后"].includes(phase)) phases.add(phase);
    }
  }
  return ["事前", "事中", "事后"].filter((phase) => phases.has(phase)).join("/") || "待确认";
}

function activationText(bindings) {
  if (!bindings.length) return "未绑定";
  const enabled = bindings.filter((binding) => binding.enabled).length;
  if (enabled === 0) return "全部禁用";
  if (enabled === bindings.length) return "全部启用";
  return `部分启用（${enabled}/${bindings.length}）`;
}

function setTitle(sheet, range, title, subtitle) {
  sheet.mergeCells(range);
  const titleCell = sheet.getRange(range.split(":")[0]);
  titleCell.values = [[title]];
  titleCell.format = {
    fill: "#143A5A",
    font: { name: "Microsoft YaHei", size: 16, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  titleCell.format.rowHeight = 34;

  const [start, end] = range.split(":");
  const startColumn = start.match(/[A-Z]+/)[0];
  const endColumn = end.match(/[A-Z]+/)[0];
  const subtitleRange = `${startColumn}2:${endColumn}2`;
  sheet.mergeCells(subtitleRange);
  const subtitleCell = sheet.getRange(`${startColumn}2`);
  subtitleCell.values = [[subtitle]];
  subtitleCell.format = {
    fill: "#EAF1F6",
    font: { name: "Microsoft YaHei", size: 9, color: "#3A556A" },
    horizontalAlignment: "left",
    verticalAlignment: "center",
    wrapText: true,
  };
  subtitleCell.format.rowHeight = 30;
}

function styleHeader(range) {
  range.format = {
    fill: "#1F5C83",
    font: { name: "Microsoft YaHei", size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#B8CAD6" },
  };
  range.format.rowHeight = 30;
}

function styleBody(range) {
  range.format = {
    font: { name: "Microsoft YaHei", size: 9, color: "#243746" },
    verticalAlignment: "center",
    wrapText: true,
    borders: {
      insideHorizontal: { style: "thin", color: "#DDE5EA" },
      bottom: { style: "thin", color: "#C9D5DD" },
    },
  };
  range.format.rowHeight = 36;
}

function colorStageCell(cell, stage) {
  if (stage === "待确认") {
    cell.format.fill = "#F3F4F6";
    cell.format.font = { name: "Microsoft YaHei", size: 9, bold: true, color: "#6B7280" };
    return;
  }
  if (stage.includes("事后")) {
    cell.format.fill = "#FCE8E6";
    cell.format.font = { name: "Microsoft YaHei", size: 9, bold: true, color: "#A63D32" };
  } else if (stage.includes("事中")) {
    cell.format.fill = "#FFF4D6";
    cell.format.font = { name: "Microsoft YaHei", size: 9, bold: true, color: "#8A5A00" };
  } else {
    cell.format.fill = "#E8F3FF";
    cell.format.font = { name: "Microsoft YaHei", size: 9, bold: true, color: "#1D5E9E" };
  }
  cell.format.horizontalAlignment = "center";
}

const [rules, sceneSummaries, patternSummaries] = await Promise.all([
  getJson("/api/rules?pageSize=500"),
  getJson("/api/scenes?pageSize=500"),
  getJson("/api/risk-patterns"),
]);

const [scenes, patterns] = await Promise.all([
  mapLimit(sceneSummaries, 6, (scene) => getJson(`/api/scenes/${encodeURIComponent(scene.code)}`)),
  mapLimit(patternSummaries, 8, (pattern) => getJson(`/api/risk-patterns/${encodeURIComponent(pattern.code)}`)),
]);

const sceneRuleMap = new Map();
for (const scene of scenes) {
  for (const rule of scene.rules ?? []) {
    const bindings = sceneRuleMap.get(rule.code) ?? [];
    bindings.push({
      sceneCode: scene.code,
      sceneName: scene.name,
      domain: scene.domain,
      stage: scene.objectScope?.stage ?? "",
      enabled: Boolean(rule.enabled),
    });
    sceneRuleMap.set(rule.code, bindings);
  }
}

const patternRuleMap = new Map();
const capabilityRows = [];
for (const pattern of patterns) {
  for (const rule of pattern.rules ?? []) {
    const mappings = patternRuleMap.get(rule.code) ?? [];
    mappings.push({
      category: pattern.category,
      patternCode: pattern.code,
      patternName: pattern.name,
      stage: pattern.stage,
      coverage: pattern.coverage_status,
      sourceType: pattern.source_type,
      sceneCodes: (pattern.scenes ?? []).map((scene) => scene.code),
      sceneNames: (pattern.scenes ?? []).map((scene) => scene.name),
    });
    patternRuleMap.set(rule.code, mappings);
  }
  for (const capability of pattern.capabilities ?? []) {
    capabilityRows.push({ pattern, capability });
  }
}

const inventory = rules.map((rule) => {
  const bindings = sceneRuleMap.get(rule.code) ?? [];
  const mappings = patternRuleMap.get(rule.code) ?? [];
  const fallbackSceneCodes = rule.sceneIds ?? [];
  const fallbackSceneNames = rule.sceneNames ?? [];
  const sceneCodes = bindings.length ? bindings.map((item) => item.sceneCode) : fallbackSceneCodes;
  const sceneNames = bindings.length ? bindings.map((item) => item.sceneName) : fallbackSceneNames;
  const stage = normalizeStage([
    ...mappings.map((item) => item.stage),
    ...bindings.map((item) => item.stage),
  ]);
  return {
    domain: rule.domain || joinLines(bindings.map((item) => item.domain), "待确认"),
    sceneNames: joinLines(sceneNames, "未绑定场景"),
    sceneCodes: joinLines(sceneCodes, "—"),
    stage,
    categories: joinLines(mappings.map((item) => item.category), "未绑定用户模式"),
    patternCodes: joinLines(mappings.map((item) => item.patternCode), "—"),
    patternNames: joinLines(mappings.map((item) => item.patternName), "未绑定用户模式"),
    ruleCode: rule.code,
    ruleName: rule.name,
    ruleType: rule.type,
    riskLevel: rule.level,
    status: rule.status,
    activation: activationText(bindings),
    coverage: joinLines(mappings.map((item) => item.coverage), "待确认"),
    sourceType: joinLines(mappings.map((item) => item.sourceType), "既有系统规则"),
    summary: rule.summary || "尚未生成规则摘要",
  };
}).sort((a, b) =>
  a.domain.localeCompare(b.domain, "zh-CN") ||
  a.sceneNames.localeCompare(b.sceneNames, "zh-CN") ||
  a.patternCodes.localeCompare(b.patternCodes, "zh-CN") ||
  a.ruleCode.localeCompare(b.ruleCode, "zh-CN")
);

const generatedAt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(new Date()).replaceAll("/", "-");

const workbook = Workbook.create();
const overview = workbook.worksheets.add("统计概览");
const detail = workbook.worksheets.add("规则清单");
const capabilitySheet = workbook.worksheets.add("智能能力");

// 规则清单
detail.showGridLines = false;
setTitle(
  detail,
  "A1:Q1",
  "现有规则领域—场景—阶段清单",
  `数据来源：当前运行服务连接的 MySQL 数据库；生成时间：${generatedAt}。监管阶段优先取用户模式配置，未纳入模式时取场景阶段；无配置显示“待确认”。`
);
detail.getRange("A4:Q4").merge();
detail.getRange("A4").values = [["说明：一行对应一项普通规则资产；同一规则关联多个场景或用户模式时，以单元格内换行展示。复合阶段（如事前/事中）表示该规则可在多个监管节点使用。"]];
detail.getRange("A4").format = {
  fill: "#FFF8E8",
  font: { name: "Microsoft YaHei", size: 9, color: "#7A5710" },
  wrapText: true,
  verticalAlignment: "center",
};
detail.getRange("A4").format.rowHeight = 28;

const detailHeaders = [[
  "序号", "领域", "风险场景", "场景编号", "事前/事中/事后", "用户模式类目", "用户模式编号", "用户模式名称",
  "原子规则编号", "原子规则名称", "规则类型", "风险等级", "规则状态", "启用情况", "建设/覆盖状态", "规则来源", "规则说明/摘要",
]];
detail.getRange("A6:Q6").values = detailHeaders;
styleHeader(detail.getRange("A6:Q6"));

const detailRows = inventory.map((item, index) => [
  index + 1,
  item.domain,
  item.sceneNames,
  item.sceneCodes,
  item.stage,
  item.categories,
  item.patternCodes,
  item.patternNames,
  item.ruleCode,
  item.ruleName,
  item.ruleType,
  item.riskLevel,
  item.status,
  item.activation,
  item.coverage,
  item.sourceType,
  item.summary,
]);
const detailStartRow = 7;
const detailEndRow = detailStartRow + detailRows.length - 1;
detail.getRange(`A${detailStartRow}:Q${detailEndRow}`).values = detailRows;
styleBody(detail.getRange(`A${detailStartRow}:Q${detailEndRow}`));
detail.getRange(`A${detailStartRow}:A${detailEndRow}`).format.horizontalAlignment = "center";
detail.getRange(`D${detailStartRow}:E${detailEndRow}`).format.horizontalAlignment = "center";
detail.getRange(`G${detailStartRow}:G${detailEndRow}`).format.horizontalAlignment = "center";
detail.getRange(`I${detailStartRow}:I${detailEndRow}`).format.horizontalAlignment = "center";
detail.getRange(`K${detailStartRow}:P${detailEndRow}`).format.horizontalAlignment = "center";
for (let row = detailStartRow; row <= detailEndRow; row++) {
  colorStageCell(detail.getRange(`E${row}`), inventory[row - detailStartRow].stage);
}
const detailTable = detail.tables.add(`A6:Q${detailEndRow}`, true, "RuleInventoryTable");
detailTable.style = "TableStyleMedium2";
detailTable.showFilterButton = true;
detailTable.showBandedRows = true;
detail.getRange("A:A").format.columnWidth = 6;
detail.getRange("B:B").format.columnWidth = 14;
detail.getRange("C:C").format.columnWidth = 24;
detail.getRange("D:D").format.columnWidth = 23;
detail.getRange("E:E").format.columnWidth = 14;
detail.getRange("F:F").format.columnWidth = 23;
detail.getRange("G:G").format.columnWidth = 15;
detail.getRange("H:H").format.columnWidth = 28;
detail.getRange("I:I").format.columnWidth = 22;
detail.getRange("J:J").format.columnWidth = 31;
detail.getRange("K:K").format.columnWidth = 13;
detail.getRange("L:L").format.columnWidth = 11;
detail.getRange("M:M").format.columnWidth = 11;
detail.getRange("N:N").format.columnWidth = 16;
detail.getRange("O:O").format.columnWidth = 19;
detail.getRange("P:P").format.columnWidth = 16;
detail.getRange("Q:Q").format.columnWidth = 48;
detail.freezePanes.freezeRows(6);
detail.freezePanes.freezeColumns(2);

// 智能能力
capabilitySheet.showGridLines = false;
setTitle(
  capabilitySheet,
  "A1:O1",
  "智能能力清单（不进入普通规则引擎）",
  `数据来源：当前运行服务连接的 MySQL 数据库；生成时间：${generatedAt}。M101、M102 等能力单独展示，不计入普通规则资产总数。`
);
const capabilityHeaders = [[
  "序号", "领域", "风险场景", "场景编号", "事前/事中/事后", "模式类目", "用户模式编号", "用户模式名称",
  "能力编号", "能力名称", "风险等级", "状态", "启用情况", "建设/覆盖状态", "能力说明",
]];
capabilitySheet.getRange("A6:O6").values = capabilityHeaders;
styleHeader(capabilitySheet.getRange("A6:O6"));

const capabilityData = capabilityRows.map(({ pattern, capability }, index) => [
  index + 1,
  joinLines((pattern.scenes ?? []).map((scene) => scenes.find((item) => item.code === scene.code)?.domain), "采购/合同"),
  joinLines((pattern.scenes ?? []).map((scene) => scene.name), "未绑定场景"),
  joinLines((pattern.scenes ?? []).map((scene) => scene.code), "—"),
  normalizeStage([pattern.stage]),
  pattern.category,
  pattern.code,
  pattern.name,
  capability.code,
  capability.name,
  pattern.risk_level,
  capability.status,
  capability.enabled ? "已启用" : "未启用",
  pattern.coverage_status,
  pattern.description,
]);
const capabilityEndRow = 6 + capabilityData.length;
if (capabilityData.length) {
  capabilitySheet.getRange(`A7:O${capabilityEndRow}`).values = capabilityData;
  styleBody(capabilitySheet.getRange(`A7:O${capabilityEndRow}`));
  for (let row = 7; row <= capabilityEndRow; row++) colorStageCell(capabilitySheet.getRange(`E${row}`), capabilityData[row - 7][4]);
  const capabilityTable = capabilitySheet.tables.add(`A6:O${capabilityEndRow}`, true, "CapabilityInventoryTable");
  capabilityTable.style = "TableStyleMedium2";
  capabilityTable.showFilterButton = true;
}
capabilitySheet.getRange("A:A").format.columnWidth = 6;
capabilitySheet.getRange("B:B").format.columnWidth = 14;
capabilitySheet.getRange("C:C").format.columnWidth = 24;
capabilitySheet.getRange("D:D").format.columnWidth = 22;
capabilitySheet.getRange("E:E").format.columnWidth = 14;
capabilitySheet.getRange("F:F").format.columnWidth = 20;
capabilitySheet.getRange("G:G").format.columnWidth = 15;
capabilitySheet.getRange("H:H").format.columnWidth = 28;
capabilitySheet.getRange("I:I").format.columnWidth = 20;
capabilitySheet.getRange("J:J").format.columnWidth = 28;
capabilitySheet.getRange("K:N").format.columnWidth = 15;
capabilitySheet.getRange("O:O").format.columnWidth = 48;
capabilitySheet.freezePanes.freezeRows(6);
capabilitySheet.freezePanes.freezeColumns(2);

// 统计概览
overview.showGridLines = false;
setTitle(
  overview,
  "A1:J1",
  "现有规则统计概览",
  `口径：普通规则资产按规则编号去重；智能能力单列；数据截至 ${generatedAt}，来自当前服务连接的 MySQL 数据库。`
);

const cards = [
  { range: "A4:B4", valueRange: "A5:B6", label: "普通规则资产", formula: `=COUNTA('规则清单'!$I$${detailStartRow}:$I$${detailEndRow})`, fill: "#E8F3FF", color: "#1D5E9E" },
  { range: "C4:D4", valueRange: "C5:D6", label: "智能能力", formula: `=COUNTA('智能能力'!$I$7:$I$${capabilityEndRow})`, fill: "#E8F6F0", color: "#187052" },
  { range: "E4:F4", valueRange: "E5:F6", label: "已绑定场景规则", formula: `=COUNTIF('规则清单'!$C$${detailStartRow}:$C$${detailEndRow},"<>未绑定场景")`, fill: "#FFF4D6", color: "#8A5A00" },
  { range: "G4:H4", valueRange: "G5:H6", label: "已纳入用户模式", formula: `=COUNTIF('规则清单'!$H$${detailStartRow}:$H$${detailEndRow},"<>未绑定用户模式")`, fill: "#F0EAFE", color: "#6D45A6" },
  { range: "I4:J4", valueRange: "I5:J6", label: "阶段待确认", formula: `=COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"待确认")`, fill: "#F3F4F6", color: "#5C6670" },
];
for (const card of cards) {
  overview.mergeCells(card.range);
  overview.mergeCells(card.valueRange);
  const labelCell = overview.getRange(card.range.split(":")[0]);
  labelCell.values = [[card.label]];
  labelCell.format = {
    fill: card.fill,
    font: { name: "Microsoft YaHei", size: 10, bold: true, color: card.color },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: "#CAD7DF" },
  };
  const valueCell = overview.getRange(card.valueRange.split(":")[0]);
  valueCell.formulas = [[card.formula]];
  valueCell.format = {
    fill: "#FFFFFF",
    font: { name: "Microsoft YaHei", size: 22, bold: true, color: card.color },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: "#CAD7DF" },
    numberFormat: "#,##0",
  };
}

overview.getRange("A9:B9").values = [["阶段覆盖", "规则数"]];
overview.getRange("D9:E9").values = [["领域", "规则数"]];
overview.getRange("G9:H9").values = [["规则启用情况", "规则数"]];
styleHeader(overview.getRange("A9:B9"));
styleHeader(overview.getRange("D9:E9"));
styleHeader(overview.getRange("G9:H9"));

const stageCoverage = ["事前", "事中", "事后", "待确认"];
overview.getRange("A10:A13").values = stageCoverage.map((item) => [item]);
overview.getRange("B10").formulas = [[`=COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事前")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事前/事中")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事前/事后")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事前/事中/事后")`]];
overview.getRange("B11").formulas = [[`=COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事中")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事前/事中")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事中/事后")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事前/事中/事后")`]];
overview.getRange("B12").formulas = [[`=COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事后")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事前/事后")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事中/事后")+COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"事前/事中/事后")`]];
overview.getRange("B13").formulas = [[`=COUNTIF('规则清单'!$E$${detailStartRow}:$E$${detailEndRow},"待确认")`]];
styleBody(overview.getRange("A10:B13"));
for (let row = 10; row <= 13; row++) colorStageCell(overview.getRange(`A${row}`), overview.getRange(`A${row}`).values[0][0]);

const domains = unique(inventory.map((item) => item.domain)).sort((a, b) => a.localeCompare(b, "zh-CN"));
const domainEndRow = 9 + domains.length;
overview.getRange(`D10:D${domainEndRow}`).values = domains.map((item) => [item]);
overview.getRange(`E10:E${domainEndRow}`).formulas = domains.map((_, index) => [
  `=COUNTIF('规则清单'!$B$${detailStartRow}:$B$${detailEndRow},D${10 + index})`,
]);
styleBody(overview.getRange(`D10:E${domainEndRow}`));

const activationCategories = ["全部启用", "部分启用", "全部禁用", "未绑定"];
overview.getRange("G10:G13").values = activationCategories.map((item) => [item]);
overview.getRange("H10").formulas = [[`=COUNTIF('规则清单'!$N$${detailStartRow}:$N$${detailEndRow},"全部启用")`]];
overview.getRange("H11").formulas = [[`=COUNTIF('规则清单'!$N$${detailStartRow}:$N$${detailEndRow},"部分启用*")`]];
overview.getRange("H12").formulas = [[`=COUNTIF('规则清单'!$N$${detailStartRow}:$N$${detailEndRow},"全部禁用")`]];
overview.getRange("H13").formulas = [[`=COUNTIF('规则清单'!$N$${detailStartRow}:$N$${detailEndRow},"未绑定")`]];
styleBody(overview.getRange("G10:H13"));

overview.mergeCells("A16:J16");
overview.getRange("A16").values = [["口径说明"]];
overview.getRange("A16").format = {
  fill: "#143A5A",
  font: { name: "Microsoft YaHei", size: 11, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "left",
  verticalAlignment: "center",
};
overview.mergeCells("A17:J20");
overview.getRange("A17").values = [[
  "1. “事前/事中/事后”按用户模式阶段与场景阶段合并归类，复合阶段会在阶段覆盖统计中重复计数。\n" +
  "2. “全部禁用”表示该规则已经绑定场景，但当前所有场景绑定均未启用；“未绑定”表示规则资产尚未关联风险场景。\n" +
  "3. 用户模式编号（101、A01、B01等）与原子规则编号（RULE-101-01等）分列保留；共享规则会同时列出多个用户模式。\n" +
  "4. M101、M102 属于智能能力，不进入普通规则引擎，因此在“智能能力”工作表单独展示。"
]];
overview.getRange("A17").format = {
  fill: "#F7F9FB",
  font: { name: "Microsoft YaHei", size: 9, color: "#3F5363" },
  verticalAlignment: "top",
  wrapText: true,
  borders: { preset: "outside", style: "thin", color: "#CAD7DF" },
};
overview.getRange("A17").format.rowHeight = 78;
for (const column of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]) overview.getRange(`${column}:${column}`).format.columnWidth = 13;
overview.freezePanes.freezeRows(2);

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(QA_DIR, { recursive: true });

const checks = {};
checks.overview = (await workbook.inspect({ kind: "table", range: "统计概览!A1:J20", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 10 })).ndjson;
checks.detail = (await workbook.inspect({ kind: "table", range: `规则清单!A1:Q${Math.min(detailEndRow, 16)}`, include: "values,formulas", tableMaxRows: 16, tableMaxCols: 17 })).ndjson;
checks.capabilities = (await workbook.inspect({ kind: "table", range: `智能能力!A1:O${Math.max(8, capabilityEndRow)}`, include: "values,formulas", tableMaxRows: 12, tableMaxCols: 15 })).ndjson;
checks.errors = (await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" })).ndjson;
await fs.writeFile(path.join(QA_DIR, "inspect.json"), JSON.stringify(checks, null, 2), "utf8");

for (const [sheetName, range, fileName] of [
  ["统计概览", "A1:J20", "overview.png"],
  ["规则清单", `A1:Q${Math.min(detailEndRow, 24)}`, "rules.png"],
  ["智能能力", `A1:O${Math.max(9, capabilityEndRow)}`, "capabilities.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(QA_DIR, fileName), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(OUTPUT_FILE);

console.log(JSON.stringify({
  output: OUTPUT_FILE,
  generatedAt,
  ruleCount: inventory.length,
  sceneCount: scenes.length,
  patternCount: patterns.length,
  capabilityCount: capabilityRows.length,
  patternMappedRuleCount: inventory.filter((item) => item.patternCodes !== "—").length,
  unboundSceneRuleCount: inventory.filter((item) => item.sceneNames === "未绑定场景").length,
  pendingStageCount: inventory.filter((item) => item.stage === "待确认").length,
}, null, 2));
