import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT_DIR =
  "C:/Users/prophetcy/.codex/visualizations/2026/07/31/019fb6cd-42c8-7771-8705-50049583828e/regenerated_ppt";
const MEDIA_DIR = `${OUT_DIR}/source_media`;
const EXPORT_DIR = `${OUT_DIR}/exports`;
const RENDER_DIR = `${OUT_DIR}/rendered`;
const LAYOUT_DIR = `${OUT_DIR}/layouts`;
const FINAL_PPTX = `${EXPORT_DIR}/penetrative_supervision_core_refined.pptx`;
let headerPageNo = 2;

const W = 1280;
const H = 720;
const PAGE = { left: 64, top: 58, width: 1152, height: 594 };

const C = {
  blue: "#0067F5",
  blue2: "#2F7DFF",
  deep: "#0B1F3A",
  text: "#172033",
  body: "#4E5E76",
  muted: "#8794A8",
  bg: "#F7FAFF",
  surface: "#FFFFFF",
  soft: "#EAF2FF",
  line: "#D9E5F6",
  cyan: "#22D3EE",
  green: "#17B978",
  amber: "#FF9F40",
  red: "#EF4444",
  violet: "#7C5CFF",
};

function px(n) {
  return Math.round(n * 10) / 10;
}

async function writeBlob(filePath, blob) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function addShape(slide, geometry, position, fill = C.surface, line = { style: "solid", fill: C.line, width: 1 }, extra = {}) {
  return slide.shapes.add({
    geometry,
    position,
    fill,
    line,
    ...extra,
  });
}

function addText(slide, text, position, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: "Microsoft YaHei",
    fontSize: style.fontSize ?? 20,
    bold: style.bold ?? false,
    color: style.color ?? C.text,
    alignment: style.alignment ?? "left",
    verticalAlignment: style.verticalAlignment ?? "top",
    lineSpacing: style.lineSpacing ?? 1.12,
    insets: style.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
    wrap: "square",
  };
  return shape;
}

function addHeader(slide, title, section, pageNo) {
  const displayPageNo = headerPageNo++;
  addShape(slide, "rect", { left: 0, top: 0, width: W, height: H }, C.bg, {
    style: "solid",
    fill: "none",
    width: 0,
  });
  addShape(slide, "rect", { left: 0, top: 0, width: 8, height: H }, C.blue, {
    style: "solid",
    fill: C.blue,
    width: 0,
  });
  addText(slide, section, { left: 64, top: 26, width: 520, height: 22 }, {
    fontSize: 14,
    bold: true,
    color: C.blue,
  });
  addText(slide, title, { left: 64, top: 54, width: 960, height: 54 }, {
    fontSize: 35,
    bold: true,
    color: C.text,
    lineSpacing: 1.0,
  });
  addText(slide, "CEC  中国电子云", { left: 1014, top: 28, width: 190, height: 28 }, {
    fontSize: 18,
    bold: true,
    color: C.deep,
    alignment: "right",
  });
  addText(slide, String(displayPageNo).padStart(2, "0"), { left: 1168, top: 670, width: 48, height: 20 }, {
    fontSize: 13,
    color: C.muted,
    alignment: "right",
  });
}

function addNotes(slide, sourceText) {
  slide.speakerNotes.textFrame.setText(`[Sources]\n- ${sourceText}`);
  slide.speakerNotes.setVisible(true);
}

function addRule(slide, x1, y1, x2, y2, color = C.line, width = 1.5) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const boxW = Math.max(Math.abs(x2 - x1), 1);
  const boxH = Math.max(Math.abs(y2 - y1), 1);
  const start = { x: x1 <= x2 ? 0 : boxW, y: y1 <= y2 ? 0 : boxH };
  const end = { x: x2 <= x1 ? 0 : boxW, y: y2 <= y1 ? 0 : boxH };
  return slide.shapes.add({
    geometry: "custom",
    position: { left, top, width: boxW, height: boxH },
    fill: "none",
    customPaths: [{ width: boxW, height: boxH, commands: [{ moveTo: start }, { lineTo: end }] }],
    line: { style: "solid", fill: color, width },
  });
}

function addCard(slide, x, y, w, h, title, body, opts = {}) {
  addShape(slide, "roundRect", { left: x, top: y, width: w, height: h }, opts.fill ?? C.surface, {
    style: "solid",
    fill: opts.line ?? C.line,
    width: opts.lineWidth ?? 1,
  }, { borderRadius: opts.radius ?? 10 });
  if (opts.accent) {
    addShape(slide, "rect", { left: x, top: y, width: 6, height: h }, opts.accent, {
      style: "solid",
      fill: opts.accent,
      width: 0,
    });
  }
  addText(slide, title, { left: x + 22, top: y + 18, width: w - 44, height: 30 }, {
    fontSize: opts.titleSize ?? 22,
    bold: true,
    color: opts.titleColor ?? C.text,
  });
  addText(slide, body, { left: x + 22, top: y + 58, width: w - 44, height: h - 76 }, {
    fontSize: opts.bodySize ?? 17,
    color: opts.bodyColor ?? C.body,
    lineSpacing: 1.16,
  });
}

function addMetric(slide, x, y, w, label, value, foot, color) {
  addShape(slide, "roundRect", { left: x, top: y, width: w, height: 116 }, C.surface, {
    style: "solid",
    fill: C.line,
    width: 1,
  }, { borderRadius: 12 });
  addShape(slide, "rect", { left: x, top: y + 112, width: w, height: 4 }, color, {
    style: "solid",
    fill: color,
    width: 0,
  });
  addText(slide, label, { left: x + 22, top: y + 18, width: w - 44, height: 24 }, {
    fontSize: 16,
    bold: true,
    color: C.body,
  });
  addText(slide, value, { left: x + 22, top: y + 44, width: w - 44, height: 44 }, {
    fontSize: 34,
    bold: true,
    color,
  });
  addText(slide, foot, { left: x + 22, top: y + 88, width: w - 44, height: 18 }, {
    fontSize: 13,
    color: C.muted,
  });
}

function addBulletList(slide, items, x, y, w, h, opts = {}) {
  const lineH = opts.lineH ?? 34;
  items.forEach((item, idx) => {
    const yy = y + idx * lineH;
    addShape(slide, "ellipse", { left: x, top: yy + 8, width: 8, height: 8 }, opts.color ?? C.blue, {
      style: "solid",
      fill: opts.color ?? C.blue,
      width: 0,
    });
    addText(slide, item, { left: x + 18, top: yy, width: w - 18, height: lineH }, {
      fontSize: opts.fontSize ?? 18,
      color: opts.textColor ?? C.body,
      lineSpacing: 1.08,
    });
  });
}

function addPill(slide, text, x, y, w, color = C.blue, fill = C.soft) {
  addShape(slide, "roundRect", { left: x, top: y, width: w, height: 34 }, fill, {
    style: "solid",
    fill: color,
    width: 1,
  }, { borderRadius: 17 });
  addText(slide, text, { left: x + 8, top: y + 7, width: w - 16, height: 20 }, {
    fontSize: 14,
    bold: true,
    color,
    alignment: "center",
  });
}

