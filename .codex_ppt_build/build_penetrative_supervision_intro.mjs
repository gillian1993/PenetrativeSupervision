import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const SOURCE_PPTX = "D:/中国电子云/PenetrativeSupervision/.codex_ppt_build/template-source.pptx";
const FINAL_PPTX = "D:/中国电子云/PenetrativeSupervision/outputs/穿透式监管智能应用平台产品介绍.pptx";
const OUT_DIR = "D:/中国电子云/PenetrativeSupervision/.codex_ppt_build/final-render";

const W = 1280;
const H = 720;
const C = {
  blue: "#176DFF",
  blueDark: "#0B3F91",
  cyan: "#16B7D8",
  green: "#16A36A",
  orange: "#F59E0B",
  red: "#D92D20",
  slate: "#1D2939",
  muted: "#667085",
  line: "#D8E5F8",
  pale: "#F4F8FF",
  white: "#FFFFFF",
};

const presentation = Presentation.create({ slideSize: { width: W, height: H } });
const L = { cover: "cover", toc: "toc", section: "section", light: "light", dark: "dark", end: "end", content: "content" };

function fillPlaceholders() {}

function note(slide, extra = "") {
  const sources = [
    "[Sources]",
    "内容来源：当前工程 D:/中国电子云/PenetrativeSupervision/src/App.tsx",
    "内容来源：当前工程 D:/中国电子云/PenetrativeSupervision/src/pages/*.tsx",
    "视觉参考：D:/中国电子云/PPT模版规范 20260202.pptx",
    extra,
  ].filter(Boolean).join("\n");
  try { slide.speakerNotes.setText(sources); } catch {}
}

function addSlide(_layout, title, subtitle = "") {
  const slide = presentation.slides.add();
  slide.background.fill = C.white;
  shape(slide, 0, 0, W, 88, "#F4F8FF", "none", "rect");
  shape(slide, 0, 88, W, 2, C.blue, C.blue, "rect");
  text(slide, 72, 28, 820, 44, title, { size: 34, bold: true, color: C.blueDark });
  if (subtitle) text(slide, 72, 94, 960, 34, subtitle, { size: 19, color: C.muted });
  text(slide, 1056, 34, 150, 24, "中国电子云", { size: 18, bold: true, color: C.blueDark, align: "right" });
  note(slide);
  return slide;
}
function shape(slide, x, y, w, h, fill = "none", line = "none", geometry = "roundRect") {
  return slide.shapes.add({
    geometry,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: line === "none" ? 0 : 1 },
    borderRadius: "rounded-lg",
  });
}

function text(slide, x, y, w, h, value, opts = {}) {
  const s = shape(slide, x, y, w, h, opts.fill ?? "none", opts.line ?? "none", opts.geometry ?? "rect");
  s.text = value;
  s.text.fontSize = opts.size ?? 20;
  s.text.color = opts.color ?? C.slate;
  s.text.bold = Boolean(opts.bold);
  s.text.alignment = opts.align ?? "left";
  s.text.verticalAlignment = opts.valign ?? "top";
  s.text.insets = opts.insets ?? { left: 8, right: 8, top: 5, bottom: 5 };
  return s;
}

function pill(slide, x, y, w, h, value, fill = C.pale, color = C.blueDark) {
  return text(slide, x, y, w, h, value, { size: 17, bold: true, color, fill, line: C.line, align: "center", valign: "mid" });
}

function card(slide, x, y, w, h, title, body, tone = C.blue) {
  const base = shape(slide, x, y, w, h, C.white, C.line);
  shape(slide, x, y, 8, h, tone, tone, "rect");
  text(slide, x + 22, y + 18, w - 40, 30, title, { size: 22, bold: true, color: C.slate });
  text(slide, x + 22, y + 58, w - 42, h - 72, body, { size: 17, color: C.muted });
  return base;
}

function metric(slide, x, y, w, h, label, value, tone = C.blue) {
  shape(slide, x, y, w, h, "#F8FBFF", C.line);
  text(slide, x + 18, y + 16, w - 36, 28, label, { size: 17, color: C.muted });
  text(slide, x + 18, y + 48, w - 36, 42, value, { size: 30, bold: true, color: tone });
}

