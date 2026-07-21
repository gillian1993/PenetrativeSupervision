import fs from 'node:fs/promises'
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool'

const outputDir = 'D:/中国电子云/PenetrativeSupervision/outputs/采购供应链规则融合台账_20260721'
const outputPath = `${outputDir}/采购供应链风险模式与原子规则融合台账_20260721.xlsx`

const scenes = [
  ['SCENE-CG-001','采购方式不合规','采购','事前','识别采购方式选择、审批、集采目录和拆分采购等合规风险。'],
  ['SCENE-ZB-002','虚假招标','采购','事前/事中','识别供应商提前介入、定向参数、投标材料同源及陪标行为。'],
  ['SCENE-BID-003','围标串标','采购','事中/事后','融合投标文件、工商关联、人员、联系方式和历史投标群组进行判定。'],
  ['SCENE-LC-004','采购流程不规范','采购','事前/事中','识别预算、公告、投标期、评审、签约等流程缺失、倒置或不合规。'],
  ['SCENE-CP-005','供应商及交易对手风险','采购/供应链','事前','识别甲乙方隐性关联、空壳、失信、涉诉、黑名单和历史履约风险。'],
  ['SCENE-TRADE-006','贸易背景及循环贸易','供应链','事中/事后','识别同标的双向交易、上下游关联、循环贸易和虚增贸易链路。'],
  ['SCENE-ORDER-007','合同订单及价格异常','合同/供应链','事前/事中','识别低毛利、微价差、融资性贸易以及历史和横向价格异常。'],
  ['SCENE-SETTLE-008','结算模式异常','财务','事中/事后','识别双向收付款、双向挂账及合同发票资金主体不一致。'],
  ['SCENE-FUND-009','资金流异常','财务','事中/事后','识别资金占用、异常预付、账户同源、资金回流和个人账户收款。'],
  ['SCENE-DELIVERY-010','货权及交付异常','供应链','事后','识别无交付凭证、数量不符、非标仓单及异常货物流转。'],
  ['SCENE-CONTRACT-011','合同履约与变更异常','合同','事中/事后','识别中标后重大变更、验收前高比例付款和合同履约异常。'],
  ['SCENE-AI-012','智能评标与合同审查','采购/合同','事前/事中','提供智能评标、合作建议和合同法律风险审查能力。'],
]