function addProcess(slide, steps, x, y, w, opts = {}) {
  const gap = 22;
  const stepW = (w - gap * (steps.length - 1)) / steps.length;
  addRule(slide, x + stepW / 2, y + 56, x + w - stepW / 2, y + 56, opts.line ?? C.line, 3);
  steps.forEach((s, idx) => {
    const sx = x + idx * (stepW + gap);
    const color = s.color ?? C.blue;
    addShape(slide, "ellipse", { left: sx + stepW / 2 - 24, top: y + 32, width: 48, height: 48 }, color, {
      style: "solid",
      fill: color,
      width: 0,
    });
    addText(slide, String(idx + 1).padStart(2, "0"), { left: sx + stepW / 2 - 22, top: y + 46, width: 44, height: 22 }, {
      fontSize: 16,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    addText(slide, s.title, { left: sx, top: y + 100, width: stepW, height: 34 }, {
      fontSize: 20,
      bold: true,
      color: C.text,
      alignment: "center",
    });
    addText(slide, s.body, { left: sx, top: y + 138, width: stepW, height: 78 }, {
      fontSize: 15,
      color: C.body,
      alignment: "center",
      lineSpacing: 1.14,
    });
  });
}

async function addImage(slide, fileName, position, opts = {}) {
  const blob = await fs.readFile(`${MEDIA_DIR}/${fileName}`);
  slide.images.add({
    blob,
    contentType: fileName.endsWith(".jpg") ? "image/jpeg" : "image/png",
    alt: opts.alt ?? fileName,
    fit: opts.fit ?? "cover",
    position,
    geometry: opts.geometry ?? "roundRect",
    borderRadius: opts.borderRadius ?? 12,
  });
}

function titleSlide(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = C.blue;
  addShape(slide, "rect", { left: 0, top: 0, width: W, height: H }, C.blue, {
    style: "solid",
    fill: C.blue,
    width: 0,
  });
  addShape(slide, "ellipse", { left: 714, top: 58, width: 540, height: 540 }, "#1B7CFF", {
    style: "solid",
    fill: "#1B7CFF",
    width: 0,
  });
  addShape(slide, "ellipse", { left: 900, top: 188, width: 300, height: 300 }, "#0B58DA", {
    style: "solid",
    fill: "#0B58DA",
    width: 0,
  });
  addText(slide, "CEC  中国电子云", { left: 64, top: 52, width: 300, height: 36 }, {
    fontSize: 20,
    bold: true,
    color: "#FFFFFF",
  });
  addText(slide, "央国企穿透式监管智能应用平台", { left: 92, top: 236, width: 780, height: 76 }, {
    fontSize: 54,
    bold: true,
    color: "#FFFFFF",
    lineSpacing: 0.98,
  });
  addText(slide, "把多系统事实转化为可解释预警、证据链与整改闭环", { left: 96, top: 330, width: 720, height: 34 }, {
    fontSize: 24,
    color: "#DDEBFF",
  });
  addRule(slide, 96, 395, 456, 395, "#FFFFFF", 3);
  addText(slide, "中国电子云\n2026年7月", { left: 96, top: 430, width: 300, height: 64 }, {
    fontSize: 18,
    color: "#DDEBFF",
    lineSpacing: 1.35,
  });
  addText(slide, "方案汇报材料", { left: 900, top: 612, width: 260, height: 24 }, {
    fontSize: 14,
    bold: true,
    color: "#DDEBFF",
    alignment: "right",
  });
  addNotes(slide, "用户提供原始PPT《穿透式监管平台-电子云.pptx》，第1页。");
}

function slide2(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "核心结论：平台价值来自“穿透、解释、闭环、复用”", "执行摘要", 2);
  addText(slide, "监管不只是多看几张报表，而是把组织、业务、资金、证据和责任关系连成可执行的风险治理链。", {
    left: 74,
    top: 132,
    width: 980,
    height: 52,
  }, { fontSize: 24, bold: true, color: C.deep });
  const cards = [
    ["穿透", "覆盖集团总部、二级单位、基层企业以及项目、账户、人员等末梢对象。", C.blue],
    ["解释", "预警必须能回到规则、来源记录、图谱版本和证据快照。", C.green],
    ["闭环", "研判、转派、整改、复核、关闭和样本回流形成在线闭环。", C.violet],
    ["复用", "本体、映射、规则、场景版本和样本资产可复制到更多领域。", C.amber],
  ];
  cards.forEach(([t, b, color], i) => addCard(slide, 74 + i * 284, 224, 252, 246, t, b, {
    accent: color,
    titleColor: color,
    bodySize: 18,
  }));
  addShape(slide, "roundRect", { left: 74, top: 530, width: 1132, height: 82 }, "#EAF2FF", {
    style: "solid",
    fill: "#B7D4FF",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "本汇报按一条主线展开：监管要求 -> 产品架构 -> 核心能力 -> 典型场景 -> 试点复制。", {
    left: 98,
    top: 552,
    width: 1084,
    height: 34,
  }, { fontSize: 21, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于原始PPT第3-5页、第7-14页、第21-55页内容重组。");
}

function slide3(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "汇报主线", "目录", 3);
  const items = [
    ["01", "监管要求与建设目标", "说明为什么需要从事后抽查升级为在线穿透。"],
    ["02", "产品定位与总体方案", "说明平台边界、总体架构和端到端运行链。"],
    ["03", "核心功能体系", "说明工作台、态势、风险、规则、图谱和运营能力。"],
    ["04", "典型应用场景", "用采购、合同付款、投资合规展示可落地路径。"],
    ["05", "建设实施与应用价值", "说明试点边界、实施阶段和复制价值。"],
  ];
  items.forEach((it, i) => {
    const y = 142 + i * 94;
    addText(slide, it[0], { left: 92, top: y + 8, width: 78, height: 42 }, {
      fontSize: 30,
      bold: true,
      color: i === 0 ? C.blue : C.muted,
      alignment: "center",
    });
    addRule(slide, 190, y + 32, 1150, y + 32, i === 0 ? C.blue : C.line, i === 0 ? 3 : 1.2);
    addText(slide, it[1], { left: 212, top: y, width: 360, height: 36 }, {
      fontSize: 24,
      bold: true,
      color: C.text,
    });
    addText(slide, it[2], { left: 602, top: y + 4, width: 510, height: 32 }, {
      fontSize: 17,
      color: C.body,
    });
  });
  addNotes(slide, "基于原始PPT目录页与全稿内容重组，删除重复章节页。");
}

function slide4(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "监管要求正在把能力从事后核查推向在线穿透", "01 监管要求与建设目标", 4);
  addText(slide, "从“人工管控、事后处置”转向“智能预警、全程智控”，核心变化不是工具升级，而是监管范式升级。", {
    left: 78,
    top: 130,
    width: 1020,
    height: 54,
  }, { fontSize: 23, bold: true, color: C.deep });
  addProcess(slide, [
    { title: "事前识别", body: "规则校验、风险建模、异常线索提前发现" },
    { title: "事中监测", body: "组织、合同、资金、审批和责任链路持续在线" },
    { title: "事后复核", body: "整改材料、复核结论、审计留痕可追溯" },
    { title: "持续优化", body: "处置效果反哺规则阈值和模型版本" },
  ], 96, 228, 1088);
  addCard(slide, 98, 520, 500, 82, "监管侧关注", "重点领域、关键事项和风险问题需要在线化、实时化、模型化。", { accent: C.blue, bodySize: 17 });
  addCard(slide, 682, 520, 500, 82, "数据侧支撑", "统一标准、强化治理和数据底座，为穿透监管提供可信事实源。", { accent: C.green, bodySize: 17 });
  addNotes(slide, "用户提供原始PPT第3-5页关于监管要求、数据筑基和建设目标的表述。");
}

function slide5(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "建设目标落在“四全贯通、五通融合”", "01 监管要求与建设目标", 5);
  const leftItems = [
    ["全级次", "纵向覆盖集团总部、二级单位、基层企业和末梢对象。"],
    ["全链条", "横向打通投资、采购、合同、财务、司库、人事、资产等链路。"],
    ["全过程", "覆盖事前规则校验、事中异常监测、事后整改复核。"],
    ["全要素", "穿透主体、资金、合同、资产、人员、规则、证据和责任。"],
  ];
  leftItems.forEach((it, i) => addCard(slide, 76, 132 + i * 104, 520, 84, it[0], it[1], {
    accent: C.blue,
    titleSize: 20,
    bodySize: 16,
  }));
  addText(slide, "五通融合", { left: 702, top: 146, width: 360, height: 44 }, {
    fontSize: 32,
    bold: true,
    color: C.deep,
  });
  addBulletList(slide, [
    "数据通：统一数据标准与主数据口径",
    "层级通：贯通多级组织与责任边界",
    "业务通：打通跨系统业务事实链",
    "监管通：指标、规则与风险同源管理",
    "处置通：预警、派单、整改、复核闭环",
  ], 708, 216, 450, 260, { fontSize: 20, lineH: 46, color: C.green });
  addShape(slide, "roundRect", { left: 682, top: 524, width: 500, height: 78 }, C.deep, {
    style: "solid",
    fill: C.deep,
    width: 0,
  }, { borderRadius: 10 });
  addText(slide, "建设目标：形成统一、可信、可穿透、可解释、可运营的监管能力底座。", {
    left: 708,
    top: 548,
    width: 448,
    height: 30,
  }, { fontSize: 20, bold: true, color: "#FFFFFF", alignment: "center" });
  addNotes(slide, "用户提供原始PPT第5页、第12页关于“四全”和“五通”的表述。");
}

function slide6(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "现状痛点：数据、链路、证据和闭环分散", "01 监管要求与建设目标", 6);
  const items = [
    ["看不全", "多级组织和业务系统割裂，风险分布只能局部观察。", C.blue],
    ["连不通", "合同、验收、发票、付款、账户等事实缺少统一链路。", C.violet],
    ["说不清", "预警结论难以回溯到规则版本、来源记录和制度依据。", C.amber],
    ["闭不住", "整改、复核、关闭和效果复盘没有形成持续运营机制。", C.red],
  ];
  items.forEach((it, i) => {
    const x = 86 + (i % 2) * 570;
    const y = 158 + Math.floor(i / 2) * 190;
    addCard(slide, x, y, 500, 142, it[0], it[1], {
      accent: it[2],
      titleColor: it[2],
      titleSize: 26,
      bodySize: 19,
    });
  });
  addText(slide, "平台设计要从“展示结果”前移到“组织事实、解释风险、驱动处置”。", {
    left: 92,
    top: 552,
    width: 1096,
    height: 42,
  }, { fontSize: 26, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于原始PPT第3-5页、第10页、第12-14页的问题与目标表达归纳。");
}

function slide7(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "产品定位：以图谱、规则、模型和闭环形成穿透监管平台", "02 产品定位与总体方案", 7);
  addShape(slide, "roundRect", { left: 78, top: 126, width: 1124, height: 58 }, C.blue, {
    style: "solid",
    fill: C.blue,
    width: 0,
  }, { borderRadius: 8 });
  addText(slide, "中国电子云穿透式监管智能应用平台", { left: 100, top: 143, width: 1080, height: 28 }, {
    fontSize: 26,
    bold: true,
    color: "#FFFFFF",
    alignment: "center",
  });

  const groups = [
    { title: "监管入口", color: C.blue, x: 86, items: ["监管工作台", "监管态势", "统一预警", "风险事件"] },
    { title: "配置资产", color: C.violet, x: 390, items: ["图谱结构", "数据源与字段映射", "规则资产", "模型目录"] },
    { title: "运行闭环", color: C.green, x: 694, items: ["规则发布", "证据快照", "整改复核", "样本回流"] },
    { title: "安全运营", color: C.deep, x: 998, items: ["真实认证", "服务端RBAC", "统一审计", "性能回滚"] },
  ];
  groups.forEach((g) => {
    addShape(slide, "roundRect", { left: g.x, top: 222, width: 210, height: 56 }, "#FFFFFF", {
      style: "solid",
      fill: g.color,
      width: 2,
    }, { borderRadius: 10 });
    addText(slide, g.title, { left: g.x + 12, top: 238, width: 186, height: 24 }, {
      fontSize: 21,
      bold: true,
      color: g.color,
      alignment: "center",
    });
    g.items.forEach((item, i) => {
      addShape(slide, "roundRect", { left: g.x, top: 304 + i * 48, width: 210, height: 34 }, i % 2 ? "#FFFFFF" : "#F4F8FF", {
        style: "solid",
        fill: C.line,
        width: 1,
      }, { borderRadius: 6 });
      addText(slide, item, { left: g.x + 10, top: 312 + i * 48, width: 190, height: 20 }, {
        fontSize: 16,
        bold: i === 0,
        color: C.text,
        alignment: "center",
      });
    });
  });
  [296, 600, 904].forEach((x) => addRule(slide, x, 384, x + 78, 384, C.line, 2));

  const boundaries = [
    ["做", "跨系统事实映射为图谱事实；用确定性规则识别风险；生成可追溯证据和整改闭环"],
    ["不做", "不替代源业务系统；不自动定责；不自动阻断；首批不建设模型训练和全量自由探索"],
  ];
  boundaries.forEach((b, i) => {
    const x = i === 0 ? 98 : 654;
    addShape(slide, "roundRect", { left: x, top: 534, width: 528, height: 72 }, i === 0 ? "#EAF7F0" : "#FFF7EA", {
      style: "solid",
      fill: i === 0 ? "#AFE3C8" : "#FFD9A5",
      width: 1,
    }, { borderRadius: 8 });
    addText(slide, b[0], { left: x + 20, top: 554, width: 54, height: 28 }, {
      fontSize: 22,
      bold: true,
      color: i === 0 ? C.green : C.amber,
      alignment: "center",
    });
    addText(slide, b[1], { left: x + 90, top: 548, width: 410, height: 38 }, {
      fontSize: 16,
      color: C.text,
      lineSpacing: 1.1,
    });
  });
  addNotes(slide, "基于PRD v12.0第1.3、3.1、3.3、5.1-5.5章节修正产品定位与边界。");
}

function slide8(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "功能架构：六大模块与四层底座协同", "02 产品定位与总体方案", 8);
  const layers = [
    { name: "监管业务层", color: C.blue, items: ["监管工作台", "监管态势", "风险管理", "规则管理", "知识图谱", "系统管理"] },
    { name: "能力配置层", color: C.violet, items: ["规则库", "规则场景", "规则目录", "风险规则", "DSL表达式", "制度依据", "证据要求", "模型目录"] },
    { name: "知识图谱底座", color: C.green, items: ["图谱结构", "数据源", "字段映射", "知识图谱生成", "版本快照", "证据子图"] },
    { name: "来源与服务", color: C.amber, items: ["ERP/采购", "财务/司库", "OA审批", "合同文档", "人力主数据", "外部数据", "模型网关"] },
    { name: "治理支撑", color: C.deep, items: ["私有化部署", "Node.js API", "MySQL落库", "服务端RBAC", "统一审计", "性能回滚"] },
  ];
  layers.forEach((l, i) => {
    const y = 130 + i * 94;
    addShape(slide, "roundRect", { left: 78, top: y, width: 188, height: 62 }, l.color, {
      style: "solid",
      fill: l.color,
      width: 0,
    }, { borderRadius: 8 });
    addText(slide, l.name, { left: 94, top: y + 18, width: 156, height: 26 }, {
      fontSize: 20,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    const count = l.items.length;
    const gap = 10;
    const boxW = (876 - gap * (count - 1)) / count;
    l.items.forEach((item, idx) => {
      const x = 304 + idx * (boxW + gap);
      addShape(slide, "roundRect", { left: x, top: y + 6, width: boxW, height: 50 }, "#FFFFFF", {
        style: "solid",
        fill: idx % 2 ? "#D9E5F6" : l.color,
        width: idx % 2 ? 1 : 1.5,
      }, { borderRadius: 7 });
      addText(slide, item, { left: x + 6, top: y + 20, width: boxW - 12, height: 20 }, {
        fontSize: count > 6 ? 13 : 15,
        bold: true,
        color: C.text,
        alignment: "center",
      });
    });
    if (i < layers.length - 1) addRule(slide, 172, y + 68, 172, y + 88, C.line, 2);
  });
  addShape(slide, "roundRect", { left: 134, top: 612, width: 1012, height: 34 }, "#EAF2FF", {
    style: "solid",
    fill: "#B7D4FF",
    width: 1,
  }, { borderRadius: 6 });
  addText(slide, "主链路：来源字段映射为图谱事实 -> 规则和模型完成风险识别 -> 预警证据冻结 -> 风险事件整改复核 -> 效果样本回流", {
    left: 158,
    top: 620,
    width: 964,
    height: 18,
  }, { fontSize: 15, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于PRD v12.0第5.1、5.3、10.3、10.4、12.3章节重绘功能架构，不直接粘贴原PPT图片。");
}

function slide9(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "端到端闭环：每条风险都有事实、责任和结果", "02 产品定位与总体方案", 9);
  addProcess(slide, [
    { title: "数据接入", body: "来源、口径、映射、质量" },
    { title: "图谱关联", body: "对象、关系、事件、证据" },
    { title: "规则命中", body: "场景版本、阈值、例外" },
    { title: "预警研判", body: "解释原因、转派或升级" },
    { title: "整改复核", body: "责任单位举证，监管复核关闭" },
    { title: "样本回流", body: "形成效果样本，优化规则模型" },
  ], 76, 178, 1128, { line: "#BDD4F5" });
  addShape(slide, "roundRect", { left: 108, top: 520, width: 1064, height: 72 }, "#EAF7F0", {
    style: "solid",
    fill: "#AFE3C8",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "闭环底线：历史预警生成时固化事实、来源和版本，后续补充材料新增保存，不覆盖初始证据。", {
    left: 136,
    top: 542,
    width: 1008,
    height: 28,
  }, { fontSize: 20, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "用户提供原始PPT第10页、第19页、第29页、第37-38页的闭环链路和证据快照表述。");
}

function slide10(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "总体技术架构：应用、服务、资产和安全治理分层解耦", "02 产品定位与总体方案", 10);
  addShape(slide, "roundRect", { left: 78, top: 124, width: 1124, height: 56 }, "#EAF2FF", {
    style: "solid",
    fill: "#B7D4FF",
    width: 1,
  }, { borderRadius: 8 });
  addText(slide, "角色入口：集团领导 / 监管负责人 / 领域专员 / 业务责任人 / 图谱结构管理员 / 规则管理员 / 模型管理员 / 系统管理员", {
    left: 104,
    top: 142,
    width: 1072,
    height: 22,
  }, { fontSize: 17, bold: true, color: C.deep, alignment: "center" });

  const bands = [
    { y: 214, label: "PC Web 应用", color: C.blue, items: ["工作台", "态势", "统一预警", "风险事件", "规则管理", "知识图谱", "系统管理"] },
    { y: 326, label: "业务服务", color: C.violet, items: ["待办消息", "预警研判", "风险闭环", "规则执行", "证据快照", "模型网关", "审计服务"] },
    { y: 438, label: "监管资产", color: C.green, items: ["图谱结构", "字段映射", "知识图谱版本", "规则资产版本", "规则场景版本", "模型目录", "效果样本"] },
    { y: 550, label: "技术与安全", color: C.deep, items: ["私有化", "Node.js API", "MySQL", "RBAC", "数据权限", "事务幂等", "回滚"] },
  ];
  bands.forEach((b, bi) => {
    addShape(slide, "roundRect", { left: 82, top: b.y, width: 162, height: 60 }, b.color, {
      style: "solid",
      fill: b.color,
      width: 0,
    }, { borderRadius: 8 });
    addText(slide, b.label, { left: 96, top: b.y + 18, width: 134, height: 24 }, {
      fontSize: 18,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    b.items.forEach((it, i) => {
      const x = 278 + i * 128;
      addShape(slide, "roundRect", { left: x, top: b.y + 6, width: 108, height: 48 }, "#FFFFFF", {
        style: "solid",
        fill: b.color,
        width: 1.5,
      }, { borderRadius: 7 });
      addText(slide, it, { left: x + 5, top: b.y + 21, width: 98, height: 18 }, {
        fontSize: 14,
        bold: true,
        color: C.text,
        alignment: "center",
      });
    });
    if (bi < bands.length - 1) addRule(slide, 640, b.y + 66, 640, b.y + 104, C.line, 2);
  });
  addShape(slide, "roundRect", { left: 318, top: 658, width: 644, height: 28 }, "#FFF7EA", {
    style: "solid",
    fill: "#FFD9A5",
    width: 1,
  }, { borderRadius: 6 });
  addText(slide, "工程边界：配置类优先落库；风险闭环、权限、模型调用审计是试点前加固重点", {
    left: 338,
    top: 664,
    width: 604,
    height: 18,
  }, { fontSize: 14, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于PRD v12.0第1.1、2、4.2、6.2、7.3章节重绘总体技术架构。");
}

function slide11(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "核心业务流程：版本化配置先行，运行闭环固化证据和责任", "03 核心功能体系", 11);
  const steps = [
    ["01", "图谱结构发布", "类 / 属性 / 关系\n发布后只读", C.green],
    ["02", "字段映射就绪", "来源解析\n映射校验", C.green],
    ["03", "知识图谱生成", "结构版本 + 映射快照\n形成图谱版本", C.green],
    ["04", "规则与模型就绪", "规则资产版本\n模型目录状态", C.violet],
    ["05", "场景试跑发布", "引用规则版本\n固化适用范围", C.violet],
    ["06", "业务扫描触发", "目标业务记录\n规则命中", C.blue],
    ["07", "预警证据冻结", "规则 + 图谱 + 来源\n证据快照", C.blue],
    ["08", "研判与整改复核", "解除 / 升级\n整改 / 复核", C.red],
    ["09", "样本回流", "有效 / 误报\n新版本优化", C.amber],
  ];
  steps.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 84 + col * 382;
    const y = 136 + row * 142;
    addShape(slide, "ellipse", { left: x, top: y + 20, width: 48, height: 48 }, s[3], {
      style: "solid",
      fill: s[3],
      width: 0,
    });
    addText(slide, s[0], { left: x, top: y + 34, width: 48, height: 20 }, {
      fontSize: 15,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    addShape(slide, "roundRect", { left: x + 62, top: y, width: 260, height: 88 }, "#FFFFFF", {
      style: "solid",
      fill: s[3],
      width: 1.8,
    }, { borderRadius: 8 });
    addText(slide, s[1], { left: x + 80, top: y + 14, width: 224, height: 24 }, {
      fontSize: 18,
      bold: true,
      color: C.text,
    });
    addText(slide, s[2], { left: x + 80, top: y + 42, width: 224, height: 34 }, {
      fontSize: 14,
      color: C.body,
      lineSpacing: 1.1,
    });
    if (col < 2) addRule(slide, x + 322, y + 44, x + 382, y + 44, C.line, 2);
    if (col === 2 && row < 2) addRule(slide, x + 140, y + 88, x + 140, y + 132, C.line, 2);
  });
  addShape(slide, "roundRect", { left: 152, top: 590, width: 976, height: 52 }, C.deep, {
    style: "solid",
    fill: C.deep,
    width: 0,
  }, { borderRadius: 8 });
  addText(slide, "底线：已发布结构、图谱、规则和场景版本不可原地修改；历史预警证据不被当前图谱覆盖。", {
    left: 180,
    top: 606,
    width: 920,
    height: 22,
  }, { fontSize: 18, bold: true, color: "#FFFFFF", alignment: "center" });
  addNotes(slide, "基于PRD v12.0第1.3、1.4、4.2、13.3章节重绘端到端核心流程。");
}

async function slide12(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "监管工作台回答“我现在要处理什么”", "03 核心功能体系", 12);
  await addImage(slide, "image36.png", { left: 76, top: 140, width: 690, height: 392 }, {
    alt: "监管工作台产品截图",
    fit: "cover",
  });
  addCard(slide, 806, 146, 370, 96, "核心指标", "待研判预警、待整改事件、待复核事件和逾期任务集中展示。", {
    accent: C.blue,
    bodySize: 16,
  });
  addCard(slide, 806, 270, 370, 96, "待办列表", "按当前角色聚合任务，支持筛选、下钻、转派和处理。", {
    accent: C.green,
    bodySize: 16,
  });
  addCard(slide, 806, 394, 370, 96, "消息接收", "同步预警和事件状态变化，作为处置入口和提醒机制。", {
    accent: C.violet,
    bodySize: 16,
  });
  addText(slide, "建议保留截图，但删除原页大段说明，让截图自己承担“产品真实感”。", {
    left: 90,
    top: 568,
    width: 1070,
    height: 24,
  }, { fontSize: 16, color: C.muted, alignment: "center" });
  addNotes(slide, "用户提供原始PPT第22页及其产品截图 image36.png。");
}

async function slide13(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "监管态势把规模、分布、趋势和下钻放在同一视图", "03 核心功能体系", 13);
  await addImage(slide, "image39.png", { left: 78, top: 136, width: 700, height: 414 }, {
    alt: "监管态势分析视图截图",
    fit: "cover",
  });
  addMetric(slide, 814, 144, 150, "预警总量", "41", "近30天", C.blue);
  addMetric(slide, 984, 144, 150, "重大风险", "7", "需重点关注", C.red);
  addMetric(slide, 814, 286, 150, "在办事件", "10", "未关闭", C.violet);
  addMetric(slide, 984, 286, 150, "闭环率", "0%", "试运行口径", C.green);
  addBulletList(slide, [
    "同一筛选上下文同步刷新全部卡片",
    "图表、指标和明细保持同口径",
    "组织、领域、场景分布支持权限裁剪后下钻",
  ], 820, 446, 350, 110, { fontSize: 16, lineH: 32 });
  addNotes(slide, "用户提供原始PPT第24-26页及产品截图 image39.png；截图中的数值为演示口径。");
}

function slide14(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "风险监管拆成预警研判与风险事件整改复核", "03 核心功能体系", 14);
  addText(slide, "预警关注“是否需要升级”，风险事件关注“如何整改并关闭”。", {
    left: 80,
    top: 132,
    width: 820,
    height: 36,
  }, { fontSize: 24, bold: true, color: C.deep });
  const x1 = 118;
  const x2 = 710;
  addCard(slide, x1, 214, 420, 250, "预警状态机", "待研判\n已解除\n已升级", {
    accent: C.blue,
    titleSize: 25,
    bodySize: 26,
    bodyColor: C.deep,
  });
  addCard(slide, x2, 214, 420, 250, "风险事件状态机", "待整改\n待复核\n已关闭\n复核退回 -> 待整改", {
    accent: C.green,
    titleSize: 25,
    bodySize: 24,
    bodyColor: C.deep,
  });
  addRule(slide, x1 + 420, 338, x2, 338, C.red, 4);
  addText(slide, "升级", { left: 574, top: 306, width: 92, height: 28 }, {
    fontSize: 20,
    bold: true,
    color: C.red,
    alignment: "center",
  });
  addShape(slide, "roundRect", { left: 118, top: 524, width: 1012, height: 68 }, "#FFF7EA", {
    style: "solid",
    fill: "#FFD9A5",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "高危操作均需权限、原因、确认与审计；同一预警最多升级一个风险事件，关闭后只读保留。", {
    left: 152,
    top: 544,
    width: 944,
    height: 26,
  }, { fontSize: 19, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "用户提供原始PPT第28-29页关于预警和风险事件边界、状态机及操作约束的表述。");
}

async function slide15(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "预警详情页把规则命中、证据子图和处置动作放在一起", "03 核心功能体系", 15);
  await addImage(slide, "image46.png", { left: 76, top: 132, width: 744, height: 422 }, {
    alt: "预警详情页截图",
    fit: "contain",
  });
  addCard(slide, 854, 142, 320, 108, "顶部状态", "预警阶段、处理状态、风险等级、目标节点、版本信息先被看见。", {
    accent: C.blue,
    bodySize: 16,
  });
  addCard(slide, 854, 278, 320, 108, "中部证据", "风险说明、命中规则、核心路径和证据子图解释识别逻辑。", {
    accent: C.green,
    bodySize: 16,
  });
  addCard(slide, 854, 414, 320, 108, "底部动作", "返回、转派、解除预警、升级风险事件，全部留痕。", {
    accent: C.red,
    bodySize: 16,
  });
  addNotes(slide, "用户提供原始PPT第30页及产品截图 image46.png。");
}

function slide16(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "场景与规则：场景负责发布运行，规则作为资产独立复用", "03 核心功能体系", 16);
  addShape(slide, "roundRect", { left: 76, top: 138, width: 480, height: 330 }, "#F4F8FF", {
    style: "solid",
    fill: "#B7D4FF",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "风险场景版本", { left: 108, top: 162, width: 220, height: 28 }, {
    fontSize: 24,
    bold: true,
    color: C.blue,
  });
  const sceneItems = ["基本信息：领域、等级、阶段", "风险规则：引用规则版本", "适用范围：组织、对象、例外", "校验试跑：样本、命中、证据", "发布锁定：场景与规则快照"];
  sceneItems.forEach((it, i) => addPill(slide, it, 114, 214 + i * 45, 370, C.blue, "#FFFFFF"));

  addShape(slide, "roundRect", { left: 724, top: 138, width: 480, height: 330 }, "#F7F2FF", {
    style: "solid",
    fill: "#D6CCFF",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "规则资产版本", { left: 756, top: 162, width: 220, height: 28 }, {
    fontSize: 24,
    bold: true,
    color: C.violet,
  });
  const ruleItems = ["基本信息：类型、等级、图谱", "检测口径：业务解释", "DSL表达式：系统执行", "规则级例外：白名单/不适用", "制度依据与证据要求"];
  ruleItems.forEach((it, i) => addPill(slide, it, 762, 214 + i * 45, 370, C.violet, "#FFFFFF"));

  addShape(slide, "ellipse", { left: 578, top: 238, width: 124, height: 124 }, C.green, {
    style: "solid",
    fill: C.green,
    width: 0,
  });
  addText(slide, "版本引用\n多场景复用", { left: 594, top: 276, width: 92, height: 46 }, {
    fontSize: 18,
    bold: true,
    color: "#FFFFFF",
    alignment: "center",
  });
  addRule(slide, 556, 300, 578, 300, C.green, 3);
  addRule(slide, 702, 300, 724, 300, C.green, 3);

  const states = ["草稿", "待试跑", "待发布", "已发布", "已停用"];
  states.forEach((s, i) => {
    const x = 172 + i * 190;
    addShape(slide, "roundRect", { left: x, top: 536, width: 128, height: 42 }, i === 3 ? C.green : "#FFFFFF", {
      style: "solid",
      fill: i === 3 ? C.green : C.line,
      width: 1.2,
    }, { borderRadius: 8 });
    addText(slide, s, { left: x + 8, top: 548, width: 112, height: 18 }, {
      fontSize: 16,
      bold: true,
      color: i === 3 ? "#FFFFFF" : C.text,
      alignment: "center",
    });
    if (i < states.length - 1) addRule(slide, x + 128, 557, x + 190, 557, C.line, 2);
  });
  addText(slide, "内容修正：不再设置独立 Skill 管理入口；智能生成规则只是辅助，最终以人工保存、校验、试跑和发布为准。", {
    left: 128,
    top: 614,
    width: 1024,
    height: 22,
  }, { fontSize: 16, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于PRD v12.0修改记录、第10.3.4章节和《场景与规则交互文档》重绘，修正独立Skill入口口径。");
}

function slide17(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "知识图谱：结构、来源、映射和生成结果都必须版本可追溯", "03 核心功能体系", 17);
  const cols = [
    { x: 70, title: "图谱结构", color: C.blue, items: ["类定义", "属性定义", "关系定义", "业务记录类", "发布后只读"] },
    { x: 340, title: "数据源", color: C.amber, items: ["来源登记", "结构解析", "字段清单", "启用/停用", "删除约束"] },
    { x: 610, title: "字段映射", color: C.violet, items: ["目标图谱字段", "来源字段", "转换规则", "映射校验", "模板快照"] },
    { x: 880, title: "知识图谱版本", color: C.green, items: ["生成向导", "数据范围", "质量结果", "发布归档", "证据引用"] },
  ];
  cols.forEach((c, ci) => {
    addShape(slide, "roundRect", { left: c.x, top: 144, width: 226, height: 300 }, "#FFFFFF", {
      style: "solid",
      fill: c.color,
      width: 2,
    }, { borderRadius: 10 });
    addText(slide, c.title, { left: c.x + 16, top: 166, width: 194, height: 28 }, {
      fontSize: 22,
      bold: true,
      color: c.color,
      alignment: "center",
    });
    c.items.forEach((it, i) => {
      addShape(slide, "roundRect", { left: c.x + 28, top: 218 + i * 42, width: 170, height: 28 }, i % 2 ? "#FFFFFF" : "#F4F8FF", {
        style: "solid",
        fill: C.line,
        width: 1,
      }, { borderRadius: 5 });
      addText(slide, it, { left: c.x + 36, top: 224 + i * 42, width: 154, height: 16 }, {
        fontSize: 14,
        bold: i === 4,
        color: C.text,
        alignment: "center",
      });
    });
    if (ci < cols.length - 1) addRule(slide, c.x + 226, 294, c.x + 270, 294, C.line, 2);
  });

  const nodes = [
    ["供应商", 396, 514, C.blue], ["人员", 528, 478, C.violet], ["合同", 660, 514, C.green], ["资金", 792, 478, C.amber], ["证据", 924, 514, C.red],
  ];
  addText(slide, "证据子图示意", { left: 116, top: 500, width: 170, height: 28 }, {
    fontSize: 22,
    bold: true,
    color: C.deep,
  });
  addText(slide, "预警生成时冻结有限事实、关系路径、来源记录和版本快照", { left: 116, top: 534, width: 220, height: 48 }, {
    fontSize: 16,
    color: C.body,
    lineSpacing: 1.1,
  });
  nodes.forEach((n, i) => {
    addShape(slide, "ellipse", { left: n[1], top: n[2], width: 76, height: 76 }, "#FFFFFF", {
      style: "solid",
      fill: n[3],
      width: 2,
    });
    addText(slide, n[0], { left: n[1] + 8, top: n[2] + 26, width: 60, height: 20 }, {
      fontSize: 15,
      bold: true,
      color: C.text,
      alignment: "center",
    });
    if (i < nodes.length - 1) addRule(slide, n[1] + 76, n[2] + 38, nodes[i + 1][1], nodes[i + 1][2] + 38, C.line, 2);
  });
  addShape(slide, "roundRect", { left: 358, top: 614, width: 788, height: 34 }, "#EAF7F0", {
    style: "solid",
    fill: "#AFE3C8",
    width: 1,
  }, { borderRadius: 6 });
  addText(slide, "快照失败不能用当前图谱替代；已发布结构和图谱版本必须可审计、可追溯。", {
    left: 378,
    top: 622,
    width: 748,
    height: 18,
  }, { fontSize: 15, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于PRD v12.0第10.3.5、10.4、10.6和《知识图谱交互文档》重绘知识图谱机制图。");
}

function slide18(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "模型管理：统一目录、绑定和调用审计", "03 核心功能体系", 18);
  const left = ["平台预置模型", "客户自有模型", "模型服务 / 网关"];
  left.forEach((it, i) => {
    addShape(slide, "roundRect", { left: 82, top: 168 + i * 96, width: 220, height: 62 }, "#FFFFFF", {
      style: "solid",
      fill: [C.blue, C.green, C.amber][i],
      width: 2,
    }, { borderRadius: 8 });
    addText(slide, it, { left: 100, top: 188 + i * 96, width: 184, height: 22 }, {
      fontSize: 18,
      bold: true,
      color: C.text,
      alignment: "center",
    });
    addRule(slide, 302, 199 + i * 96, 384, 324, C.line, 2);
  });

  addShape(slide, "ellipse", { left: 390, top: 238, width: 174, height: 174 }, C.blue, {
    style: "solid",
    fill: C.blue,
    width: 0,
  });
  addText(slide, "模型目录\n统一治理", { left: 418, top: 290, width: 118, height: 48 }, {
    fontSize: 22,
    bold: true,
    color: "#FFFFFF",
    alignment: "center",
  });

  const ops = ["同步目录", "接入自有模型", "详情查看", "模型测试", "绑定场景", "启用 / 停用"];
  ops.forEach((op, i) => {
    const x = 640 + (i % 3) * 166;
    const y = 154 + Math.floor(i / 3) * 96;
    addShape(slide, "roundRect", { left: x, top: y, width: 132, height: 58 }, i >= 3 ? "#F7F2FF" : "#F4F8FF", {
      style: "solid",
      fill: i >= 3 ? C.violet : C.blue,
      width: 1.5,
    }, { borderRadius: 8 });
    addText(slide, op, { left: x + 8, top: y + 19, width: 116, height: 18 }, {
      fontSize: 15,
      bold: true,
      color: C.text,
      alignment: "center",
    });
  });
  addRule(slide, 564, 325, 640, 229, C.line, 2);
  addRule(slide, 564, 325, 640, 325, C.line, 2);

  const gates = ["鉴权", "输入输出Schema", "脱敏", "超时回退", "调用审计", "场景授权边界"];
  gates.forEach((g, i) => addPill(slide, g, 144 + i * 162, 484, 138, C.deep, "#FFFFFF"));
  addShape(slide, "roundRect", { left: 128, top: 560, width: 1024, height: 62 }, "#FFF7EA", {
    style: "solid",
    fill: "#FFD9A5",
    width: 1,
  }, { borderRadius: 8 });
  addText(slide, "边界说明：本期模型管理只治理目录、接入、测试、场景绑定、启停和审计；不做训练、微调，也不自动形成监管结论。", {
    left: 160,
    top: 580,
    width: 960,
    height: 22,
  }, { fontSize: 17, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于PRD v12.0第3.3、6.2、7.2、10.3.6、12.3章节重绘模型管理架构。");
}

function slide19(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "试点前加固：把演示闭环升级为真实可用的生产治理能力", "03 核心功能体系", 19);
  const gates = [
    ["01", "闭环落库", "预警、风险事件、整改材料、复核结论和待办消息统一服务端持久化", C.blue],
    ["02", "真实认证与RBAC", "菜单、按钮、组织、字段、关系、证据和高危操作在服务端裁剪", C.green],
    ["03", "证据快照", "预警生成时冻结规则、图谱、映射、来源记录和附件元数据", C.amber],
    ["04", "统一审计", "发布、停用、解除、升级、复核、启停模型等高危操作留痕", C.violet],
    ["05", "性能与回滚", "证据子图P95、并发状态流转、备份恢复和场景版本停用机制", C.red],
  ];
  gates.forEach((g, i) => {
    const x = 92 + i * 226;
    addShape(slide, "ellipse", { left: x + 58, top: 154, width: 84, height: 84 }, g[3], {
      style: "solid",
      fill: g[3],
      width: 0,
    });
    addText(slide, g[0], { left: x + 58, top: 180, width: 84, height: 22 }, {
      fontSize: 18,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    addShape(slide, "roundRect", { left: x, top: 268, width: 200, height: 146 }, "#FFFFFF", {
      style: "solid",
      fill: g[3],
      width: 1.5,
    }, { borderRadius: 8 });
    addText(slide, g[1], { left: x + 18, top: 292, width: 164, height: 28 }, {
      fontSize: 20,
      bold: true,
      color: g[3],
      alignment: "center",
    });
    addText(slide, g[2], { left: x + 20, top: 334, width: 160, height: 56 }, {
      fontSize: 14,
      color: C.body,
      alignment: "center",
      lineSpacing: 1.1,
    });
    if (i < gates.length - 1) addRule(slide, x + 200, 196, x + 226, 196, C.line, 2);
  });
  const accept = ["上线范围冻结", "端到端闭环用例", "权限测试记录", "证据快照抽查", "性能测试记录", "回滚方案"];
  accept.forEach((a, i) => addPill(slide, a, 158 + i * 164, 498, 134, C.blue, "#FFFFFF"));
  addShape(slide, "roundRect", { left: 148, top: 580, width: 984, height: 44 }, C.deep, {
    style: "solid",
    fill: C.deep,
    width: 0,
  }, { borderRadius: 8 });
  addText(slide, "验收判断的是能否进入试点/生产使用，不是页面是否画完；P0问题必须100%通过。", {
    left: 178,
    top: 592,
    width: 924,
    height: 20,
  }, { fontSize: 17, bold: true, color: "#FFFFFF", alignment: "center" });
  addNotes(slide, "基于PRD v12.0第4.2、7.3、10.7、附录A/B章节重绘试点加固与验收架构。");
}


function coreSlide11(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "核心功能全景：以风险闭环组织平台能力", "03 核心功能体系", 11);
  addText(slide, "核心功能不按菜单堆砌，而是围绕“发现风险、解释原因、推动处置、复核关闭、沉淀样本”形成一条闭环能力链。", {
    left: 76,
    top: 128,
    width: 1030,
    height: 34,
  }, { fontSize: 23, bold: true, color: C.deep });

  const modules = [
    ["监管工作台", "角色化待办入口\n消息提醒与处置直达", C.blue],
    ["监管态势", "规模、等级、分布、趋势\n支持权限裁剪后下钻", C.cyan],
    ["风险管理", "统一预警负责研判\n风险事件负责整改复核", C.red],
    ["规则管理", "规则库、规则场景、规则目录\n沉淀可执行规则资产", C.violet],
    ["知识图谱", "结构、数据源、映射、生成\n支撑证据子图追溯", C.green],
    ["模型管理", "模型目录、接入测试\n场景绑定与调用审计", C.amber],
    ["系统管理", "组织、角色、权限、审计\n支撑生产可用", C.deep],
    ["运行运营", "版本冻结、样本回流\n效果复盘持续优化", "#475569"],
  ];
  modules.forEach((m, i) => {
    const x = 78 + (i % 4) * 286;
    const y = 198 + Math.floor(i / 4) * 148;
    addCard(slide, x, y, 246, 104, m[0], m[1], {
      accent: m[2],
      titleColor: m[2],
      titleSize: 21,
      bodySize: 15.5,
    });
  });

  const chain = [
    ["发现", "预警线索"],
    ["解释", "规则 + 图谱 + 证据"],
    ["处置", "升级事件 / 转派整改"],
    ["复核", "责任单位举证"],
    ["优化", "样本回流"],
  ];
  addShape(slide, "roundRect", { left: 92, top: 532, width: 1096, height: 72 }, C.deep, {
    style: "solid",
    fill: C.deep,
    width: 0,
  }, { borderRadius: 10 });
  chain.forEach((item, i) => {
    const x = 128 + i * 210;
    addShape(slide, "ellipse", { left: x, top: 546, width: 44, height: 44 }, i === 4 ? C.green : C.blue, {
      style: "solid",
      fill: i === 4 ? C.green : C.blue,
      width: 0,
    });
    addText(slide, String(i + 1), { left: x, top: 558, width: 44, height: 20 }, {
      fontSize: 15,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    addText(slide, item[0], { left: x + 54, top: 544, width: 96, height: 24 }, {
      fontSize: 19,
      bold: true,
      color: "#FFFFFF",
    });
    addText(slide, item[1], { left: x + 54, top: 570, width: 140, height: 18 }, {
      fontSize: 13.5,
      color: "#DDEBFF",
    });
    if (i < chain.length - 1) addRule(slide, x + 172, 568, x + 202, 568, "#7FB4FF", 2);
  });
  addNotes(slide, "基于当前工程 App.tsx 菜单结构、PRD v12.0 规则管理大版本更新版和用户最新口径重组核心功能体系。");
}

function coreSlide12(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "核心业务闭环：从规则命中到整改复核", "03 核心功能体系", 12);
  addText(slide, "平台的主链路不是单个页面流转，而是把规则版本、图谱版本、证据快照和责任流转绑定成同一条可追溯记录。", {
    left: 78,
    top: 130,
    width: 1040,
    height: 34,
  }, { fontSize: 23, bold: true, color: C.deep });
  const steps = [
    ["规则命中", "目标业务记录\n满足检测口径", C.violet],
    ["生成预警", "形成风险说明\n给出研判入口", C.blue],
    ["证据冻结", "规则、图谱、来源\n形成快照", C.green],
    ["人工研判", "解除、转派\n或升级", C.amber],
    ["升级事件", "指定责任组织\n生成整改待办", C.red],
    ["整改举证", "补充材料\n不覆盖初始事实", C.violet],
    ["监管复核", "通过、退回\n或不成立关闭", C.blue],
    ["样本回流", "有效/误报\n反哺规则模型", C.green],
  ];
  steps.forEach((s, i) => {
    const x = 86 + (i % 4) * 292;
    const y = 206 + Math.floor(i / 4) * 170;
    addShape(slide, "ellipse", { left: x, top: y + 20, width: 54, height: 54 }, s[2], {
      style: "solid",
      fill: s[2],
      width: 0,
    });
    addText(slide, String(i + 1).padStart(2, "0"), { left: x, top: y + 36, width: 54, height: 20 }, {
      fontSize: 15,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    addShape(slide, "roundRect", { left: x + 68, top: y, width: 192, height: 94 }, "#FFFFFF", {
      style: "solid",
      fill: s[2],
      width: 1.8,
    }, { borderRadius: 8 });
    addText(slide, s[0], { left: x + 84, top: y + 16, width: 160, height: 24 }, {
      fontSize: 19,
      bold: true,
      color: C.text,
      alignment: "center",
    });
    addText(slide, s[1], { left: x + 84, top: y + 46, width: 160, height: 36 }, {
      fontSize: 14.5,
      color: C.body,
      alignment: "center",
      lineSpacing: 1.08,
    });
    if (i % 4 < 3) addRule(slide, x + 260, y + 47, x + 292, y + 47, C.line, 2);
    if (i === 3) addRule(slide, 1100, y + 94, 1100, y + 170, C.line, 2);
  });
  addShape(slide, "roundRect", { left: 126, top: 570, width: 1028, height: 54 }, "#EAF7F0", {
    style: "solid",
    fill: "#AFE3C8",
    width: 1,
  }, { borderRadius: 8 });
  addText(slide, "闭环底线：历史证据快照只追加不覆盖；已发布规则、图谱和场景版本只读保留；高危操作全部进入审计。", {
    left: 154,
    top: 586,
    width: 972,
    height: 22,
  }, { fontSize: 18, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于 PRD v12.0 风险闭环、规则管理、知识图谱与审计要求重绘端到端业务链路。");
}

function coreSlide13(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "监管工作台：把风险监管转成角色化待办", "03 核心功能体系", 13);
  addText(slide, "工作台的设计重点不是再做一个汇总页，而是让不同角色进入系统后马上知道“哪些事归我、哪些事最急、下一步点哪里”。", {
    left: 78,
    top: 130,
    width: 1030,
    height: 34,
  }, { fontSize: 23, bold: true, color: C.deep });
  const cols = [
    ["角色视角", ["集团领导", "监管负责人", "领域专员", "业务责任人"], C.blue],
    ["任务组织", ["待研判预警", "待整改事件", "待复核事件", "逾期催办"], C.violet],
    ["消息触达", ["状态变化", "转派提醒", "复核退回", "关闭通知"], C.green],
    ["处置入口", ["查看证据", "研判解除", "升级事件", "整改复核"], C.red],
  ];
  cols.forEach((col, i) => {
    const x = 86 + i * 286;
    addShape(slide, "roundRect", { left: x, top: 208, width: 236, height: 56 }, col[2], {
      style: "solid",
      fill: col[2],
      width: 0,
    }, { borderRadius: 8 });
    addText(slide, col[0], { left: x + 16, top: 224, width: 204, height: 22 }, {
      fontSize: 21,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    col[1].forEach((item, j) => addPill(slide, item, x + 18, 292 + j * 52, 200, col[2], "#FFFFFF"));
    if (i < cols.length - 1) addRule(slide, x + 236, 392, x + 286, 392, C.line, 2);
  });
  addShape(slide, "roundRect", { left: 132, top: 552, width: 1016, height: 58 }, "#EAF2FF", {
    style: "solid",
    fill: "#B7D4FF",
    width: 1,
  }, { borderRadius: 9 });
  addText(slide, "设计原则：先责任后信息，先紧急后全部，先行动后统计；所有入口都能回到统一预警或风险事件详情。", {
    left: 160,
    top: 570,
    width: 960,
    height: 22,
  }, { fontSize: 18, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于当前工程 /workbench 页面、App.tsx 角色引导文案和用户关于监管工作台拆分的确认意见。");
}

async function coreSlide14(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "监管工作台功能：待办、消息和处置入口集中承接", "03 核心功能体系", 14);
  await addImage(slide, "image36.png", { left: 76, top: 134, width: 722, height: 410 }, {
    alt: "监管工作台产品截图",
    fit: "cover",
  });
  addCard(slide, 836, 144, 338, 90, "指标先行", "待研判、待整改、待复核、逾期事项作为进入系统后的第一判断。", { accent: C.blue, bodySize: 15.5 });
  addCard(slide, 836, 258, 338, 90, "待办承接", "列表按角色权限聚合任务，并提供查看、转派、处理等操作入口。", { accent: C.green, bodySize: 15.5 });
  addCard(slide, 836, 372, 338, 90, "消息联动", "业务消息同步风险状态变化，减少只看列表造成的漏办。", { accent: C.violet, bodySize: 15.5 });
  addShape(slide, "roundRect", { left: 142, top: 586, width: 996, height: 42 }, C.deep, {
    style: "solid",
    fill: C.deep,
    width: 0,
  }, { borderRadius: 8 });
  addText(slide, "页面讲法：先解释“工作台不是看板，而是任务入口”，再按指标、待办、消息三块说明日常使用路径。", {
    left: 170,
    top: 596,
    width: 940,
    height: 20,
  }, { fontSize: 16, bold: true, color: "#FFFFFF", alignment: "center" });
  addNotes(slide, "产品截图 image36.png；当前工程 /workbench 页面功能说明。");
}

async function coreSlide15(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "监管态势：从全局视角掌握风险规模与趋势", "03 核心功能体系", 15);
  await addImage(slide, "image39.png", { left: 78, top: 136, width: 696, height: 414 }, {
    alt: "监管态势产品截图",
    fit: "cover",
  });
  addMetric(slide, 812, 144, 150, "预警总量", "41", "近30天", C.blue);
  addMetric(slide, 984, 144, 150, "重大风险", "7", "重点关注", C.red);
  addMetric(slide, 812, 286, 150, "在办事件", "10", "未关闭", C.violet);
  addMetric(slide, 984, 286, 150, "闭环率", "0%", "试运行口径", C.green);
  addBulletList(slide, [
    "全局过滤条件驱动卡片、图表和明细同步刷新",
    "按组织、领域、等级、处置状态进行权限内下钻",
    "重点事项能直接跳转到统一预警或风险事件详情",
  ], 820, 442, 360, 116, { fontSize: 16, lineH: 34 });
  addNotes(slide, "产品截图 image39.png；当前工程 /situation 页面和监管态势交互文档。");
}

function coreSlide16(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "风险管理总览：统一预警负责研判，风险事件负责整改", "03 核心功能体系", 16);
  addText(slide, "风险管理建议作为一组能力呈现：预警解决“线索是否成立”，事件解决“责任如何落实”。两者不是两个孤立列表，而是一条升级与关闭链路。", {
    left: 78,
    top: 128,
    width: 1060,
    height: 48,
  }, { fontSize: 22, bold: true, color: C.deep });
  addCard(slide, 96, 222, 402, 220, "统一预警", "集中承接规则和模型识别出的风险线索，展示风险说明、命中规则、证据子图和处置记录；研判结果可以解除、转派或升级。", {
    accent: C.blue,
    titleSize: 25,
    bodySize: 17,
  });
  addCard(slide, 782, 222, 402, 220, "风险事件", "承接已升级预警，围绕责任组织、整改时限、举证材料、复核结论和关闭状态推进闭环。", {
    accent: C.green,
    titleSize: 25,
    bodySize: 17,
  });
  addRule(slide, 498, 332, 782, 332, C.red, 4);
  addText(slide, "升级", { left: 588, top: 298, width: 104, height: 28 }, {
    fontSize: 22,
    bold: true,
    color: C.red,
    alignment: "center",
  });
  const states = [
    ["待研判", 150, 498, C.blue], ["已解除", 330, 498, C.muted], ["已升级", 510, 498, C.red],
    ["待整改", 700, 498, C.amber], ["待复核", 880, 498, C.violet], ["已关闭", 1060, 498, C.green],
  ];
  states.forEach((s, i) => {
    addShape(slide, "roundRect", { left: s[1] - 58, top: s[2], width: 116, height: 42 }, i === 2 || i === 5 ? s[3] : "#FFFFFF", {
      style: "solid",
      fill: s[3],
      width: 1.5,
    }, { borderRadius: 8 });
    addText(slide, s[0], { left: s[1] - 50, top: s[2] + 12, width: 100, height: 18 }, {
      fontSize: 16,
      bold: true,
      color: i === 2 || i === 5 ? "#FFFFFF" : C.text,
      alignment: "center",
    });
    if (i < states.length - 1) addRule(slide, s[1] + 58, s[2] + 21, states[i + 1][1] - 58, s[2] + 21, C.line, 2);
  });
  addNotes(slide, "基于当前工程 /risk/warnings、/risk/events 页面和用户确认的风险管理三页拆分口径。");
}

async function coreSlide17(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "统一预警：集中发现、解释和研判风险线索", "03 核心功能体系", 17);
  await addImage(slide, "image44.png", { left: 74, top: 132, width: 744, height: 420 }, {
    alt: "统一预警列表截图",
    fit: "cover",
  });
  addCard(slide, 852, 138, 324, 82, "统一查询", "按组织、领域、等级、状态、时间等维度筛选线索。", { accent: C.blue, bodySize: 15 });
  addCard(slide, 852, 244, 324, 82, "风险解释", "列表保留风险描述、主对象、命中规则和证据入口。", { accent: C.green, bodySize: 15 });
  addCard(slide, 852, 350, 324, 82, "研判动作", "进入详情后完成查看证据、解除、转派或升级事件。", { accent: C.red, bodySize: 15 });
  addCard(slide, 852, 456, 324, 82, "留痕要求", "高危操作需原因、权限校验与审计。", { accent: C.violet, bodySize: 15 });
  addNotes(slide, "产品截图 image44.png；当前工程 /risk/warnings 页面与风险监管交互文档。");
}

async function coreSlide18(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "风险事件：围绕责任单位推进整改和复核", "03 核心功能体系", 18);
  await addImage(slide, "image52.png", { left: 76, top: 132, width: 752, height: 424 }, {
    alt: "风险事件详情截图",
    fit: "cover",
  });
  addCard(slide, 862, 140, 320, 88, "事实固化", "风险事实引用来源预警升级时的证据快照。", { accent: C.red, bodySize: 15.5 });
  addCard(slide, 862, 252, 320, 88, "责任闭环", "围绕责任组织、当前处理人、截止时间推进整改。", { accent: C.amber, bodySize: 15.5 });
  addCard(slide, 862, 364, 320, 88, "复核关闭", "监管侧可通过、退回整改或判定不成立关闭。", { accent: C.green, bodySize: 15.5 });
  addCard(slide, 862, 476, 320, 88, "证据追加", "整改材料作为新增证据保存，不覆盖初始风险事实。", { accent: C.violet, bodySize: 15.5 });
  addNotes(slide, "产品截图 image52.png；当前工程 /risk/events 详情页和风险监管交互文档。");
}

function coreSlide19(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "规则管理：把监管制度转化为可执行规则资产", "03 核心功能体系", 19);
  addText(slide, "规则管理的设计理念是“制度条款不直接等于系统规则”：需要先形成业务口径，再落成可校验、可试跑、可发布、可复用的规则资产。", {
    left: 78,
    top: 128,
    width: 1050,
    height: 46,
  }, { fontSize: 22, bold: true, color: C.deep });
  const steps = [
    ["制度条款", "监管依据、管理办法\n检查要点", C.deep],
    ["业务口径", "主对象、触发时点\n例外边界", C.blue],
    ["规则表达", "条件组、字段值\n阈值和比较关系", C.violet],
    ["试跑校验", "样本命中、误报\n证据完整性", C.amber],
    ["发布复用", "规则版本、引用关系\n审计留痕", C.green],
  ];
  steps.forEach((s, i) => {
    const x = 92 + i * 224;
    addShape(slide, "ellipse", { left: x + 52, top: 220, width: 78, height: 78 }, s[2], {
      style: "solid",
      fill: s[2],
      width: 0,
    });
    addText(slide, String(i + 1), { left: x + 52, top: 246, width: 78, height: 24 }, {
      fontSize: 20,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    addCard(slide, x, 336, 184, 126, s[0], s[1], { accent: s[2], titleSize: 20, bodySize: 15.5 });
    if (i < steps.length - 1) addRule(slide, x + 184, 258, x + 224, 258, C.line, 2);
  });
  addShape(slide, "roundRect", { left: 142, top: 548, width: 996, height: 58 }, "#FFF7EA", {
    style: "solid",
    fill: "#FFD9A5",
    width: 1,
  }, { borderRadius: 9 });
  addText(slide, "核心口径：规则管理是能力中心模块；内部再用规则库、规则场景、规则目录组织资产，不再把“场景与规则”作为独立模块名称。", {
    left: 170,
    top: 564,
    width: 940,
    height: 26,
  }, { fontSize: 17.5, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于 PRD v12.0 规则管理大版本更新版、规则管理交互文档_重构版和用户最新口径。");
}

function coreSlide20(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "规则管理功能：规则库、规则场景和规则目录分层组织", "03 核心功能体系", 20);
  addText(slide, "规则管理页建议先讲组织方式，再讲配置细节：规则库负责分类，规则场景承载业务上下文，规则目录定位具体风险主题，风险规则沉淀可执行逻辑。", {
    left: 78,
    top: 126,
    width: 1056,
    height: 48,
  }, { fontSize: 22, bold: true, color: C.deep });

  addShape(slide, "roundRect", { left: 88, top: 214, width: 250, height: 310 }, "#F4F8FF", {
    style: "solid",
    fill: "#B7D4FF",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "规则库", { left: 114, top: 238, width: 198, height: 28 }, { fontSize: 24, bold: true, color: C.blue, alignment: "center" });
  ["采购监管规则库", "合同监管规则库", "财务资金规则库", "投资合规规则库"].forEach((item, i) => addPill(slide, item, 116, 302 + i * 48, 194, C.blue, "#FFFFFF"));

  addShape(slide, "roundRect", { left: 514, top: 214, width: 250, height: 310 }, "#F7F2FF", {
    style: "solid",
    fill: "#D6CCFF",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "规则场景", { left: 540, top: 238, width: 198, height: 28 }, { fontSize: 24, bold: true, color: C.violet, alignment: "center" });
  ["供应商异常关联", "合同付款不一致", "投资决策合规", "账户异常使用"].forEach((item, i) => addPill(slide, item, 542, 302 + i * 48, 194, C.violet, "#FFFFFF"));

  addShape(slide, "roundRect", { left: 894, top: 214, width: 250, height: 310 }, "#EAF7F0", {
    style: "solid",
    fill: "#AFE3C8",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "规则目录 / 风险规则", { left: 914, top: 238, width: 210, height: 28 }, { fontSize: 23, bold: true, color: C.green, alignment: "center" });
  ["关联关系识别", "异常阈值判断", "制度依据绑定", "证据要求配置"].forEach((item, i) => addPill(slide, item, 922, 302 + i * 48, 194, C.green, "#FFFFFF"));

  addRule(slide, 338, 370, 514, 370, C.line, 3);
  addRule(slide, 764, 370, 894, 370, C.line, 3);
  addText(slide, "选择分类", { left: 360, top: 338, width: 120, height: 22 }, { fontSize: 16, bold: true, color: C.muted, alignment: "center" });
  addText(slide, "进入目录", { left: 780, top: 338, width: 100, height: 22 }, { fontSize: 16, bold: true, color: C.muted, alignment: "center" });
  addShape(slide, "roundRect", { left: 150, top: 584, width: 980, height: 40 }, C.deep, {
    style: "solid",
    fill: C.deep,
    width: 0,
  }, { borderRadius: 8 });
  addText(slide, "页面讲法：先从左侧树讲清“为什么分层”，再进入具体目录说明风险规则的配置、发布和引用。", {
    left: 178,
    top: 594,
    width: 924,
    height: 18,
  }, { fontSize: 16, bold: true, color: "#FFFFFF", alignment: "center" });
  addNotes(slide, "基于当前工程 /rules 页面、RuleAssetPages.tsx 和规则管理交互文档_重构版。");
}

function coreSlide21(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "风险规则配置：让检测口径、表达式和证据同源", "03 核心功能体系", 21);
  addText(slide, "单条风险规则要同时回答业务人员和系统两个问题：业务上为什么算风险，系统上如何稳定执行，并且命中后需要保存哪些证据。", {
    left: 78,
    top: 126,
    width: 1050,
    height: 44,
  }, { fontSize: 22, bold: true, color: C.deep });

  addShape(slide, "roundRect", { left: 78, top: 196, width: 250, height: 360 }, "#F4F8FF", {
    style: "solid",
    fill: "#B7D4FF",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "图谱字段面板", { left: 104, top: 218, width: 198, height: 28 }, { fontSize: 22, bold: true, color: C.blue, alignment: "center" });
  ["供应商.credit_code", "供应商.phone", "评审人员.phone", "合同.change_rate", "中标确认.occurred_at"].forEach((item, i) => addPill(slide, item, 108, 274 + i * 48, 190, C.blue, "#FFFFFF"));

  addShape(slide, "roundRect", { left: 374, top: 196, width: 474, height: 360 }, "#FFFFFF", {
    style: "solid",
    fill: C.line,
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "规则主体", { left: 408, top: 218, width: 160, height: 28 }, { fontSize: 22, bold: true, color: C.deep });
  addCard(slide, 408, 268, 188, 82, "检测口径", "供应商与评审人员联系方式一致", { accent: C.violet, titleSize: 18, bodySize: 14.5 });
  addCard(slide, 624, 268, 188, 82, "表达式", "AND：字段相等 + 时间有效", { accent: C.violet, titleSize: 18, bodySize: 14.5 });
  addCard(slide, 408, 384, 188, 82, "命中输出", "等级、说明模板、目标对象", { accent: C.red, titleSize: 18, bodySize: 14.5 });
  addCard(slide, 624, 384, 188, 82, "试跑校验", "样本、命中、误报原因", { accent: C.amber, titleSize: 18, bodySize: 14.5 });

  addShape(slide, "roundRect", { left: 894, top: 196, width: 300, height: 360 }, "#EAF7F0", {
    style: "solid",
    fill: "#AFE3C8",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "依据与证据", { left: 926, top: 218, width: 236, height: 28 }, { fontSize: 22, bold: true, color: C.green, alignment: "center" });
  ["制度依据：条款、文件、有效期", "证据要求：来源记录、字段值", "例外范围：白名单、不适用", "发布校验：权限、原因、审计"].forEach((item, i) => addPill(slide, item, 930, 286 + i * 56, 228, C.green, "#FFFFFF"));
  addRule(slide, 328, 374, 374, 374, C.line, 2);
  addRule(slide, 848, 374, 894, 374, C.line, 2);
  addNotes(slide, "基于当前工程 RuleAssetPages.tsx 风险规则编辑器、PRD v12.0 规则管理章节和规则管理交互文档_重构版。");
}

function coreSlide22(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "知识图谱一：图谱结构与数据源构成穿透底座", "03 核心功能体系", 22);
  addText(slide, "知识图谱不是单张关系图，而是由图谱结构、数据源、字段映射和校验结果共同构成的语义底座。先定义结构，再让来源字段稳定落到结构上。", {
    left: 78,
    top: 126,
    width: 1056,
    height: 48,
  }, { fontSize: 22, bold: true, color: C.deep });
  addCard(slide, 82, 210, 320, 254, "图谱结构版本", "定义类、属性、关系和事件，区分平台基础图谱与领域扩展图谱；已发布版本只读，变更需要复制新版本。", { accent: C.blue, titleSize: 24, bodySize: 17 });
  const structItems = [["类", "组织/人员/供应商"], ["属性", "主标识/发生时间"], ["关系", "控制/任职/交易"], ["事件", "采购立项/中标确认"]];
  structItems.forEach((it, i) => addPill(slide, it[0] + "：" + it[1], 118, 340 + i * 42, 248, C.blue, "#FFFFFF"));

  addCard(slide, 478, 210, 320, 254, "数据源与字段映射", "登记来源系统、连接方式、数据范围和同步方式；字段映射把来源字段落到目标图谱属性，并形成可校验映射版本。", { accent: C.amber, titleSize: 24, bodySize: 17 });
  ["来源登记", "结构解析", "字段映射", "校验启用"].forEach((item, i) => addPill(slide, item, 536 + (i % 2) * 126, 372 + Math.floor(i / 2) * 54, 108, C.amber, "#FFFFFF"));

  addCard(slide, 874, 210, 320, 254, "规则与证据引用", "规则配置选择图谱字段；预警生成后证据子图冻结结构版本、映射快照和来源记录。", { accent: C.green, titleSize: 24, bodySize: 17 });
  ["规则字段", "证据子图", "版本快照", "来源追溯"].forEach((item, i) => addPill(slide, item, 932 + (i % 2) * 126, 372 + Math.floor(i / 2) * 54, 108, C.green, "#FFFFFF"));
  addRule(slide, 402, 336, 478, 336, C.line, 2);
  addRule(slide, 798, 336, 874, 336, C.line, 2);
  addShape(slide, "roundRect", { left: 160, top: 568, width: 960, height: 48 }, "#EAF2FF", {
    style: "solid",
    fill: "#B7D4FF",
    width: 1,
  }, { borderRadius: 8 });
  addText(slide, "讲解重点：图谱结构决定“能表达什么”，数据源和映射决定“事实从哪里来”，证据引用决定“风险能否回溯”。", {
    left: 188,
    top: 582,
    width: 904,
    height: 20,
  }, { fontSize: 17, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "基于当前工程 /graphs/structures、/graphs/sources、dataGraphApi.js 和知识图谱交互文档_完善版。");
}

function coreSlide23(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "知识图谱二：生成、发布与证据引用保证可追溯", "03 核心功能体系", 23);
  addText(slide, "生成和发布阶段要固化三类快照：结构版本、来源映射、构建结果。预警引用的是当时的图谱版本，后续图谱更新不能覆盖历史证据。", {
    left: 78,
    top: 126,
    width: 1060,
    height: 48,
  }, { fontSize: 22, bold: true, color: C.deep });
  addProcess(slide, [
    { title: "选择结构", body: "已发布图谱结构" },
    { title: "选择数据源", body: "启用且映射有效" },
    { title: "依赖检查", body: "必填字段与质量门禁" },
    { title: "构建生成", body: "节点、关系、事件实例" },
    { title: "发布归档", body: "图谱版本只读引用" },
    { title: "证据引用", body: "预警生成时冻结" },
  ], 84, 188, 1112);

  const nodes = [
    ["供应商", 398, 470, C.blue], ["联系人", 548, 424, C.violet], ["评审人员", 710, 470, C.red], ["采购项目", 548, 532, C.green], ["证据记录", 710, 562, C.amber],
  ];
  addText(slide, "证据子图引用示意", { left: 132, top: 452, width: 210, height: 28 }, { fontSize: 22, bold: true, color: C.deep });
  addText(slide, "只截取本次风险相关的有限事实、关系路径、来源记录和版本快照。", { left: 132, top: 488, width: 210, height: 56 }, { fontSize: 16, color: C.body, lineSpacing: 1.1 });
  addRule(slide, 474, 508, 548, 462, C.line, 2);
  addRule(slide, 624, 462, 710, 508, C.red, 2);
  addRule(slide, 474, 508, 548, 570, C.line, 2);
  addRule(slide, 624, 570, 710, 594, C.line, 2);
  nodes.forEach((n) => {
    addShape(slide, "ellipse", { left: n[1], top: n[2], width: 76, height: 76 }, "#FFFFFF", {
      style: "solid",
      fill: n[3],
      width: 2,
    });
    addText(slide, n[0], { left: n[1] + 8, top: n[2] + 26, width: 60, height: 20 }, {
      fontSize: 14.5,
      bold: true,
      color: C.text,
      alignment: "center",
    });
  });
  addShape(slide, "roundRect", { left: 884, top: 450, width: 270, height: 110 }, "#FFF7EA", {
    style: "solid",
    fill: "#FFD9A5",
    width: 1,
  }, { borderRadius: 8 });
  addText(slide, "发布约束", { left: 914, top: 472, width: 210, height: 26 }, { fontSize: 22, bold: true, color: C.amber, alignment: "center" });
  addText(slide, "版本不可原地修改；被预警、规则或事件引用后只能复制新版本。", { left: 914, top: 506, width: 210, height: 36 }, { fontSize: 15.5, color: C.deep, alignment: "center", lineSpacing: 1.1 });
  addNotes(slide, "基于当前工程 GraphCreateWizard.tsx、OntologyLocalPages.tsx、dataGraphApi.js 和知识图谱交互文档_完善版。");
}

function coreSlide25(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "系统管理：权限、组织和审计支撑生产可用", "03 核心功能体系", 25);
  addText(slide, "系统管理不是后台附属功能，而是平台进入试点和生产的治理底座：谁能看、谁能改、谁来负责、每次高危操作如何追溯，都在这里落地。", {
    left: 78,
    top: 126,
    width: 1060,
    height: 48,
  }, { fontSize: 22, bold: true, color: C.deep });
  const blocks = [
    ["用户与组织", "账号状态、所属组织、角色分配、待办转派", C.blue],
    ["角色与权限", "菜单权限、数据范围、字段关系与高危操作", C.violet],
    ["审计日志", "操作人、对象类型、结果、风险级别、追踪编号", C.green],
    ["运行安全", "认证、服务端 RBAC、幂等、备份恢复", C.red],
  ];
  blocks.forEach((b, i) => {
    const x = 94 + i * 286;
    addCard(slide, x, 228, 236, 180, b[0], b[1], { accent: b[2], titleColor: b[2], titleSize: 23, bodySize: 17 });
    addShape(slide, "ellipse", { left: x + 78, top: 452, width: 80, height: 80 }, b[2], {
      style: "solid",
      fill: b[2],
      width: 0,
    });
    addText(slide, String(i + 1).padStart(2, "0"), { left: x + 78, top: 478, width: 80, height: 24 }, {
      fontSize: 20,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    if (i < blocks.length - 1) addRule(slide, x + 236, 318, x + 286, 318, C.line, 2);
  });
  addShape(slide, "roundRect", { left: 132, top: 584, width: 1016, height: 44 }, C.deep, {
    style: "solid",
    fill: C.deep,
    width: 0,
  }, { borderRadius: 8 });
  addText(slide, "生产口径：权限在服务端裁剪，审计记录不可被普通业务操作覆盖，高危动作需要原因、确认和可追溯编号。", {
    left: 162,
    top: 596,
    width: 956,
    height: 20,
  }, { fontSize: 17, bold: true, color: "#FFFFFF", alignment: "center" });
  addNotes(slide, "基于当前工程 /system/users、/system/roles、/system/audit 页面和 PRD v12.0 上线验收、权限审计要求。");
}

function slide20(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "五类场景共享同一套图谱与闭环底座", "04 典型应用场景", 20);
  const rows = [
    ["业务域", "目标业务记录", "关键关系", "识别结果"],
    ["采购", "供应商 / 中标记录", "供应商-人员-历史项目-交易协同", "异常关联、围串标、采购方式风险"],
    ["合同", "合同 / 付款记录", "合同-验收-发票-付款-账户", "签订审批、履约异常、付款不一致"],
    ["财务司库", "账户 / 资金执行记录", "账户-主体-合同-资金流水", "账户异常、资金沉淀、付款执行风险"],
    ["投资资产", "投资立项 / 审批记录", "授权-会议-主业-资金-资产", "决策合规、担保链、产权与闲置"],
    ["人事关联", "任职 / 关键岗位记录", "人员-组织-岗位-供应商", "任职回避、关键岗位、关联关系"],
  ];
  const x = 80;
  const y = 140;
  const rowH = 68;
  const widths = [132, 244, 394, 344];
  rows.forEach((row, r) => {
    let cx = x;
    row.forEach((cell, c) => {
      const fill = r === 0 ? C.blue : r % 2 === 0 ? "#F2F7FF" : C.surface;
      addShape(slide, "rect", { left: cx, top: y + r * rowH, width: widths[c], height: rowH }, fill, {
        style: "solid",
        fill: C.line,
        width: 1,
      });
      addText(slide, cell, { left: cx + 14, top: y + r * rowH + 18, width: widths[c] - 28, height: 34 }, {
        fontSize: r === 0 ? 17 : 15,
        bold: r === 0 || c === 0,
        color: r === 0 ? "#FFFFFF" : C.text,
        alignment: c === 0 ? "center" : "left",
      });
      cx += widths[c];
    });
  });
  addNotes(slide, "用户提供原始PPT第47页五类典型应用场景表格。");
}

function slide21(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "场景一：供应商异常关联沿主体关系解释风险", "04 典型应用场景", 21);
  addCard(slide, 76, 154, 276, 128, "场景触发", "中标记录、报名信息、联系人、收款账户触发主标识对齐。", {
    accent: C.blue,
    bodySize: 16,
  });
  addCard(slide, 76, 334, 276, 138, "穿透识别", "股权、任职、共址、历史交易等路径按规则命中。", {
    accent: C.violet,
    bodySize: 16,
  });
  addCard(slide, 928, 154, 276, 128, "研判解释", "展示关系路径、规则依据、证据快照和风险等级。", {
    accent: C.red,
    bodySize: 16,
  });
  addCard(slide, 928, 334, 276, 138, "闭环处置", "解除、升级事件、派单整改、复核关闭，形成样本回流。", {
    accent: C.green,
    bodySize: 16,
  });

  addShape(slide, "roundRect", { left: 390, top: 146, width: 500, height: 436 }, C.surface, {
    style: "solid",
    fill: C.line,
    width: 1,
  }, { borderRadius: 12 });
  addText(slide, "主体关系路径", { left: 420, top: 168, width: 220, height: 26 }, {
    fontSize: 20,
    bold: true,
    color: C.deep,
  });
  addText(slide, "先解释“谁与谁有关”，再判断“是否构成风险”。", { left: 612, top: 171, width: 238, height: 22 }, {
    fontSize: 14,
    color: C.body,
    alignment: "right",
  });

  addRule(slide, 560, 320, 512, 266, C.violet, 2);
  addRule(slide, 720, 320, 772, 266, C.violet, 2);
  addRule(slide, 560, 420, 512, 472, C.green, 2);
  addRule(slide, 720, 420, 772, 472, C.green, 2);

  addShape(slide, "ellipse", { left: 560, top: 302, width: 160, height: 160 }, C.blue, {
    style: "solid",
    fill: C.blue,
    width: 0,
  });
  addText(slide, "供应商\n主标识", { left: 580, top: 350, width: 120, height: 46 }, {
    fontSize: 22,
    bold: true,
    color: "#FFFFFF",
    alignment: "center",
  });
  const nodes = [
    ["股东 / 控制人", 430, 216, C.violet],
    ["联系人", 696, 216, C.violet],
    ["员工 / 专家", 430, 472, C.green],
    ["历史项目", 696, 472, C.green],
  ];
  nodes.forEach(([label, x, y, color]) => {
    addShape(slide, "roundRect", { left: x, top: y, width: 154, height: 84 }, "#FFFFFF", {
      style: "solid",
      fill: color,
      width: 3,
    }, { borderRadius: 14 });
    addText(slide, label, { left: x + 12, top: y + 27, width: 130, height: 30 }, {
      fontSize: 18,
      bold: true,
      color: C.text,
      alignment: "center",
    });
  });
  addShape(slide, "roundRect", { left: 258, top: 604, width: 764, height: 44 }, "#EAF7F0", {
    style: "solid",
    fill: "#AFE3C8",
    width: 1,
  }, { borderRadius: 8 });
  addText(slide, "输出结果：可追溯的关系路径、命中规则、证据快照和闭环处置记录。", {
    left: 290,
    top: 604,
    width: 700,
    height: 44,
  }, { fontSize: 20, bold: true, color: C.deep, alignment: "center", verticalAlignment: "middle" });
  addNotes(slide, "用户提供原始PPT第48页供应商异常关联场景。");
}

function slide22(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "场景二：合同履约与付款不一致形成同一证据链", "04 典型应用场景", 22);
  const stages = [
    ["合同", "版本与审批链\n付款计划与约定条件"],
    ["验收 / 入库", "履约进度与验收事实\n签收与时间记录"],
    ["发票", "开票金额与收款主体\n发票状态与关联合同"],
    ["付款", "付款金额、时间与流水\n账户与主体主数据"],
  ];
  stages.forEach((s, i) => {
    const x = 92 + i * 282;
    addCard(slide, x, 164, 230, 178, s[0], s[1], {
      accent: [C.blue, C.green, C.amber, C.red][i],
      titleSize: 24,
      bodySize: 17,
    });
    if (i < stages.length - 1) addRule(slide, x + 230, 253, x + 282, 253, C.line, 3);
  });
  addShape(slide, "roundRect", { left: 112, top: 418, width: 1056, height: 76 }, "#FFF1F2", {
    style: "solid",
    fill: "#FECACA",
    width: 1,
  }, { borderRadius: 10 });
  addText(slide, "识别信号：付款无验收、累计付款超约定、付款进度与履约不一致、账户与合同主体不一致", {
    left: 146,
    top: 442,
    width: 988,
    height: 28,
  }, { fontSize: 20, bold: true, color: C.deep, alignment: "center" });
  addProcess(slide, [
    { title: "预警研判", body: "" },
    { title: "升级事件", body: "" },
    { title: "补充材料 / 纠正付款", body: "" },
    { title: "复核关闭", body: "" },
  ], 214, 500, 852, { line: "#BDD4F5" });
  addNotes(slide, "用户提供原始PPT第49页合同履约与付款不一致场景。");
}

function slide23(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "场景三：投资决策合规用授权边界校验全过程", "04 典型应用场景", 23);
  addProcess(slide, [
    { title: "立项", body: "项目主体、主业分类" },
    { title: "论证", body: "尽调评估、关键材料" },
    { title: "审批", body: "授权边界、会议决策" },
    { title: "执行", body: "预算安排、资金执行" },
  ], 120, 164, 1040);
  const evidences = [
    ["授权", "组织授权清单与版本"],
    ["会议", "纪要、议题与审批链"],
    ["主业", "分类、项目主体与关联方"],
    ["资金", "预算安排与执行记录"],
  ];
  evidences.forEach((e, i) => addCard(slide, 96 + i * 286, 420, 238, 94, e[0], e[1], {
    accent: [C.blue, C.green, C.amber, C.violet][i],
    titleSize: 21,
    bodySize: 16,
  }));
  addShape(slide, "roundRect", { left: 170, top: 570, width: 940, height: 52 }, "#FFF1F2", {
    style: "solid",
    fill: "#FECACA",
    width: 1,
  }, { borderRadius: 8 });
  addText(slide, "识别信号：越权审批、决策材料缺失、记录不一致、非主业投资、关联方风险。", {
    left: 196,
    top: 584,
    width: 888,
    height: 22,
  }, { fontSize: 18, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "用户提供原始PPT第50页投资决策合规场景。");
}

function slide24(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "不同场景复用同一条事实-证据-处置闭环", "04 典型应用场景", 24);
  addProcess(slide, [
    { title: "数据接入", body: "冻结来源与范围" },
    { title: "图谱关联", body: "统一主体与语义" },
    { title: "规则命中", body: "引用场景版本" },
    { title: "预警研判", body: "人工解除或升级" },
    { title: "整改复核", body: "举证、通过或退回" },
    { title: "样本回流", body: "形成效果样本" },
  ], 76, 178, 1128);
  addCard(slide, 134, 506, 430, 78, "证据快照", "有限事实 + 来源记录 + 版本快照", {
    accent: C.green,
    bodySize: 18,
  });
  addCard(slide, 716, 506, 430, 78, "规则复用", "效果样本回流，复制新版本继续优化", {
    accent: C.blue,
    bodySize: 18,
  });
  addNotes(slide, "用户提供原始PPT第51页关于不同场景共享同一条闭环的表述。");
}

function slide25(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "四阶段推进试点并复制到集团", "05 建设实施与应用价值", 25);
  addProcess(slide, [
    { title: "基础加固", body: "闭环落库、真实认证、RBAC、证据快照、审计与性能" },
    { title: "场景共创", body: "确认本体、主标识、映射范围、阈值、例外和证据" },
    { title: "试运行", body: "接入真实或脱敏数据，完成预警、整改、复核和效果样本" },
    { title: "复制运营", body: "复用本体、映射、规则和场景版本，扩展组织与领域" },
  ], 96, 178, 1088);
  addShape(slide, "roundRect", { left: 140, top: 530, width: 1000, height: 62 }, C.blue, {
    style: "solid",
    fill: C.blue,
    width: 0,
  }, { borderRadius: 8 });
  addText(slide, "试点不是单点上线，而是沉淀可复制的监管资产和运营机制。", {
    left: 168,
    top: 548,
    width: 944,
    height: 26,
  }, { fontSize: 22, bold: true, color: "#FFFFFF", alignment: "center" });
  addNotes(slide, "用户提供原始PPT第54页四阶段推进试点与集团复制内容。");
}

function slide26(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "试点启动先锁定六类边界", "05 建设实施与应用价值", 26);
  const items = [
    ["试点单位", "组织层级、角色与用户范围"],
    ["重点场景", "一至三个目标业务事件"],
    ["数据来源", "接入方式、频率与责任"],
    ["规则证据", "阈值、例外、制度与证据要求"],
    ["技术边界", "部署、权限与性能"],
    ["启动建议", "优先联合梳理三类场景"],
  ];
  items.forEach((it, i) => {
    const x = 106 + (i % 3) * 356;
    const y = 150 + Math.floor(i / 3) * 190;
    addShape(slide, "ellipse", { left: x + 106, top: y, width: 120, height: 120 }, "#FFFFFF", {
      style: "solid",
      fill: [C.blue, C.green, C.amber, C.violet, C.red, C.deep][i],
      width: 3,
    });
    addText(slide, it[0], { left: x + 48, top: y + 138, width: 236, height: 30 }, {
      fontSize: 22,
      bold: true,
      color: [C.blue, C.green, C.amber, C.violet, C.red, C.deep][i],
      alignment: "center",
    });
    addText(slide, it[1], { left: x + 34, top: y + 174, width: 264, height: 44 }, {
      fontSize: 17,
      color: C.body,
      alignment: "center",
    });
  });
  addNotes(slide, "用户提供原始PPT第55页小范围试点形成复制能力的六类启动边界。");
}

function slide27(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "应用价值从“看见问题”升级为“穿透、闭环、复用”", "05 建设实施与应用价值", 27);
  const rows = [
    ["治理模式", "报表抽查", "在线穿透"],
    ["技术底座", "分散系统", "云数智一体"],
    ["监管能力", "单点检查", "四全贯通"],
    ["运营方式", "事后处置", "持续优化"],
  ];
  rows.forEach((r, i) => {
    const y = 160 + i * 92;
    addText(slide, r[0], { left: 110, top: y + 16, width: 160, height: 28 }, {
      fontSize: 20,
      bold: true,
      color: C.text,
    });
    addShape(slide, "roundRect", { left: 320, top: y, width: 270, height: 62 }, "#F1F5F9", {
      style: "solid",
      fill: C.line,
      width: 1,
    }, { borderRadius: 8 });
    addText(slide, r[1], { left: 340, top: y + 18, width: 230, height: 24 }, {
      fontSize: 19,
      color: C.body,
      alignment: "center",
    });
    addRule(slide, 620, y + 31, 690, y + 31, C.blue, 3);
    addShape(slide, "roundRect", { left: 720, top: y, width: 340, height: 62 }, "#EAF2FF", {
      style: "solid",
      fill: "#B7D4FF",
      width: 1,
    }, { borderRadius: 8 });
    addText(slide, r[2], { left: 740, top: y + 18, width: 300, height: 24 }, {
      fontSize: 20,
      bold: true,
      color: C.blue,
      alignment: "center",
    });
  });
  addText(slide, "价值不是一次性大屏，而是形成可解释、可复核、可追责、可复制的监管运行能力。", {
    left: 110,
    top: 566,
    width: 1040,
    height: 30,
  }, { fontSize: 22, bold: true, color: C.deep, alignment: "center" });
  addNotes(slide, "用户提供原始PPT第53页应用价值内容。");
}

function slide28(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, "下一步：先跑通高价值场景，再形成可复制方案", "收束与行动", 28);
  addText(slide, "建议用 1 个试点单位、1-3 个场景完成闭环验证，再扩大组织和领域范围。", {
    left: 92,
    top: 132,
    width: 1000,
    height: 42,
  }, { fontSize: 25, bold: true, color: C.deep });
  const items = [
    ["1", "确定试点范围", "明确试点组织、角色、数据来源和系统边界。"],
    ["2", "共创监管场景", "优先选择采购异常关联、合同付款不一致、投资决策合规。"],
    ["3", "跑通闭环样本", "完成预警生成、研判、升级、整改、复核和关闭。"],
    ["4", "固化复制资产", "沉淀本体、映射、规则、证据要求和运营复盘机制。"],
  ];
  items.forEach((it, i) => {
    const y = 230 + i * 90;
    addShape(slide, "ellipse", { left: 118, top: y, width: 50, height: 50 }, i === 3 ? C.green : C.blue, {
      style: "solid",
      fill: i === 3 ? C.green : C.blue,
      width: 0,
    });
    addText(slide, it[0], { left: 118, top: y + 13, width: 50, height: 24 }, {
      fontSize: 18,
      bold: true,
      color: "#FFFFFF",
      alignment: "center",
    });
    addText(slide, it[1], { left: 204, top: y - 2, width: 280, height: 32 }, {
      fontSize: 22,
      bold: true,
      color: C.text,
    });
    addText(slide, it[2], { left: 520, top: y + 2, width: 590, height: 30 }, {
      fontSize: 18,
      color: C.body,
    });
  });
  addShape(slide, "roundRect", { left: 168, top: 622, width: 944, height: 44 }, C.deep, {
    style: "solid",
    fill: C.deep,
    width: 0,
  }, { borderRadius: 8 });
  addText(slide, "把监管要求落成可运行系统，把试点结果沉淀为集团复制能力。", {
    left: 190,
    top: 634,
    width: 900,
    height: 20,
  }, { fontSize: 18, bold: true, color: "#FFFFFF", alignment: "center" });
  addNotes(slide, "用户提供原始PPT第53-55页关于应用价值、推进阶段和启动建议的内容。");
}


const TALK_TRACKS = {
  "1": "开场先说明这套材料的定位：不是单纯展示界面，而是说明穿透式监管平台如何把多系统事实转成可解释预警、证据链和整改闭环。建议用一句话点出平台价值：让监管从“看见问题”进一步走到“解释问题、推动处置、沉淀能力”。",
  "2": "这一页先给领导或评审一个总判断：平台价值来自穿透、解释、闭环和复用四件事。讲的时候不要逐字念卡片，而是说明它们分别解决“看不全、说不清、闭不住、难复制”的问题。",
  "3": "目录页用来建立听众预期：先讲为什么要建，再讲平台怎么组织能力，最后讲典型应用和试点路径。这里可以提醒后续核心功能章节会按当前工程实现重新展开。",
  "4": "这一页讲监管要求的变化：从事后抽查走向在线、智能和全程监管。重点强调平台不是替代监管人员，而是把事前识别、事中监测、事后复核的链路系统化。",
  "5": "这一页把建设目标落到“四全贯通、五通融合”。讲法上可以先讲覆盖范围，再讲数据、层级、业务、监管和处置如何贯通，最后收束到可穿透、可解释、可运营。",
  "6": "痛点页要讲得直接：现在的问题不是缺少页面，而是数据、链路、证据和闭环分散。最后一句要引出平台设计思路：从展示结果前移到组织事实、解释风险和驱动处置。",
  "7": "产品定位页要强调边界。平台做的是跨系统事实映射、规则和模型识别、证据快照和整改闭环；不做源系统替代、不自动定责，也不把模型输出当最终监管结论。",
  "8": "这一页讲总体功能架构，按监管业务、能力配置、知识图谱、来源服务和治理支撑五层解释。新版口径里核心模块是规则管理，不再把“场景与规则”作为独立模块名称。",
  "9": "闭环页要让听众理解平台的运行方式：数据接入后形成图谱事实，规则命中形成预警，人工研判后进入整改复核，最后样本回流优化规则和模型。强调每条风险都有事实、责任和结果。",
  "10": "技术架构页从角色入口、PC Web 应用、业务服务、监管资产和安全治理五层讲。这里要突出工程边界：配置类优先落库，风险闭环、权限、模型调用审计是试点前的加固重点。",
  "11": "核心功能从这一页开始。先不要进入单页细节，先说明所有功能都围绕风险闭环组织：工作台解决入口，态势解决总览，风险管理解决处置，规则和图谱提供解释底座，模型和系统管理提供生产支撑。",
  "12": "这一页讲核心业务闭环。重点不是流程节点多，而是每个节点都会固化对应版本和证据：规则命中、预警生成、证据冻结、人工研判、升级事件、整改举证、复核关闭和样本回流。",
  "13": "监管工作台先讲设计理念。工作台不是另一个统计页，而是不同角色进入系统后的任务入口，要回答“哪些事归我、哪些事最急、下一步点哪里”。",
  "14": "这一页结合截图讲工作台功能。可以按三块讲：顶部指标帮助判断压力，待办列表承接具体任务，右侧消息提醒状态变化，所有入口最终回到统一预警或风险事件详情。",
  "15": "监管态势页讲全局视角。先说明它服务于管理层和监管负责人快速掌握风险规模、等级结构、领域分布和趋势，再说明图表和重点事项可以下钻到具体风险对象。",
  "16": "风险管理总览页要先划清边界：统一预警负责线索发现和人工研判，风险事件负责责任落实、整改举证和复核关闭。两者通过“升级”动作连接成一条闭环。",
  "17": "统一预警页结合列表讲功能。先讲筛选和查询，再讲风险等级、主对象、命中规则和证据入口，最后讲研判动作：解除、转派或升级为风险事件，所有高危动作都要留痕。",
  "18": "风险事件页讲责任闭环。重点说明事件承接来源预警的初始证据快照，后续整改材料只做追加；监管侧通过复核决定通过、退回整改或关闭。",
  "19": "规则管理先讲理念：制度条款不能直接变成系统规则，要经过业务口径、规则表达、试跑校验和发布复用。这里要明确新版口径：规则管理是能力中心模块。",
  "20": "这一页讲规则管理的组织方式。规则库负责分类，规则场景承载监管主题和业务上下文，规则目录定位具体风险主题，最终进入风险规则配置。",
  "21": "风险规则配置页讲一条规则如何可运行。左侧来自图谱字段，中间配置检测口径和表达式，右侧绑定制度依据、证据要求和例外范围；这样命中后才能解释和追溯。",
  "22": "知识图谱第一页面向配置底座。先讲图谱结构定义“能表达什么”，再讲数据源和字段映射决定“事实从哪里来”，最后讲规则和证据如何引用这些结构。",
  "23": "知识图谱第二页讲生成与发布。重点说明生成前要检查结构、数据源和映射，发布后形成只读图谱版本；预警引用的是当时版本，后续更新不能覆盖历史证据。",
  "24": "模型管理页讲边界：本期重点是统一模型目录、接入、测试、场景绑定、启停和调用审计。模型可以辅助研判，但不自动形成监管结论，也不替代人工责任判断。",
  "25": "系统管理页讲生产可用的治理底座。用户组织、角色权限、审计日志和运行安全共同回答“谁能看、谁能改、谁负责、怎么追溯”。",
  "26": "典型应用场景总览页说明五类场景共享同一套图谱和闭环底座。讲的时候不要展开所有细节，只说明采购、合同、财务、投资、人事都能复用事实、证据和处置机制。",
  "27": "供应商异常关联场景重点讲“先解释关系，再判断风险”。通过股权、任职、共址、联系人、历史项目等关系路径解释供应商之间或供应商与人员之间的异常关联。",
  "28": "合同履约与付款不一致场景重点讲证据链。合同、验收、发票和付款不是孤立记录，平台把它们串起来识别无验收付款、超约定付款或主体不一致等问题。",
  "29": "投资决策合规场景重点讲授权边界和过程材料。平台通过立项、论证、审批和执行链路校验越权审批、材料缺失、记录不一致和非主业投资等风险。",
  "30": "这一页回到复用逻辑。不同场景看似业务不同，但运行链路一致：数据接入、图谱关联、规则命中、预警研判、整改复核、样本回流。",
  "31": "实施路径页讲试点如何推进。先做基础加固，再和业务方共创场景，随后用真实或脱敏数据试运行，最后沉淀规则、图谱和运营机制复制到更多单位。",
  "32": "试点启动边界页用于把项目落到可执行范围。要提前锁定试点单位、重点场景、数据来源、规则证据、技术边界和启动建议，避免一开始范围过大。",
  "33": "应用价值页不要只讲技术先进，而要讲监管模式变化：从报表抽查到在线穿透，从分散系统到云数智一体，从单点检查到四全贯通，从事后处置到持续优化。",
  "34": "收束页给出下一步行动建议：先用一个试点单位和一到三个高价值场景跑通闭环，再固化本体、映射、规则、证据要求和运营复盘机制，形成可复制方案。"
};

function prependTalkTrackNotes(presentation) {
  for (let i = 0; i < presentation.slides.items.length; i += 1) {
    const slide = presentation.slides.getItem(i);
    const slideNumber = i + 1;
    const track = TALK_TRACKS[slideNumber];
    if (!track) continue;
    const existing = String(slide.speakerNotes.text || "").trim();
    if (existing.includes("[讲解话术]")) continue;
    const nextNotes = existing
      ? "[讲解话术]\n" + track + "\n\n" + existing
      : "[讲解话术]\n" + track;
    slide.speakerNotes.textFrame.setText(nextNotes);
    slide.speakerNotes.setVisible(true);
  }
}

async function main() {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  await fs.mkdir(RENDER_DIR, { recursive: true });
  await fs.mkdir(LAYOUT_DIR, { recursive: true });

  headerPageNo = 2;
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });

  titleSlide(presentation);
  slide2(presentation);
  slide3(presentation);
  slide4(presentation);
  slide5(presentation);
  slide6(presentation);
  slide7(presentation);
  slide8(presentation);
  slide9(presentation);
  slide10(presentation);
  coreSlide11(presentation);
  coreSlide12(presentation);
  coreSlide13(presentation);
  await coreSlide14(presentation);
  await coreSlide15(presentation);
  coreSlide16(presentation);
  await coreSlide17(presentation);
  await coreSlide18(presentation);
  coreSlide19(presentation);
  coreSlide20(presentation);
  coreSlide21(presentation);
  coreSlide22(presentation);
  coreSlide23(presentation);
  slide18(presentation);
  coreSlide25(presentation);
  slide20(presentation);
  slide21(presentation);
  slide22(presentation);
  slide23(presentation);
  slide24(presentation);
  slide25(presentation);
  slide26(presentation);
  slide27(presentation);
  slide28(presentation);

  prependTalkTrackNotes(presentation);

  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(`${RENDER_DIR}/${stem}.png`, await presentation.export({ slide, format: "png", scale: 1 }));
    await fs.writeFile(`${LAYOUT_DIR}/${stem}.layout.json`, await (await slide.export({ format: "layout" })).text(), "utf8");
  }

  await writeBlob(`${OUT_DIR}/montage.webp`, await presentation.export({ format: "webp", montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(FINAL_PPTX);
  console.log(JSON.stringify({ final: FINAL_PPTX, slides: presentation.slides.items.length, montage: `${OUT_DIR}/montage.webp` }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