function connect(slide, from, to, opts = {}) {
  return slide.shapes.connect(from, to, {
    kind: opts.kind ?? "straight",
    fromSide: opts.fromSide ?? "right",
    toSide: opts.toSide ?? "left",
    line: { style: opts.dashed ? "dashed" : "solid", fill: opts.color ?? C.blue, width: opts.width ?? 2 },
    head: { type: "arrow", width: "med", length: "med" },
  });
}

function headerBand(slide, label) {
  text(slide, 72, 626, 620, 28, label, { size: 15, color: C.muted });
}

// 1 Cover
{
  const slide = presentation.slides.add();
  slide.background.fill = C.blueDark;
  shape(slide, 0, 0, W, H, C.blueDark, "none", "rect");
  shape(slide, 880, -40, 420, 820, "#0D55C7", "none", "rect");
  shape(slide, 1040, 0, 240, H, "#1287FF", "none", "rect");
  text(slide, 92, 76, 300, 30, "中国电子云", { size: 22, bold: true, color: C.white });
  text(slide, 92, 218, 760, 96, "穿透式监管智能应用平台", { size: 52, bold: true, color: C.white });
  text(slide, 96, 334, 760, 44, "产品介绍", { size: 32, bold: true, color: "#BFD9FF" });
  text(slide, 96, 438, 820, 72, "面向集团型组织的全级次、全链条、全过程、全要素监管能力底座", { size: 26, color: C.white, bold: true, fill: "none" });
  pill(slide, 96, 544, 178, 40, "采购应用协同", "#EAF2FF", C.blueDark);
  pill(slide, 294, 544, 178, 40, "风险闭环处置", "#EAF8F4", C.green);
  pill(slide, 492, 544, 178, 40, "知识图谱穿透", "#FFF7E8", C.orange);
  text(slide, 96, 634, 360, 24, "2026", { size: 18, color: "#D7E8FF" });
  note(slide);
}

// 2 Contents
{
  const slide = addSlide(L.toc, "汇报目录", "五个章节从监管目标、产品方案、核心能力、典型场景到建设价值递进展开");
  const items = [
    ["01", "监管要求与建设目标", "把监管边界讲清楚：组织、业务、时间与对象如何穿透。"],
    ["02", "产品定位与总体方案", "说明平台在采购应用和集团监管之间承担什么角色。"],
    ["03", "核心能力体系", "展开数据、图谱、规则、预警、闭环和智能体能力。"],
    ["04", "典型监管场景", "用采购、合同、资金、投资等场景说明落地方式。"],
    ["05", "建设路径与应用价值", "用客户视角说明先建什么、解决什么、带来什么价值。"],
  ];
  items.forEach((item, i) => {
    const y = 168 + i * 82;
    shape(slide, 88, y - 6, 1060, 62, i % 2 ? "#FFFFFF" : "#F8FBFF", C.line, "roundRect");
    text(slide, 116, y, 70, 42, item[0], { size: 28, bold: true, color: C.blue });
    text(slide, 206, y - 2, 360, 32, item[1], { size: 24, bold: true, color: C.slate });
    text(slide, 586, y + 2, 520, 30, item[2], { size: 17, color: C.muted });
  });
  note(slide);
}
function section(no, title, subtitle) {
  const slide = presentation.slides.add();
  slide.background.fill = C.blueDark;
  shape(slide, 0, 0, W, H, C.blueDark, "none", "rect");
  shape(slide, 0, 0, 360, H, "#0D55C7", "none", "rect");
  shape(slide, 950, 0, 330, H, "#F4F8FF", "none", "rect");
  text(slide, 92, 138, 230, 100, no, { size: 74, bold: true, color: "#BFD9FF" });
  text(slide, 92, 278, 760, 82, title, { size: 46, bold: true, color: C.white });
  text(slide, 92, 408, 760, 54, subtitle, { size: 26, bold: true, color: "#D7E8FF" });
  shape(slide, 92, 504, 200, 5, C.cyan, C.cyan, "rect");
  text(slide, 1056, 626, 150, 24, "中国电子云", { size: 18, bold: true, color: C.blueDark, align: "right" });
  note(slide);
}