const userModes = [
  ['贸易背景异常识别','101','跨单位同标的收支合同检测','不同交易主体的收支合同标的名称、规格高度雷同且交易方向相反。','SCENE-TRADE-006','事中/事后','重大'],
  ['贸易背景异常识别','102','投标比价单位交叉持股关联检测','核查投标、比价或谈判单位之间的母子、投资及交叉持股关系。','SCENE-BID-003','事前/事中','重大'],
  ['贸易背景异常识别','103','同主体同标的收支合同检测','同一经营主体存在同标的、同规格的双向购销合同。','SCENE-TRADE-006','事中/事后','重大'],
  ['贸易背景异常识别','104','供应商法定代表人关联检测','供应商法定代表人与甲方采购、评审或管理人员存在关联。','SCENE-CP-005','事前','重大'],
  ['贸易背景异常识别','105','供应商自然人股东关联检测','股权穿透后供应商自然人股东与甲方人员存在利益关联。','SCENE-CP-005','事前','重大'],
  ['贸易背景异常识别','106','供应商高管人员关联检测','供应商董监高或经营层人员与甲方人员存在任职或利益关联。','SCENE-CP-005','事前','高'],
  ['贸易背景异常识别','107','非主业违规贸易检测','贸易品类超出企业经营范围或偏离集团核准主业清单。','SCENE-CP-005','事前/事中','高'],
  ['合同订单异常识别','201','贸易超低毛利异常检测','单笔贸易毛利率低于0.1%。','SCENE-ORDER-007','事中/事后','高'],
  ['合同订单异常识别','202','同货同量小额价差采销检测','货物品类和数量一致，购销金额差值低于0.01%。','SCENE-ORDER-007','事中/事后','重大'],
  ['合同订单异常识别','203','低价差长账期融资贸易检测','购销价差低于0.5%且账期超过90天。','SCENE-ORDER-007','事中/事后','高'],
  ['合同订单异常识别','204','短期商品价格突变异常检测','24小时内同客户、同商品单价变化超过±8%。','SCENE-ORDER-007','事中','高'],
  ['交易对手异常识别','301','空壳资本企业风险检测','实缴资本低于1000万元且注册地址为集中托管地址。','SCENE-CP-005','事前','高'],
  ['交易对手异常识别','302','企业社保空心化检测','近12个月平均参保人数低于10人。','SCENE-CP-005','事前','高'],
  ['交易对手异常识别','303','新成立企业风控检测','企业成立时间不足180天。','SCENE-CP-005','事前','中'],
  ['交易对手异常识别','304','企业经营异常名录检测','企业被列入经营异常名录且尚未移出。','SCENE-CP-005','事前','高'],
  ['交易对手异常识别','305','严重违法失信企业检测','企业命中严重违法失信名单。','SCENE-CP-005','事前','重大'],
  ['交易对手异常识别','306','法人失信被执行人检测','企业法定代表人为失信被执行人。','SCENE-CP-005','事前','高'],
  ['交易对手异常识别','307','企业名称敏感特征检测','企业名称命中融资、托盘、套利、大宗等敏感关键词。','SCENE-CP-005','事前','中'],
  ['交易对手异常识别','308','高比例股权质押风险检测','企业股权质押比例达到或超过80%。','SCENE-CP-005','事前','高'],
  ['交易对手异常识别','309','密集司法纠纷风险检测','近12个月作为被告的买卖合同纠纷达到5起。','SCENE-CP-005','事前','高'],
  ['交易对手异常识别','310','集团内部黑名单匹配检测','交易对手命中集团内部黑名单。','SCENE-CP-005','事前','重大'],
  ['交易对手异常识别','311','外部企业负面舆情','企业存在经核实的重大负面舆情。','SCENE-CP-005','事前/事中','高'],
  ['交易对手异常识别','312','历史长期逾期交易检测','交易对手存在超过30天的历史逾期履约记录。','SCENE-CP-005','事前','高'],
  ['上下游交易对手关联关系异常识别','401','上下游签约主体同源检测','同一经营主体同时作为本次贸易的上游和下游签约方。','SCENE-TRADE-006','事中/事后','重大'],
  ['上下游交易对手关联关系异常识别','402','关联主体循环贸易检测','相同主体或关联主体反复签订同质化购销合同。','SCENE-TRADE-006','事中/事后','重大'],
  ['上下游交易对手关联关系异常识别','403','上下游投资关联关系检测','上下游企业存在投资、控股或交叉持股关系。','SCENE-TRADE-006','事前/事中','高'],
  ['上下游交易对手关联关系异常识别','404','上下游高管人员重合检测','上下游企业董监高或经营层人员存在重合。','SCENE-TRADE-006','事前/事中','高'],
  ['上下游交易对手关联关系异常识别','405','上下游地址联系方式重合检测','上下游企业注册地址、联系电话或联系人信息重合。','SCENE-TRADE-006','事前/事中','高'],
  ['结算模式异常识别','501','短期客商双向收付款异常检测','15天内与同一客商或关联主体同时发生收款和付款。','SCENE-SETTLE-008','事中/事后','高'],
  ['结算模式异常识别','502','客商应收预付双向挂账检测','同一客商及关联主体同时存在应收和预付余额。','SCENE-SETTLE-008','事中/事后','高'],
  ['结算模式异常识别','503','三流主体信息不一致检测','合同、发票、收付款主体信息不一致且无有效授权。','SCENE-SETTLE-008','事中/事后','重大'],
  ['资金流异常识别','601','累计资金占用异常检测','累计占用超过配置天数且日均占用超过配置金额。','SCENE-FUND-009','事中/事后','高'],
  ['资金流异常识别','602','大额应收预付逾期检测','应收或预付发生逾期且逾期金额超过配置阈值。','SCENE-FUND-009','事后','高'],
  ['资金流异常识别','603','收付款节点大幅前置异常检测','实际收付款时间较合同约定提前90天以上。','SCENE-FUND-009','事中/事后','高'],
  ['资金流异常识别','604','高预付高负债风险检测','预付款比例超过80%且对方资产负债率超过85%。','SCENE-FUND-009','事前/事中','重大'],
  ['资金流异常识别','605','上下游回款账户同源检测','上游收款账户与下游回款账户为同一账户。','SCENE-FUND-009','事后','重大'],
  ['资金流异常识别','606','当日小额差额资金回流检测','付款和回款发生在同一天且金额差异低于5%。','SCENE-FUND-009','事后','重大'],
  ['资金流异常识别','607','个人账户收款异常','贸易回款进入法人、股东、员工或其他个人账户。','SCENE-FUND-009','事后','重大'],
  ['货权转移异常识别','701','收付款无完整交付信息检测','收付款完整但缺失交付单据、物流、签收、入库或验收信息。','SCENE-DELIVERY-010','事后','重大'],
  ['货权转移异常识别','702','采购交付数量不符检测','实际交付或入库数量与采购合同约定数量不一致。','SCENE-DELIVERY-010','事后','高'],
  ['货权转移异常识别','703','非标仓单交易风险检测','仓单开具主体不在合规交割仓库或厂库名单。','SCENE-DELIVERY-010','事前/事中','重大'],
  ['其他异常识别','801','央企空转走单套利检测','央企项目转包民企、仅收手续费且无实质经营流转。','SCENE-TRADE-006','事中/事后','重大'],
  ['其他异常识别','802','贸易链路虚增环节检测','识别两端央企、中间民企等冗余嵌套交易链路。','SCENE-TRADE-006','事中/事后','重大'],
  ['其他异常识别','803','民企关联群组交易挖掘检测','通过图计算挖掘民企矩阵式集群交易和闭环关联交易。','SCENE-TRADE-006','事后','重大'],
  ['其他异常识别','804','企业资金归集异常聚合检测','按主体聚合连续收支，识别异常资金归集和集中往来。','SCENE-FUND-009','事后','高'],
  ['其他异常识别','805','跨主体货物异常流转链路检测','货物由央国企售予民企后回流至同集团其他主体。','SCENE-TRADE-006','事后','重大'],
  ['价格异常识别','A01','纵向历史价格异常检测','同一供应商同一标的物价格较历史基准偏离超过20%。','SCENE-ORDER-007','事前/事中','高'],
  ['价格异常识别','A02','横向同业价格异常检测','规格标准化后，不同供应商同一标的物价格差异超过20%。','SCENE-ORDER-007','事中','高'],
  ['围串标识别','B01','串通投标风险','检测投标IP、MAC、文件文本及制作元数据是否同源。','SCENE-BID-003','事中','重大'],
  ['围串标识别','B02','投标人之间存在关联关系','检测共同股东、投资关系、高管重合、联系方式及实际控制人。','SCENE-BID-003','事前/事中','重大'],
  ['围串标识别','B03','组团投标','检测固定供应商或关联供应商群组反复共同投标。','SCENE-BID-003','事中/事后','高'],
  ['智能分析能力','M101','智能评标','输出投标主体综合评分、风险评级和合作建议。','SCENE-AI-012','事中','能力'],
  ['合同审查','M102','合同风险审查','识别合同法律、付款、履约、违约及权责不对等风险并给出修改建议。','SCENE-AI-012','事前/事中','能力'],
]