section("01", "监管要求与建设目标", "从“看得到”走向“穿得透、管得住、能闭环”");

// 4
{
  const slide = addSlide(L.light, "监管难点不是缺少系统，而是缺少跨层级、跨业务的统一监管视图", "集团监管需要同时回答对象在哪里、风险怎么来、责任如何落、整改是否闭环");
  const pains = [
    ["组织层级长", "总部、二级单位、基层企业和项目账户分散，风险对象难以一次性定位。", C.blue],
    ["业务链条断", "投资、采购、合同、财务、司库、人事和资产数据分布在多系统，证据链拼接成本高。", C.orange],
    ["处置节奏慢", "事前校验、事中监测、事后整改复核割裂，容易形成发现晚、流转慢、复盘弱。", C.red],
    ["责任边界虚", "主体、资金、合同、资产、人员、规则、证据和责任没有统一关系表达。", C.green],
  ];
  pains.forEach((p, i) => card(slide, 80 + i * 292, 210, 260, 250, p[0], p[1], p[2]));
  headerBand(slide, "痛点收敛：监管对象、证据链、处置链、责任链需要在同一平台内贯通。");
}

// 5
{
  const slide = addSlide(L.light, "建设目标用一页讲清楚：四类穿透共同限定监管边界", "四类穿透不是四套系统，而是同一监管能力覆盖的四个维度");
  const center = shape(slide, 500, 250, 280, 136, C.blueDark, C.blueDark);
  text(slide, 520, 278, 240, 80, "穿透式监管\n统一能力底座", { size: 30, bold: true, color: C.white, align: "center", valign: "mid" });
  const nodes = [
    ["全级次", "纵向覆盖集团总部、二级单位、基层企业，以及项目、账户、人员等末梢对象。", 98, 162, C.blue],
    ["全链条", "横向打通投资、采购、合同、财务、司库、人事、资产等业务链路。", 888, 162, C.green],
    ["全过程", "覆盖事前规则校验、事中异常监测、事后整改复核与运营复盘。", 98, 428, C.orange],
    ["全要素", "穿透主体、资金、合同、资产、人员、规则、证据和责任等监管要素。", 888, 428, C.cyan],
  ];
  nodes.forEach((n) => {
    const box = card(slide, n[2], n[3], 294, 120, n[0], n[1], n[4]);
    connect(slide, box, center, { fromSide: n[2] < 500 ? "right" : "left", toSide: n[2] < 500 ? "left" : "right", color: n[4] });
  });
}

section("02", "产品定位与总体方案", "以采购应用为入口，以监管能力为主线，以知识图谱和规则引擎为支撑");

// 7
{
  const slide = addSlide(L.light, "产品定位：面向集团监管的一体化智能应用平台", "平台不是单点报表工具，而是把业务办理、风险识别、证据研判和整改闭环放在一条链路里");
  card(slide, 90, 190, 330, 290, "业务应用入口", "采购应用总览、招投标、合同、审查、采购等页面承接业务人员日常任务，支持资料上传、智能生成、智能审查和结果确认。", C.blue);
  card(slide, 475, 190, 330, 290, "监管工作主线", "监管工作台、监管态势、统一预警和风险事件形成监管人员的日常入口，支持待办、研判、转派、整改、复核和关闭。", C.green);
  card(slide, 860, 190, 330, 290, "能力配置底座", "场景与规则、Skill管理、知识图谱、数据源、模型管理和权限审计支撑监管规则可配置、可复用、可追溯。", C.orange);
  headerBand(slide, "定位表达：业务应用产生对象与材料，监管应用发现风险并闭环，底座能力让规则和证据可持续运营。");
}