const supplementModes = [
  ['采购方式补充','CG01','采购方式不合规综合检测','覆盖招标阈值、例外审批、单一来源理由、供应商数量、方式变更和集采目录。','SCENE-CG-001','事前/事中','重大','部分实现'],
  ['采购方式补充','CG02','拆分采购规避集中采购','识别同需求、同品类、同供应商在短周期内的多笔小额拆分采购。','SCENE-CG-001','事前','高','已实现'],
  ['虚假招标补充','ZB01','虚假招标综合检测','识别中标供应商提前介入和招标参数定向设置。','SCENE-ZB-002','事前/事中','重大','待建设'],
  ['围串标补充','B04','关联供应商轮流中标','固定关联供应商群组在多个项目中呈现轮流中标和稳定报价顺序。','SCENE-BID-003','事后','重大','待建设'],
  ['围串标补充','B05','保证金同源与报价规律异常','多个投标保证金来源同一账户且报价呈等差或稳定梯度。','SCENE-BID-003','事中','重大','已实现'],
  ['流程合规补充','LC01','采购流程时序异常','识别预算、需求、计划、公告、签约等关键事件缺失或顺序倒置。','SCENE-LC-004','事前/事中','高','部分实现'],
  ['流程合规补充','LC02','采购程序及评审异常','识别投标期不足、重大变更未延期、专家抽取和评审委员会异常。','SCENE-LC-004','事中','高','部分实现'],
  ['资金流补充','608','付款后流向采购方关联主体','付款后短期内大比例资金流向采购方关联企业或关联账户。','SCENE-FUND-009','事后','重大','已实现'],
  ['合同履约补充','HT01','中标后合同重大变更','中标后短期内合同金额、范围或关键条款发生重大变化。','SCENE-CONTRACT-011','事中/事后','高','已实现'],
  ['合同履约补充','HT02','验收前高比例付款','验收通过前累计付款比例超过合同金额80%。','SCENE-CONTRACT-011','事中/事后','高','已实现'],
]

const implemented = new Set(['B01','701','M101'])
const partial = new Set(['102','B02'])
const dataOnly = new Set(['101','103','202','501','503','605','606'])
const external = new Set(['104','105','106','107','301','302','303','304','305','306','307','308','309','310','311','403','404','405','703','A02'])

function coverageFor(code){
  if(implemented.has(code)) return '已实现'
  if(partial.has(code)) return '部分实现'
  if(dataOnly.has(code)) return '已有演示明细，待规则化'
  if(external.has(code)) return '待接外部数据'
  return '待建设'
}

const modeRows = []
let modeSeq = 1
for(const [category,code,name,description,sceneId,stage,level] of userModes){
  const scene = scenes.find(item=>item[0]===sceneId)
  modeRows.push([modeSeq++,category,code,name,description,'用户提出','是',sceneId,scene?.[1]||'',stage,level,coverageFor(code)])
}
for(const [category,code,name,description,sceneId,stage,level,coverage] of supplementModes){
  const scene = scenes.find(item=>item[0]===sceneId)
  modeRows.push([modeSeq++,category,code,name,description,'融合补充','否',sceneId,scene?.[1]||'',stage,level,coverage])
}

const thresholdByCode = {
  '101':'标的名称及规格相似度≥90%，交易方向相反','103':'同主体、同标的、同规格且交易方向相反',
  '104':'关联图谱路径≤2跳','105':'股权穿透后关联路径≤3跳','106':'存在共同任职或利益关联路径','107':'不在经营范围或集团主业白名单',
  '201':'毛利率<0.1%','202':'数量一致且金额差值率<0.01%','203':'价差率<0.5%且账期>90天','204':'24小时价格波动绝对值>8%',
  '301':'实缴资本<1000万元且集中托管地址','302':'近12个月平均参保人数<10','303':'成立天数<180天','304':'经营异常状态=未移出',
  '305':'命中严重违法失信名单','306':'法人命中失信被执行人','307':'名称命中融资/托盘/套利/大宗关键词','308':'股权质押比例≥80%',
  '309':'近12个月买卖合同纠纷被告次数≥5','310':'命中集团黑名单','311':'重大负面舆情置信度≥配置阈值','312':'历史逾期天数>30天',
  '401':'同一主体同时处于上游和下游签约角色','402':'关联主体同质化购销合同重复次数≥2','403':'存在投资/控股/交叉持股路径',
  '404':'上下游高管人员重合人数≥1','405':'地址/电话/联系人任一高置信重合','501':'15天内同时存在收款和付款','502':'同时存在应收和预付余额',
  '503':'合同/发票/资金主体任一不一致且无授权','601':'占用天数>X且日均占用>Y万元','602':'逾期金额>N万元','603':'实际节点较合同约定提前>90天',
  '604':'预付比例>80%且资产负债率>85%','605':'上游收款账户=下游回款账户','606':'同日收付且金额差值率<5%','607':'收款账户类型=个人',
  '701':'收付款完整且交付凭证缺失或异常','702':'交付/入库数量≠合同数量','703':'仓单主体不在合规仓库名单','801':'仅收手续费且无货权/物流/经营投入',
  '802':'链路存在冗余中间主体且无增值证据','803':'图社区形成高密度闭环且资金/合同同向','804':'周期内资金归集度超过配置阈值','805':'同规格货物跨主体回流集团内部',
  'A01':'与同供应商历史基准价偏离>20%','A02':'与同批次供应商中位价偏离>20%'
}