// 8 architecture
{
  const slide = addSlide(L.light, "总体方案：数据、图谱、规则、智能体和闭环应用协同运转", "从多源数据接入开始，形成可被规则和智能能力引用的监管证据网络");
  const layers = [
    ["业务与外部数据", ["ERP采购视图", "OA审批事件", "司库支付消息", "工商司法数据"], 70, 190, C.blue],
    ["数据源与映射", ["连接测试", "元数据解析", "语义映射", "同步批次"], 330, 190, C.cyan],
    ["知识图谱", ["图谱结构", "字段映射", "节点关系", "版本发布"], 590, 190, C.green],
    ["场景规则", ["风险场景", "标准规则", "智能Skill", "统一试跑"], 850, 190, C.orange],
    ["监管应用", ["工作台", "态势分析", "统一预警", "风险事件"], 1110, 190, C.red],
  ];
  const boxes = layers.map((l) => {
    const b = shape(slide, l[2], l[3], 170, 300, C.white, C.line);
    text(slide, l[2] + 14, l[3] + 18, 142, 30, l[0], { size: 21, bold: true, color: l[4], align: "center" });
    l[1].forEach((v, i) => pill(slide, l[2] + 18, l[3] + 70 + i * 48, 134, 34, v, "#F8FBFF", C.slate));
    return b;
  });
  for (let i = 0; i < boxes.length - 1; i++) connect(slide, boxes[i], boxes[i + 1], { color: C.blue, width: 2 });
  text(slide, 170, 540, 950, 46, "统一权限、操作审计、模型管理贯穿全链路，确保可授权、可追溯、可扩展。", { size: 23, bold: true, color: C.blueDark, align: "center" });
}

// 9 workflow
{
  const slide = addSlide(L.light, "监管闭环流程：从风险发现到整改复核形成同一工作流", "流程图仅表达用户可感知的主干链路，配置侧变化会回到校验和试跑");
  const steps = [
    ["配置数据源", "登记、测试、解析、映射"],
    ["生成知识图谱", "选择结构与数据源，固化映射快照"],
    ["编排风险场景", "引用标准规则和智能Skill"],
    ["校验并试跑", "检查依赖、样本运行、固化结果"],
    ["发布场景", "锁定版本，进入运行"],
    ["生成预警", "形成证据子图和风险说明"],
    ["升级事件", "派发整改、跟踪时限"],
    ["复核关闭", "沉淀审计和效果样本"],
  ];
  let prev = null;
  const boxes = [];
  steps.forEach((s, i) => {
    const x = 72 + (i % 4) * 292;
    const y = i < 4 ? 190 : 400;
    const box = card(slide, x, y, 238, 94, `${i + 1}. ${s[0]}`, s[1], i < 4 ? C.blue : C.green);
    if (prev) connect(slide, prev, box, { color: i === 4 ? C.green : C.blue, fromSide: i === 4 ? "bottom" : "right", toSide: i === 4 ? "top" : "left", kind: i === 4 ? "elbow" : "straight" });
    boxes.push(box);
    prev = box;
  });
  const feedback = shape(slide, 1022, 516, 140, 46, "#FFF8EA", C.orange);
  text(slide, 1032, 526, 120, 24, "规则优化", { size: 18, bold: true, color: C.orange, align: "center" });
  connect(slide, feedback, boxes[2], { color: C.orange, dashed: true, fromSide: "left", toSide: "bottom", kind: "elbow" });
  text(slide, 310, 548, 650, 36, "处置与复盘结果反向沉淀为场景优化、规则调整和Skill迭代。", { size: 21, bold: true, color: C.orange, align: "center" });
}

section("03", "核心能力体系", "把“能看见风险”升级为“能解释证据、能推动整改、能持续优化”");

// 11 capability map
{
  const slide = addSlide(L.light, "核心能力体系围绕六个能力组展开", "每个能力组对应当前工程中的真实页面或配置对象");
  const caps = [
    ["监管工作台", "待办、消息、刷新、转派联动", C.blue],
    ["监管态势", "风险规模、等级分布、趋势下钻", C.cyan],
    ["风险监管", "统一预警、证据研判、事件闭环", C.red],
    ["场景与规则", "风险场景、规则资产、Skill资产", C.orange],
    ["知识图谱", "图谱结构、数据源、映射与发布", C.green],
    ["系统底座", "角色权限、模型管理、审计日志", C.blueDark],
  ];
  caps.forEach((c, i) => {
    const x = 98 + (i % 3) * 365;
    const y = i < 3 ? 190 : 390;
    card(slide, x, y, 310, 130, c[0], c[1], c[2]);
  });
}