function ruleTypeFor(code){
  if(['104','105','106','403','404','405','801','802','803','805'].includes(code)) return '关系路径/图计算'
  if(['201','202','203','204','301','302','303','308','309','312','501','502','601','602','604','606','A01','A02'].includes(code)) return '聚合'
  if(['503','603','605','607','701','702','703','107','304','305','306','307','310','311'].includes(code)) return '字段比对'
  if(['101','103','401','402'].includes(code)) return '合同配对/聚合'
  return '属性'
}

function dataSourceFor(category){
  if(category.includes('交易对手')) return '工商公示、司法征信、集团客商主数据、舆情平台'
  if(category.includes('围串标')) return '电子采购平台、投标文件解析、工商股权图谱、终端与网络日志'
  if(category.includes('价格')||category.includes('合同订单')) return 'ERP合同订单、商品主数据、市场价格库'
  if(category.includes('结算')||category.includes('资金')) return '财务总账、应收预付、银企直联资金流水'
  if(category.includes('货权')) return '物流平台、仓储WMS、签收验收、仓单公示名单'
  if(category.includes('智能')||category.includes('合同审查')) return '投标文件、评分模型、合同文本与条款库'
  return 'ERP合同订单、发票、资金流水、工商关联图谱'
}

function evidenceFor(category){
  if(category.includes('围串标')) return '投标日志、文件相似报告、工商关联路径、历史投标记录'
  if(category.includes('交易对手')) return '工商快照、司法名单、社保信息、内部黑名单记录'
  if(category.includes('资金')||category.includes('结算')) return '合同约定、会计余额、银行流水、账户穿透路径'
  if(category.includes('货权')) return '物流轨迹、交付单、入库单、签收验收单、仓单资质'
  return '合同订单、发票、业务来源记录、规则命中明细'
}

const rules = []
const bindings = []
let ruleSeq = 1

function addRule(modeCode,suffix,name,type,stage,level,logic,threshold,dataSource,evidence,status='待建设',existingMapping='',sharedModes=[]){
  const ruleCode = `RULE-${modeCode}-${suffix}`
  rules.push([ruleSeq++,modeCode,ruleCode,name,type,stage,level,logic,threshold,dataSource,evidence,status,existingMapping,sharedModes.join('、')])
  bindings.push([bindings.length+1,modeCode,ruleCode,'主绑定'])
  for(const shared of sharedModes) bindings.push([bindings.length+1,shared,ruleCode,'共享绑定'])
}

const skipDefault = new Set(['102','B01','B02','B03','M101','M102'])
for(const [category,code,name,description,,stage,level] of userModes){
  if(skipDefault.has(code)) continue
  const status = coverageFor(code)==='已有演示明细，待规则化' ? '已有数据待规则化' : coverageFor(code)
  addRule(code,'01',name,ruleTypeFor(code),stage,level,description,thresholdByCode[code]||'按制度及模型参数配置',dataSourceFor(category),evidenceFor(category),status,code==='701'?'RULE-DEMO-011':'')
}

addRule('B01','01','投标网络地址或终端同源','关系路径','事中','重大','比对购买、下载和递交投标文件的IP、MAC及设备指纹。','两家及以上投标人IP/MAC/设备指纹相同','电子采购平台、网络日志','投标日志、IP/MAC、设备指纹','已实现','RULE-DEMO-004')
addRule('B01','02','投标文件文本高度相似','文本相似','事中','重大','比对技术、商务和价格文件的段落、表格及错别字特征。','综合文本相似度≥85%','投标文件解析与文本模型','文件相似报告、重复片段清单','已实现','RULE-DEMO-005')
addRule('B01','03','投标文件制作元数据同源','文件元数据','事中','高','比对文件作者、创建软件、设备、模板哈希和修改时间。','至少2项高置信元数据相同','投标文件元数据解析','文件属性、模板哈希、修改记录','待建设')

addRule('B02','01','投标人具有相同股东','关系路径','事前/事中','重大','穿透识别两个或以上投标主体的共同股东。','共同股东人数≥1','工商股权图谱','股东名册、股权穿透路径','待接外部数据','', ['102'])
addRule('B02','02','投标人存在投资或交叉持股','关系路径','事前/事中','重大','识别投标主体间直接、间接投资或交叉持股。','投资关联路径≤3跳','工商股权图谱','投资关系、持股比例、穿透路径','待接外部数据','', ['102'])
addRule('B02','03','投标人高管人员重合','关系路径','事前/事中','高','识别法定代表人、董监高及关键人员重合。','重合人员数≥1','工商任职图谱','人员任职记录、关系路径','待接外部数据')
addRule('B02','04','投标人联系方式或地址重合','字段比对','事中','高','比对联系人、手机、邮箱和办公地址。','任一高置信字段重合','电子采购平台、工商主数据','报名信息、工商地址、联系方式','待接外部数据')
addRule('B02','05','多家投标人受同一实际控制人控制','关系路径','事中','重大','识别多个投标主体指向同一实际控制人的控制路径。','共同实际控制人数量≥1','工商股权图谱','实际控制路径、控制比例','已实现','RULE-DEMO-006')