// 12 data graph
{
  const slide = addSlide(L.light, "知识图谱以图谱结构、数据源、映射模板和图谱版本组织能力", "对外统一表达为知识图谱能力，让结构定义、数据接入和版本发布更容易被业务方理解");
  const a = card(slide, 92, 210, 230, 140, "图谱结构", "维护类、属性、关系等结构定义；发布后供规则和图谱版本引用。", C.blue);
  const b = card(slide, 382, 210, 230, 140, "数据源", "登记业务系统、接口或消息源，完成连接测试、元数据解析和启停管理。", C.cyan);
  const c = card(slide, 672, 210, 230, 140, "映射模板", "按数据源 + 图谱结构维护节点实例映射和关系映射，并进行校验。", C.orange);
  const d = card(slide, 962, 210, 230, 140, "图谱版本", "选择结构和数据源生成可发布版本，固化结构、数据源和映射快照。", C.green);
  connect(slide, a, c, { color: C.blue });
  connect(slide, b, c, { color: C.cyan });
  connect(slide, c, d, { color: C.green });
  metric(slide, 160, 438, 210, 96, "图谱示例", "节点 / 关系", C.blue);
  metric(slide, 420, 438, 210, 96, "运行依赖", "发布版本", C.green);
  metric(slide, 680, 438, 210, 96, "映射状态", "ready优先", C.orange);
  metric(slide, 940, 438, 210, 96, "规则引用", "只选已发布", C.red);
}

// 13 scenes rules skill
{
  const slide = addSlide(L.light, "场景与规则用“场景版本”统一发布标准规则和智能Skill", "规则和Skill是独立资产，但最终由风险场景完成校验、试跑和发布锁定");
  const scene = shape(slide, 500, 248, 280, 136, C.blueDark, C.blueDark);
  text(slide, 522, 280, 236, 70, "风险场景版本\n统一发布单元", { size: 28, bold: true, color: C.white, align: "center", valign: "mid" });
  const rule = card(slide, 90, 190, 310, 150, "标准规则", "属性、字段比对、关系路径、时序、聚合、高级表达式等确定性判断。", C.blue);
  const skill = card(slide, 90, 400, 310, 150, "智能Skill", "根据审查需求生成审查内容、审查要求和输出结果，运行时自动获取上下文。", C.orange);
  const run = card(slide, 880, 250, 310, 180, "统一试跑与发布", "同一场景内同时运行规则和Skill，结果通过后发布不可变版本，生成预警、证据和审计记录。", C.green);
  connect(slide, rule, scene, { color: C.blue });
  connect(slide, skill, scene, { color: C.orange });
  connect(slide, scene, run, { color: C.green });
}

// 14 warning event closure
{
  const slide = addSlide(L.light, "风险监管把预警研判和事件整改放入同一闭环", "监管人员不只看到风险，还能看到证据、制度依据、责任人和处置进展");
  const laneY = [200, 310, 420];
  ["预警研判", "事件整改", "监管复核"].forEach((v, i) => {
    text(slide, 78, laneY[i] + 18, 110, 32, v, { size: 21, bold: true, color: [C.blue, C.orange, C.green][i] });
    shape(slide, 205, laneY[i], 960, 1, [C.blue, C.orange, C.green][i], [C.blue, C.orange, C.green][i], "rect");
  });
  const w1 = card(slide, 225, 178, 210, 88, "统一预警", "筛选事前、事中、事后风险", C.blue);
  const w2 = card(slide, 480, 178, 210, 88, "证据研判", "查看证据子图和命中规则", C.blue);
  const w3 = card(slide, 735, 178, 210, 88, "解除/升级", "不成立关闭或升级事件", C.blue);
  connect(slide, w1, w2); connect(slide, w2, w3);
  const e1 = card(slide, 225, 288, 210, 88, "风险事件", "承接升级后的风险对象", C.orange);
  const e2 = card(slide, 480, 288, 210, 88, "派发整改", "责任人、期限、材料要求", C.orange);
  const e3 = card(slide, 735, 288, 210, 88, "提交材料", "说明整改动作和证据", C.orange);
  connect(slide, e1, e2, { color: C.orange }); connect(slide, e2, e3, { color: C.orange });
  const r1 = card(slide, 225, 398, 210, 88, "复核", "监管侧核验整改结果", C.green);
  const r2 = card(slide, 480, 398, 210, 88, "关闭", "形成闭环记录", C.green);
  const r3 = card(slide, 735, 398, 210, 88, "效果样本", "沉淀审计与规则优化依据", C.green);
  connect(slide, r1, r2, { color: C.green }); connect(slide, r2, r3, { color: C.green });
}