addRule('B03','01','固定供应商共同投标达到三次','聚合','事中/事后','高','统计12个月内供应商组合共同参与标段的次数。','共同投标次数≥3','电子采购平台','历史投标项目及参与主体','待建设')
addRule('B03','02','关联供应商群组累计共同投标','图计算/聚合','事中/事后','重大','合并供应商关联群组后统计共同投标次数。','关联群组共同投标次数≥3','电子采购平台、工商关联图谱','群组成员、关联路径、投标记录','待建设')
addRule('B03','03','陪标单位规律性废标','聚合','事中/事后','高','识别共同投标中长期因低级形式问题废标且从未中标的主体。','12个月共同投标≥3且异常废标≥2','电子采购平台','废标原因、报价、中标历史','待建设')

addRule('M101','01','投标主体智能综合评标','智能服务','事中','能力','融合技术、商务、价格及图谱关联风险形成综合评分和建议。','输出综合评分、风险等级及合作建议','投标文件、评分模型、关联图谱','评分明细、扣分原因、模型版本','已实现','智能评标数据6条')
addRule('M102','01','合同法律与履约风险智能审查','智能服务','事前/事中','能力','识别缺失条款、权责不对等、付款、违约及履约风险并生成修改建议。','输出风险条款、等级和修改建议','合同文本、条款库、法律规则库','条款定位、风险说明、修改建议','待建设')

addRule('CG01','01','达到公开招标阈值但采用非公开方式','字段比对','事前','重大','采购金额达到公开招标阈值，但采购方式不是公开招标。','金额≥组织及品类有效阈值','采购计划、制度阈值配置','预算金额、采购方式、阈值版本','已实现','RULE-DEMO-001')
addRule('CG01','02','非公开采购缺少有效例外审批','字段比对','事前','高','非公开采购未关联有效例外事项和审批单。','例外审批为空、过期或审批未通过','采购审批、例外事项库','审批单、例外原因、有效期','已实现','RULE-DEMO-002')
addRule('CG01','03','单一来源理由与事实不匹配','字段比对','事前','高','采用单一来源但缺少唯一性、专利专有或连续性证明。','理由不在允许范围或证明材料不完整','采购审批、供应商资质','采购理由、唯一性证明、审批记录','待建设')
addRule('CG01','04','有效竞争供应商数量不足','聚合','事中','高','询比价、竞争性谈判有效响应供应商不足且无例外审批。','有效供应商数量<3','电子采购平台','报名、响应、资格审查及例外审批','待建设')
addRule('CG01','05','采购方式变更未重新审批','时序','事前/事中','高','实际采购方式与已审批计划不同，且变更前未完成重新审批。','方式不同且变更审批时间晚于实施时间','采购计划、审批流程','原方式、新方式、变更审批记录','待建设')
addRule('CG01','06','集采目录项目场外采购','字段比对','事前','重大','标的属于强制集采或框架协议目录，但在目录外采购。','目录命中且采购渠道不合规','集采目录、框架协议、采购订单','目录版本、标的映射、采购渠道','待建设')
addRule('CG02','01','同需求同品类短期拆分采购','聚合','事前','高','同一需求、品类、供应商在30天内发生多笔小额采购且累计超过阈值。','30天累计金额≥采购方式阈值且订单数≥2','采购需求、订单、供应商主数据','需求编号、订单明细、累计金额','已实现','RULE-DEMO-003')

addRule('ZB01','01','中标供应商提前参与项目','时序/关系','事前/事中','重大','招标前出现最终中标供应商进场、测试账号、工作记录或合同草稿。','前置参与事件早于公告或投标截止时间','项目系统、门禁、测试平台、合同系统','前置事件、供应商、中标结果','待建设')
addRule('ZB01','02','招标参数疑似定向设置','文本/匹配','事前','高','关键技术参数仅一家供应商满足或指定品牌型号且不允许同等替代。','唯一供应商匹配率≥80%或存在排他性表述','招标文件、产品参数库','参数匹配清单、排他性文本','待建设')

addRule('B04','01','关联供应商轮流中标','图计算/聚合','事后','重大','固定关联供应商群组在多个同类项目中轮流中标且报价排序稳定。','12个月项目数≥3且轮换规律置信度≥阈值','电子采购平台、工商关联图谱','中标序列、报价排序、群组关系','待建设')
addRule('B05','01','投标保证金同源且报价呈规律排列','聚合/关系','事中','重大','多个投标保证金来自同一账户，同时报价呈等差或稳定梯度。','保证金来源同一且报价规律置信度≥阈值','保证金流水、投标报价','付款账户、报价明细、排列分析','已实现','RULE-DEMO-007')

addRule('LC01','01','招标公告早于预算批复','时序','事前','高','招标公告发布时间早于预算批复完成时间。','公告时间<预算批复时间','预算系统、电子采购平台','预算批复、公告时间戳','已实现','RULE-DEMO-008')
addRule('LC01','02','采购关键事件缺失或倒置','时序','事前/事中','高','需求、计划、预算、方式审批、公告等关键事件缺失或顺序异常。','必需事件缺失或不满足制度顺序','采购流程事件总线','事件时间轴、审批记录','待建设')
addRule('LC01','03','招标文件未审批即发布','时序','事前','高','招标文件发布日期早于业务、法务或财务审批完成时间。','发布时间<必需审批完成时间','电子采购、OA审批','文件版本、审批记录、发布时间','待建设')
addRule('LC01','04','中标公示期内提前签约','时序','事中/事后','重大','合同签订早于中标公示或异议处理结束时间。','合同签订时间<公示/异议结束时间','电子采购、合同系统','中标公示、异议记录、合同签署时间','待建设')