section("04", "典型监管场景", "用业务场景说明平台如何落地，而不是重复罗列功能模块");

// 16 procurement
{
  const slide = addSlide(L.light, "采购监管场景覆盖招投标、合同、审查和采购编制", "采购应用负责业务材料生成与审查，监管主线负责风险识别、证据研判和闭环处置");
  const rows = [
    ["招投标", "招投标书撰写、供应商资格审查、围串标识别、智能评标", "供应商异常关联、同一控制主体多家投标、评分说明缺失"],
    ["合同", "合同撰写、合同抽取、合同归档、合同对比、智能审查", "签订前缺少法务会签、付款比例偏离制度、关键条款异常"],
    ["审查", "文档审查、单据审查", "验收单、发票、付款申请、合同交付物不一致"],
    ["采购", "采购方案撰写、智能预算、采购单撰写", "预算超批复、采购金额异常、采购计划与执行偏离"],
  ];
  rows.forEach((r, i) => {
    const y = 178 + i * 92;
    pill(slide, 85, y, 130, 50, r[0], "#EAF2FF", C.blueDark);
    text(slide, 250, y - 2, 405, 56, r[1], { size: 19, color: C.slate, bold: true, valign: "mid" });
    text(slide, 705, y - 2, 455, 56, r[2], { size: 18, color: C.muted, valign: "mid" });
    if (i < rows.length - 1) shape(slide, 85, y + 72, 1075, 1, C.line, C.line, "rect");
  });
  text(slide, 250, 132, 410, 28, "采购应用侧能力", { size: 20, bold: true, color: C.blue });
  text(slide, 705, 132, 420, 28, "监管侧关注风险", { size: 20, bold: true, color: C.orange });
}

// 17 domains
{
  const slide = addSlide(L.light, "监管能力可沿采购主线扩展到财务、投资、资产与责任穿透", "业务场景增加时，优先复用数据源、图谱结构、规则资产和Skill资产");
  const domains = [
    ["资金司库", "付款账户不一致、超预算支付、支付节点异常", C.green],
    ["合同履约", "签署、变更、验收、付款、归档全过程跟踪", C.blue],
    ["投资项目", "立项、决策、资金安排、项目资产形成穿透", C.orange],
    ["资产项目", "资产形成、使用、处置和项目责任关联", C.cyan],
    ["人员组织", "经办人、评审人、审批人、责任人关系追溯", C.red],
  ];
  domains.forEach((d, i) => card(slide, 86 + (i % 3) * 365, 188 + Math.floor(i / 3) * 185, 315, 128, d[0], d[1], d[2]));
  text(slide, 830, 412, 315, 86, "扩展原则：先沉淀可复用对象关系，再按业务高风险环节配置场景和规则。", { size: 22, bold: true, color: C.blueDark, fill: "#F4F8FF", line: C.line, geometry: "roundRect", valign: "mid" });
}

section("05", "建设路径与应用价值", "面向客户讲清楚先落什么能力，以及为什么值得建设");