addRule('LC02','01','公开招标投标期不足20天','时序','事中','高','公开招标公告至投标截止的有效时间不足20天。','有效投标期<20天','电子采购平台','公告时间、截止时间、节假日配置','已实现','RULE-DEMO-009')
addRule('LC02','02','评审专家指定且无抽取记录','属性/时序','事中','高','专家产生方式为指定且未留存有效随机抽取记录。','指定专家且抽取记录为空','专家库、评审系统','抽取批次、专家名单、操作日志','已实现','RULE-DEMO-010')
addRule('LC02','03','重大变更未顺延投标期','时序','事中','高','资格、技术或价格等关键条件变更后未按制度顺延截止时间。','重大变更且顺延天数<制度要求','电子采购平台','澄清变更、原截止时间、新截止时间','待建设')
addRule('LC02','04','评审委员会组成异常','聚合/关系','事中','高','专家人数、外部专家比例、回避关系或签字完整性不符合制度。','任一组成或回避约束不满足','专家库、评审系统、工商关联图谱','委员会名单、回避关系、签字记录','待建设')

addRule('608','01','付款后资金流向采购方关联主体','关系路径/时序','事后','重大','付款后3天内80%以上资金流向采购方关联企业或关联账户。','3天内关联流出比例≥80%','银企直联、工商关联图谱','付款流水、后续转账、关联路径','已实现','RULE-DEMO-012')
addRule('HT01','01','中标后90天内合同增幅超过20%','聚合/时序','事中/事后','高','中标后90天内合同累计变更金额超过原合同20%。','90天内累计变更比例>20%','合同系统、采购结果','原合同、中标结果、变更记录','已实现','RULE-DEMO-013')
addRule('HT02','01','验收前累计付款超过合同80%','时序/聚合','事中/事后','高','验收通过前累计付款超过合同金额80%。','未验收且累计付款比例>80%','合同、验收、财务付款','合同金额、付款累计、验收状态','已实现','RULE-DEMO-014')

const sceneModeMap = new Map()
for(const row of modeRows){
  const sceneId = row[7]
  if(!sceneModeMap.has(sceneId)) sceneModeMap.set(sceneId,[])
  sceneModeMap.get(sceneId).push(row[2])
}
const sceneRows = scenes.map((scene,index)=>[
  index+1,scene[0],scene[1],scene[2],scene[3],scene[4],(sceneModeMap.get(scene[0])||[]).join('、'),(sceneModeMap.get(scene[0])||[]).length
])

const workbook = Workbook.create()
const summary = workbook.worksheets.add('融合摘要')
const modeSheet = workbook.worksheets.add('模式目录')
const ruleSheet = workbook.worksheets.add('原子规则')
const bindingSheet = workbook.worksheets.add('模式规则绑定')
const sceneSheet = workbook.worksheets.add('场景目录')

const navy = '#17365D', blue = '#1F4E78', lightBlue = '#D9EAF7', pale = '#F3F6FA', gold = '#D6A84B', green = '#D9EAD3', yellow = '#FFF2CC', red = '#F4CCCC', gray = '#E7E6E6'
const titleStyle = {fill:navy,font:{bold:true,color:'#FFFFFF',size:18},verticalAlignment:'center'}
const headerStyle = {fill:blue,font:{bold:true,color:'#FFFFFF'},verticalAlignment:'center',wrapText:true,borders:{preset:'inside',style:'thin',color:'#B4C7E7'}}
const subHeaderStyle = {fill:lightBlue,font:{bold:true,color:navy},verticalAlignment:'center'}
const bodyBorder = {insideHorizontal:{style:'thin',color:'#D9E2F3'},bottom:{style:'thin',color:'#D9E2F3'}}

for(const sheet of [summary,modeSheet,ruleSheet,bindingSheet,sceneSheet]) sheet.showGridLines = false

summary.mergeCells('A1:H2')
summary.getRange('A1').values = [['采购与供应链风险模式—原子规则融合台账']]
summary.getRange('A1:H2').format = titleStyle
summary.getRange('A1:H2').format.rowHeight = 30
summary.mergeCells('A3:H3')
summary.getRange('A3').values = [['口径：完整保留用户模式编号；融合补充模式使用正式编号；复杂模式拆分为可执行原子规则，并通过绑定表复用。当前文件仅用于审阅，不写线上数据库。']]
summary.getRange('A3:H3').format = {fill:pale,font:{color:'#44546A',italic:true},wrapText:true}
summary.getRange('A5:B5').values = [['指标','数量']]
summary.getRange('A5:B5').format = headerStyle
summary.getRange('A6:A10').values = [['模式总数'],['用户原始模式'],['融合补充模式'],['原子规则总数'],['模式规则绑定数']]
summary.getRange('B6').formulas = [["=COUNTA('模式目录'!$C$2:$C$200)"]]
summary.getRange('B7').formulas = [["=COUNTIF('模式目录'!$F$2:$F$200,\"用户提出\")"]]
summary.getRange('B8').formulas = [["=COUNTIF('模式目录'!$F$2:$F$200,\"融合补充\")"]]
summary.getRange('B9').formulas = [["=COUNTA('原子规则'!$C$2:$C$300)"]]
summary.getRange('B10').formulas = [["=COUNTA('模式规则绑定'!$B$2:$B$400)"]]
summary.getRange('A6:B10').format = {borders:bodyBorder}
summary.getRange('B6:B10').format = {font:{bold:true,color:navy,size:14},numberFormat:'#,##0'}

summary.getRange('D5:E5').values = [['原子规则状态','数量']]
summary.getRange('D5:E5').format = headerStyle
const statuses = ['已实现','部分实现','已有数据待规则化','待接外部数据','待建设']
summary.getRange('D6:D10').values = statuses.map(x=>[x])
for(let i=0;i<statuses.length;i++) summary.getRange(`E${6+i}`).formulas = [[`=COUNTIF('原子规则'!$L$2:$L$300,D${6+i})`]]
summary.getRange('D6:E10').format = {borders:bodyBorder}
summary.getRange('E6:E10').format = {font:{bold:true,color:navy},numberFormat:'#,##0'}

summary.getRange('G5:H5').values = [['设计约束','说明']]
summary.getRange('G5:H5').format = headerStyle
summary.getRange('G6:H10').values = [
  ['编号保留','101、A01、B01、M101等用户编号不改名'],
  ['原子拆分','B01、B02、B03等多条件模式拆为多条原子规则'],
  ['多场景复用','同一规则可通过绑定表服务多个用户模式或场景'],
  ['能力分层','M101、M102按智能服务管理，不与阈值规则混淆'],
  ['入库原则','审核确认后再生成SQL并写入线上MySQL'],
]
summary.getRange('G6:H10').format = {wrapText:true,borders:bodyBorder}

summary.getRange('A13:H13').values = [['场景编号','场景名称','领域','主要阶段','模式数','建设重点','','']]
summary.getRange('A13:H13').format = headerStyle
const summarySceneRows = sceneRows.map(row=>[row[1],row[2],row[3],row[4],row[7],row[5],'',''])
summary.getRangeByIndexes(13,0,summarySceneRows.length,8).values = summarySceneRows
summary.getRange(`A14:H${13+summarySceneRows.length}`).format = {wrapText:true,borders:bodyBorder,verticalAlignment:'top'}
summary.getRange('E14:E25').format.numberFormat = '#,##0'
summary.freezePanes.freezeRows(3)
summary.getRange('A1:H25').format.font = {name:'Microsoft YaHei'}
summary.getRange('A1:H25').format.autofitRows()
summary.getRange('A:A').format.columnWidth = 18
summary.getRange('B:B').format.columnWidth = 22
summary.getRange('C:C').format.columnWidth = 14
summary.getRange('D:D').format.columnWidth = 16
summary.getRange('E:E').format.columnWidth = 10
summary.getRange('F:F').format.columnWidth = 44
summary.getRange('G:G').format.columnWidth = 18
summary.getRange('H:H').format.columnWidth = 42

const modeHeaders = ['序号','模式类目','模式编号','模式名称','模式说明','来源','用户原编号','主场景编号','主场景名称','建议阶段','默认等级','当前覆盖状态']
modeSheet.getRange('A1:L1').values = [modeHeaders]
modeSheet.getRange('A1:L1').format = headerStyle
modeSheet.getRangeByIndexes(1,0,modeRows.length,modeHeaders.length).values = modeRows
modeSheet.getRange(`A2:L${modeRows.length+1}`).format = {verticalAlignment:'top',wrapText:true,borders:bodyBorder,font:{name:'Microsoft YaHei',size:10}}
modeSheet.freezePanes.freezeRows(1)
modeSheet.freezePanes.freezeColumns(3)
modeSheet.tables.add(`A1:L${modeRows.length+1}`,true,'ModeCatalogTable')
modeSheet.getRange('A:A').format.columnWidth = 8
modeSheet.getRange('B:B').format.columnWidth = 24
modeSheet.getRange('C:C').format.columnWidth = 12
modeSheet.getRange('D:D').format.columnWidth = 30
modeSheet.getRange('E:E').format.columnWidth = 62
modeSheet.getRange('F:G').format.columnWidth = 14
modeSheet.getRange('H:H').format.columnWidth = 20
modeSheet.getRange('I:I').format.columnWidth = 28
modeSheet.getRange('J:L').format.columnWidth = 18
modeSheet.getRange(`L2:L${modeRows.length+1}`).conditionalFormats.add('containsText',{text:'已实现',format:{fill:green,font:{color:'#274E13',bold:true}}})
modeSheet.getRange(`L2:L${modeRows.length+1}`).conditionalFormats.add('containsText',{text:'部分实现',format:{fill:yellow,font:{color:'#7F6000'}}})
modeSheet.getRange(`L2:L${modeRows.length+1}`).conditionalFormats.add('containsText',{text:'待建设',format:{fill:gray,font:{color:'#666666'}}})
modeSheet.getRange(`L2:L${modeRows.length+1}`).conditionalFormats.add('containsText',{text:'待接外部数据',format:{fill:red,font:{color:'#990000'}}})