// 19 path
{
  const slide = addSlide(L.light, "建设路径建议从采购监管切入，再扩展到跨域集团监管", "先用高频、证据充足、闭环明确的场景打穿样板，再规模化复制能力");
  const phases = [
    ["第一阶段", "采购监管样板", "打通采购、合同、审批、支付等核心数据，落地工作台、预警、事件闭环和首批场景规则。"],
    ["第二阶段", "图谱与规则复用", "沉淀图谱结构、映射模板、规则资产和Skill资产，支持多组织、多场景复用。"],
    ["第三阶段", "跨域穿透扩展", "向财务司库、投资、资产、人员组织等领域扩展，形成集团级监管视图。"],
  ];
  let prev = null;
  phases.forEach((p, i) => {
    const box = card(slide, 110 + i * 360, 220, 300, 190, `${p[0]}：${p[1]}`, p[2], [C.blue, C.green, C.orange][i]);
    if (prev) connect(slide, prev, box, { color: C.blue });
    prev = box;
  });
  text(slide, 170, 475, 920, 54, "阶段推进的核心不是新增页面数量，而是逐步扩大可穿透的数据边界、规则边界和责任边界。", { size: 24, bold: true, color: C.blueDark, align: "center" });
}

// 20 value
{
  const slide = addSlide(L.light, "产品价值：让集团监管从人工追踪走向智能穿透和闭环治理", "价值表达聚焦客户收益，突出监管效率、风险前移和闭环治理");
  const values = [
    ["看得全", "监管对象、业务链路、风险状态和处置进展统一呈现。"],
    ["穿得透", "通过图谱关系把主体、合同、资金、人员和证据串起来。"],
    ["管得早", "事前规则校验和事中异常监测提前暴露高风险事项。"],
    ["闭环强", "预警、事件、整改、复核、关闭和审计在同一链路沉淀。"],
    ["复用快", "图谱结构、映射模板、规则和Skill可在多场景复用。"],
  ];
  values.forEach((v, i) => {
    const x = 80 + i * 238;
    shape(slide, x, 212, 190, 190, ["#EAF2FF", "#EAF8F4", "#FFF7E8", "#FDEDED", "#EEF7FF"][i], ["#CFE0FB", "#BDEBD7", "#FAD79A", "#F6B5AF", "#C9E7F2"][i]);
    text(slide, x + 18, 244, 154, 40, v[0], { size: 29, bold: true, color: [C.blue, C.green, C.orange, C.red, C.cyan][i], align: "center" });
    text(slide, x + 18, 306, 154, 68, v[1], { size: 17, color: C.slate, align: "center", valign: "mid" });
  });
  text(slide, 170, 498, 940, 56, "最终形成一套可配置、可解释、可追溯、可复制的集团穿透式监管能力。", { size: 27, bold: true, color: C.blueDark, align: "center" });
}

// 21 End
{
  const slide = presentation.slides.add();
  slide.background.fill = C.blueDark;
  shape(slide, 0, 0, W, H, C.blueDark, "none", "rect");
  shape(slide, 850, -20, 430, 760, "#0D55C7", "none", "rect");
  text(slide, 96, 230, 600, 82, "谢谢", { size: 64, bold: true, color: C.white });
  text(slide, 100, 346, 720, 54, "穿透式监管智能应用平台", { size: 34, bold: true, color: "#D7E8FF" });
  text(slide, 100, 612, 360, 24, "中国电子云", { size: 20, bold: true, color: C.white });
  note(slide);
}

await fs.mkdir(OUT_DIR, { recursive: true });
for (const [index, slide] of presentation.slides.items.entries()) {
  const num = String(index + 1).padStart(2, "0");
  await fs.writeFile(
    path.join(OUT_DIR, `slide-${num}.layout.json`),
    await (await slide.export({ format: "layout" })).text(),
    "utf8",
  );
  await fs.writeFile(
    path.join(OUT_DIR, `slide-${num}.png`),
    Buffer.from(await (await presentation.export({ slide, format: "png", scale: 1 })).arrayBuffer()),
  );
}
await fs.writeFile(
  path.join(OUT_DIR, "deck-montage.webp"),
  Buffer.from(await (await presentation.export({ format: "webp", montage: true, scale: 1 })).arrayBuffer()),
);
await fs.writeFile(
  path.join(path.dirname(OUT_DIR), "source-notes.txt"),
  "PPT内容依据当前工程路由、页面功能与用户在本任务中的结构偏好生成；视觉参考用户提供的PPT模板。\n",
  "utf8",
);
const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(FINAL_PPTX);
console.log(JSON.stringify({ final: FINAL_PPTX, slides: presentation.slides.items.length, render: OUT_DIR }, null, 2));