const ruleHeaders = ['序号','主模式编号','原子规则编号','原子规则名称','规则类型','适用阶段','默认等级','规则逻辑','阈值/判定条件','数据来源','证据要求','规则状态','当前映射','共享模式编号']
ruleSheet.getRange('A1:N1').values = [ruleHeaders]
ruleSheet.getRange('A1:N1').format = headerStyle
ruleSheet.getRangeByIndexes(1,0,rules.length,ruleHeaders.length).values = rules
ruleSheet.getRange(`A2:N${rules.length+1}`).format = {verticalAlignment:'top',wrapText:true,borders:bodyBorder,font:{name:'Microsoft YaHei',size:10}}
ruleSheet.freezePanes.freezeRows(1)
ruleSheet.freezePanes.freezeColumns(3)
ruleSheet.tables.add(`A1:N${rules.length+1}`,true,'AtomicRuleTable')
ruleSheet.getRange('A:A').format.columnWidth = 8
ruleSheet.getRange('B:B').format.columnWidth = 13
ruleSheet.getRange('C:C').format.columnWidth = 20
ruleSheet.getRange('D:D').format.columnWidth = 34
ruleSheet.getRange('E:G').format.columnWidth = 16
ruleSheet.getRange('H:H').format.columnWidth = 58
ruleSheet.getRange('I:I').format.columnWidth = 38
ruleSheet.getRange('J:K').format.columnWidth = 44
ruleSheet.getRange('L:N').format.columnWidth = 20
ruleSheet.getRange(`L2:L${rules.length+1}`).conditionalFormats.add('containsText',{text:'已实现',format:{fill:green,font:{color:'#274E13',bold:true}}})
ruleSheet.getRange(`L2:L${rules.length+1}`).conditionalFormats.add('containsText',{text:'部分实现',format:{fill:yellow,font:{color:'#7F6000'}}})
ruleSheet.getRange(`L2:L${rules.length+1}`).conditionalFormats.add('containsText',{text:'待接外部数据',format:{fill:red,font:{color:'#990000'}}})
ruleSheet.getRange(`L2:L${rules.length+1}`).conditionalFormats.add('containsText',{text:'待建设',format:{fill:gray,font:{color:'#666666'}}})

const bindingHeaders = ['序号','模式编号','原子规则编号','绑定类型']
bindingSheet.getRange('A1:D1').values = [bindingHeaders]
bindingSheet.getRange('A1:D1').format = headerStyle
bindingSheet.getRangeByIndexes(1,0,bindings.length,bindingHeaders.length).values = bindings
bindingSheet.getRange(`A2:D${bindings.length+1}`).format = {borders:bodyBorder,font:{name:'Microsoft YaHei',size:10}}
bindingSheet.freezePanes.freezeRows(1)
bindingSheet.tables.add(`A1:D${bindings.length+1}`,true,'ModeRuleBindingTable')
bindingSheet.getRange('A:A').format.columnWidth = 10
bindingSheet.getRange('B:B').format.columnWidth = 18
bindingSheet.getRange('C:C').format.columnWidth = 28
bindingSheet.getRange('D:D').format.columnWidth = 16

const sceneHeaders = ['序号','场景编号','场景名称','领域','主要阶段','场景说明','绑定模式编号','模式数']
sceneSheet.getRange('A1:H1').values = [sceneHeaders]
sceneSheet.getRange('A1:H1').format = headerStyle
sceneSheet.getRangeByIndexes(1,0,sceneRows.length,sceneHeaders.length).values = sceneRows
sceneSheet.getRange(`A2:H${sceneRows.length+1}`).format = {verticalAlignment:'top',wrapText:true,borders:bodyBorder,font:{name:'Microsoft YaHei',size:10}}
sceneSheet.freezePanes.freezeRows(1)
sceneSheet.tables.add(`A1:H${sceneRows.length+1}`,true,'SceneCatalogTable')
sceneSheet.getRange('A:A').format.columnWidth = 8
sceneSheet.getRange('B:B').format.columnWidth = 22
sceneSheet.getRange('C:C').format.columnWidth = 28
sceneSheet.getRange('D:E').format.columnWidth = 16
sceneSheet.getRange('F:F').format.columnWidth = 62
sceneSheet.getRange('G:G').format.columnWidth = 70
sceneSheet.getRange('H:H').format.columnWidth = 10

for(const sheet of [modeSheet,ruleSheet,bindingSheet,sceneSheet]) sheet.getUsedRange().format.autofitRows()

await fs.mkdir(outputDir,{recursive:true})
const previews = [
  ['融合摘要','A1:H25','01_融合摘要.png'],
  ['模式目录','A1:L18','02_模式目录.png'],
  ['原子规则','A1:N18','03_原子规则.png'],
  ['模式规则绑定','A1:D24','04_模式规则绑定.png'],
  ['场景目录','A1:H13','05_场景目录.png'],
]
for(const [sheetName,range,fileName] of previews){
  const blob = await workbook.render({sheetName,range,scale:1,format:'png'})
  await fs.writeFile(`${outputDir}/${fileName}`,new Uint8Array(await blob.arrayBuffer()))
}

const inspectSummary = await workbook.inspect({kind:'table',range:'融合摘要!A1:H25',include:'values,formulas',tableMaxRows:25,tableMaxCols:8,maxChars:8000})
const inspectRules = await workbook.inspect({kind:'table',range:'原子规则!A1:N12',include:'values,formulas',tableMaxRows:12,tableMaxCols:14,maxChars:8000})
const errors = await workbook.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',options:{useRegex:true,maxResults:300},summary:'final formula error scan',maxChars:4000})
const xlsx = await SpreadsheetFile.exportXlsx(workbook)
await xlsx.save(outputPath)

console.log(JSON.stringify({outputPath,modeCount:modeRows.length,ruleCount:rules.length,bindingCount:bindings.length,sceneCount:sceneRows.length,summary:inspectSummary.ndjson,rulesPreview:inspectRules.ndjson,errors:errors.ndjson},null,2))
