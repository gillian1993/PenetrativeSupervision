import http from 'node:http'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { initializeSceneRuleDatabase } from './sceneRuleService.js'
import { handleSceneRuleApi } from './sceneRuleRouter.js'
import { initializeDataGraphDatabase, handleDataGraphApi } from './dataGraphApi.js'
import { handleDemoReadApi } from './demoReadApi.js'
import { initializeRuleCatalogDatabase } from './ruleCatalogService.js'
import { handleRuleCatalogApi } from './ruleCatalogRouter.js'
import { handleSuperAgentApi } from './superAgentRouter.js'
import { saveOntologyDraft } from './ontologyDraft.js'

const root=fileURLToPath(new URL('.',import.meta.url))

function loadLocalEnv(){
  const file=join(root,'.env.local');if(!existsSync(file))return
  for(const raw of readFileSync(file,'utf8').split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;const index=line.indexOf('=');if(index<1)continue
    const key=line.slice(0,index).trim();const value=line.slice(index+1).trim().replace(/^['"]|['"]$/g,'');if(process.env[key]===undefined)process.env[key]=value
  }
}

loadLocalEnv()
const database=process.env.MYSQL_DATABASE||'penetrative_supervision'
if(!/^[a-zA-Z0-9_]+$/.test(database))throw new Error('MYSQL_DATABASE只能包含字母、数字和下划线')
const connectionConfig={host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER||'root',password:process.env.MYSQL_PASSWORD||''}

const initialOntologies=[
  ['ONT-BASE','平台基础图谱结构','基础图谱结构','通用','V1',14,126,28,32,'启用','统一组织、人员、主体、账户、文档、预警和风险事件的基础语义。'],
  ['ONT-PROC','采购与供应链合规监管图谱','领域图谱结构','采购与供应链','V3',12,94,21,18,'启用','覆盖采购与供应链主数据、寻源、订单、到货入库、库存、质量、结算付款、风险与来源追溯的标准对象和关系。'],
  ['ONT-CONTRACT','合同合规监管图谱','领域图谱结构','合同','V2',8,67,16,0,'启用','覆盖合同主档、版本条款、审批签署、履约交付、验收结算、变更续签、风险争议和文档血缘。'],
['ONT-FIN','财务资金扩展图谱结构','领域图谱结构','财务','待启用',10,88,19,21,'草稿','覆盖付款、账户、资金流水、融资和担保关系。'],
]
const initialElements=[
  ['ONT-PROC','class','PROC.Supplier','供应商','实体类型','统一社会信用代码为主标识','参与采购、合同或服务活动的业务主体。'],
  ['ONT-PROC','class','PROC.Reviewer','评审人员','实体类型','人员编码为主标识','参与采购评审的专家或业务人员。'],
  ['ONT-PROC','class','PROC.Contract','合同','实体类型','合同编码为主标识','采购结果形成的合同对象。'],
  ['ONT-PROC','class','PROC.PurchaseProject','采购项目','实体类型','项目编码为主标识','采购立项、评审与中标的核心对象。'],
  ['ONT-PROC','class','PROC.Contact','联系方式','实体类型','联系方式标准化值为主标识','用于识别多个主体共同使用的联系方式。'],
  ['ONT-PROC','property','PROC.Supplier.credit_code','统一社会信用代码','文本','主标识、必填','供应商工商登记主标识。'],
  ['ONT-PROC','property','PROC.Supplier.phone','供应商联系电话','文本','手机号或固话','供应商登记联系方式。'],
  ['ONT-PROC','property','PROC.Reviewer.phone','评审人员联系电话','文本','脱敏比对','评审人员登记联系方式。'],
  ['ONT-PROC','property','PROC.Contract.change_rate','合同金额变更比例','数字','百分比','合同金额相对中标金额的变化比例。'],
  ['ONT-PROC','property','PROC.Contract.change_amount','合同变更金额','金额','人民币','合同累计变更金额。'],
  ['ONT-PROC','property','PROC.Contact.valid_time','关系有效时间','日期时间','标准时间','主体联系方式关系的有效时间。'],
  ['ONT-PROC','property','PROC.BidConfirmed.event_id','中标确认记录编号','文本','主标识、必填','中标确认节点实例的稳定标识。'],
  ['ONT-PROC','property','PROC.BidConfirmed.occurred_at','中标确认发生时间','日期时间','必填、发生时间','中标确认实际发生的业务时间。'],
  ['ONT-PROC','property','PROC.ContractChanged.event_id','合同变更记录编号','文本','主标识、必填','合同变更节点实例的稳定标识。'],
  ['ONT-PROC','property','PROC.ContractChanged.occurred_at','合同变更发生时间','日期时间','必填、发生时间','合同变更实际发生的业务时间。'],
  ['ONT-PROC','property','PROC.PurchaseCreated.event_id','采购立项记录编号','文本','主标识、必填','采购立项节点实例的稳定标识。'],
  ['ONT-PROC','property','PROC.PurchaseCreated.occurred_at','采购立项发生时间','日期时间','必填、发生时间','采购立项实际发生的业务时间。'],
  ['ONT-PROC','relation','PROC.supplier_contact','登记联系方式','供应商 → 联系方式','一对多','供应商登记或使用联系方式。'],
  ['ONT-PROC','relation','PROC.shared_contact','共同使用','联系方式 → 评审人员','多对多','多个主体共同使用同一联系方式。'],
  ['ONT-PROC','relation','PROC.actual_control','实际控制','供应商 → 人员','多对多','供应商实际控制关系。'],
  ['ONT-PROC','relation','PROC.bid_confirmed_project','所属采购项目','中标确认 → 采购项目','多对一、参与对象','中标确认节点实例关联对应采购项目。'],
  ['ONT-PROC','relation','PROC.contract_changed_contract','变更合同','合同变更 → 合同','多对一、参与对象','合同变更节点实例关联被变更合同。'],
  ['ONT-PROC','relation','PROC.purchase_created_project','立项项目','采购立项 → 采购项目','一对一、参与对象','采购立项节点实例关联对应采购项目。'],
  ['ONT-PROC','class','PROC.BidConfirmed','中标确认','实体类型','发生时间必填','采购项目确认中标结果的业务记录。'],
  ['ONT-PROC','class','PROC.ContractChanged','合同变更','实体类型','发生时间必填','合同金额或关键条款发生变更的业务记录。'],
  ['ONT-PROC','class','PROC.PurchaseCreated','采购立项','实体类型','发生时间必填','采购项目完成立项的业务记录。'],
]

// 采购与供应链标准图谱的核心对象。对象编码、分层语义和主链路依据
// 《采购与供应链领域标准图谱结构数据.md》整理，保留原有风险对象以兼容现有规则。
const standardProcurementClasses = [
  ['PROC.Company','公司/租户','公司编码为主标识','采购、库存和财务数据的组织归属主体。'],
  ['PROC.LegalEntity','法律主体','主体编码为主标识','具备合同签署、税务登记和开票资质的主体。'],
  ['PROC.BusinessUnit','业务单元/部门','组织编码为主标识','采购需求、成本归属和审批组织。'],
  ['PROC.User','用户/经办人','用户编码为主标识','采购员、申请人、审批人、仓库和财务人员。'],
  ['PROC.Role','角色','角色编码为主标识','用户在采购流程中的权限角色。'],
  ['PROC.Address','地址','地址编码为主标识','供应商、收货、账单和仓库地址。'],
  ['PROC.BankAccount','银行账户','账户编码为主标识','供应商收款账户和企业付款账户。'],
  ['PROC.SupplierSite','供应商地点','地点编码为主标识','供应商工厂、发货点和服务地点。'],
  ['PROC.SupplierQualification','供应商资质','资质编码为主标识','准入状态、证照、认证和有效期。'],
  ['PROC.SupplierRiskProfile','供应商风险画像','画像编码为主标识','供应商信用、合规、交付、质量和财务风险。'],
  ['PROC.SupplierPerformance','供应商绩效','绩效编码为主标识','准时率、合格率、价格竞争力和响应率。'],
  ['PROC.Product','物料/商品/产品','物料编码为主标识','可采购、入库、开票和付款的物品或服务。'],
  ['PROC.ProductIdentifier','物料标识','标识编码为主标识','GTIN、条码、内部编码和供应商料号。'],
  ['PROC.ProductCategory','物料分类/品类','分类编码为主标识','企业分类、UNSPSC分类和物料组。'],
  ['PROC.ProductAttribute','物料属性','属性编码为主标识','颜色、尺寸、品牌、规格和型号等属性。'],
  ['PROC.ProductVariant','SKU/变体','SKU编码为主标识','可交易的规格组合或条码单位。'],
  ['PROC.ProductPackage','包装规格','包装编码为主标识','采购包装、箱规、托盘和包装层级。'],
  ['PROC.SupplierProduct','供应商物料','供货关系编码为主标识','供应商与物料的供货、料号和交期关系。'],
  ['PROC.ApprovedSupplierList','合格供方清单','清单编码为主标识','物料或品类的可采购供应商清单。'],
  ['PROC.ProductPrice','采购价格','价格编码为主标识','供应商报价、协议价、阶梯价和有效期。'],
  ['PROC.PriceHistory','价格历史','记录编码为主标识','采购价格变化和历史成交价。'],
  ['PROC.Warehouse','仓库','仓库编码为主标识','采购入库、库存余额和退货出库的仓储主体。'],
  ['PROC.Location','库位','库位编码为主标识','仓库内库区、货架、质检区和虚拟库位。'],
  ['PROC.StockBalance','库存余额','余额编码为主标识','物料在地点、批次、包装和货主维度的库存事实。'],
  ['PROC.InventoryLedger','库存台账','台账编码为主标识','每一笔库存增减、估值和凭证来源。'],
  ['PROC.StockMove','库存移动','移动编码为主标识','从来源地点到目标地点的库存移动事实。'],
  ['PROC.StockMoveLine','库存移动明细','明细编码为主标识','含批次、序列号、包装和完成数量的移动明细。'],
  ['PROC.InventoryOwner','库存货主','货主编码为主标识','自有、寄存、寄售或未明确货权的主体。'],
  ['PROC.InventoryOperation','库存业务单据','单据编码为主标识','出入库、报废、形态转换和库存调整凭证。'],
  ['PROC.InventoryOperationLine','库存业务明细','明细编码为主标识','库存单据中的物料、数量、地点、货主和成本。'],
  ['PROC.InventoryTransfer','库存调拨/转库','调拨编码为主标识','调拨申请、调出、调入和在途闭环。'],
  ['PROC.InventoryCount','库存盘点','盘点编码为主标识','盘点计划、复核和盘盈盘亏来源。'],
  ['PROC.InventoryAdjustment','库存调整','调整编码为主标识','盘盈、盘亏、报废和库存状态调整。'],
  ['PROC.StockReservation','库存预留','预留编码为主标识','面向订单、客户或项目的库存预留和到期控制。'],
  ['PROC.OwnershipTransfer','货权转移','转移编码为主标识','VMI、寄售或内部交易下的货权变化事件。'],
  ['PROC.LotSerial','批次/序列号','批次序列号为主标识','批号、序列号、有效期和生产日期追踪。'],
  ['PROC.LogisticUnit','物流单元','物流单元编码为主标识','包裹、箱、托盘和SSCC物流单元。'],
  ['PROC.PurchaseRequest','采购申请/请购单','申请编码为主标识','采购需求来源和预算占用起点。'],
  ['PROC.PurchaseRequestLine','采购申请明细','明细编码为主标识','需求物料、数量、单位、日期和目标仓库。'],
  ['PROC.ApprovalTask','审批任务','审批编码为主标识','采购申请、订单、合同和付款审批过程。'],
  ['PROC.SourcingEvent','寻源/询价事件','事件编码为主标识','RFQ、竞价、招标和比价等寻源活动。'],
  ['PROC.RFQ','询价单','询价单编码为主标识','面向供应商的询价文件。'],
  ['PROC.RFQLine','询价明细','明细编码为主标识','询价物料、数量、交期和地点。'],
  ['PROC.RFQSupplier','询价供应商','邀请记录编码为主标识','被邀请供应商、发送状态和报价状态。'],
  ['PROC.SupplierQuotation','供应商报价','报价编码为主标识','供应商针对询价或需求提交的报价。'],
  ['PROC.SupplierQuotationLine','供应商报价明细','明细编码为主标识','报价物料、数量、单价、税和交期。'],
  ['PROC.BidEvaluation','报价评审/比价结果','评审编码为主标识','技术、商务、价格综合评分和排名。'],
  ['PROC.AwardDecision','授标/定标结果','授标编码为主标识','中标供应商、授标金额和授标原因。'],
  ['PROC.PurchaseAgreement','采购协议/合同','协议编码为主标识','框架协议、长期协议和采购合同。'],
  ['PROC.PurchaseAgreementLine','采购协议明细','明细编码为主标识','协议物料、协议价、有效期和执行数量。'],
  ['PROC.PurchaseOrder','采购订单','订单编码为主标识','向供应商确认采购内容、价格和交付要求。'],
  ['PROC.PurchaseOrderLine','采购订单明细','明细编码为主标识','订单物料、数量、价格、税、仓库和交期。'],
  ['PROC.PaymentPlan','付款计划','计划编码为主标识','订单、合同或发票的阶段性付款安排。'],
  ['PROC.PaymentPlanLine','付款计划明细','明细编码为主标识','付款阶段、比例、起算时点、到期日和金额。'],
  ['PROC.OrderSchedule','订单交期计划','交期编码为主标识','分批交货计划、承诺日期和计划数量。'],
  ['PROC.ChangeOrder','采购变更单','变更编码为主标识','订单数量、价格、交期和供应商变更记录。'],
  ['PROC.AdvanceShipmentNotice','发货通知/ASN','通知编码为主标识','供应商发货预告、包装和物流信息。'],
  ['PROC.ASNLine','发货通知明细','明细编码为主标识','发货物料、数量、包装和批次。'],
  ['PROC.PurchaseArrival','采购到货单','到货编码为主标识','到货、签收、拒收、请检和待入库记录。'],
  ['PROC.PurchaseArrivalLine','采购到货明细','明细编码为主标识','到货数量、实收数量、拒收数量和检验信息。'],
  ['PROC.PurchaseReceipt','采购入库单','入库编码为主标识','采购物料正式入库、形成货权和库存成本。'],
  ['PROC.PurchaseReceiptLine','采购入库明细','明细编码为主标识','入库数量、仓库、批次、成本和结算进度。'],
  ['PROC.QualityInspection','质量检验','检验编码为主标识','采购收货或物料质量检验记录。'],
  ['PROC.QualityInspectionLine','质检明细','明细编码为主标识','检验项目、标准值、实测值和判定。'],
  ['PROC.NonConformance','不合格/异常','异常编码为主标识','质量不合格、交付异常和整改跟踪。'],
  ['PROC.CorrectiveAction','纠正措施','措施编码为主标识','质量或交付异常的整改措施。'],
  ['PROC.PurchaseReturn','采购退货','退货编码为主标识','供应商退货、退料和退款来源。'],
  ['PROC.PurchaseReturnLine','采购退货明细','明细编码为主标识','退货物料、数量、原因和批次。'],
  ['PROC.PurchaseSettlement','采购结算单','结算编码为主标识','入库、发票、费用和暂估之间的结算确认。'],
  ['PROC.PurchaseSettlementLine','采购结算明细','明细编码为主标识','结算数量、单价、暂估、损耗和费用。'],
  ['PROC.PurchaseInvoice','采购发票/供应商账单','发票编码为主标识','供应商开票后形成的应付确认单据。'],
  ['PROC.PurchaseInvoiceLine','发票明细','明细编码为主标识','发票物料、数量、金额、税和来源单据。'],
  ['PROC.SupplierReconciliation','供应商对账单','对账编码为主标识','到货、入库、结算、发票和付款周期对账。'],
  ['PROC.SupplierReconciliationLine','供应商对账明细','明细编码为主标识','对账来源、数量、金额和差异状态。'],
  ['PROC.Payment','付款记录','付款编码为主标识','对采购发票、账单或供应商应付进行付款。'],
  ['PROC.PaymentAllocation','付款核销明细','核销编码为主标识','付款分配到发票、账单或业务单据的核销。'],
  ['PROC.AccountJournal','账户/日记账','账户编码为主标识','付款账户、银行账户和资金入账路径。'],
  ['PROC.RiskEvent','采购风险事件','风险编码为主标识','预算、供应商、流程、履约和付款风险事实。'],
  ['PROC.DocumentAttachment','业务附件','附件编码为主标识','合同、报价、审批、验收等业务证明材料。'],
  ['PROC.SourceSystem','来源系统','系统编码为主标识','ERP、OA及外部数据来源系统。'],
  ['PROC.SourceRecord','来源记录','来源记录编码为主标识','源表、源主键、抽取批次和行级血缘。'],
]

const standardProcurementProperties = [
  ['PROC.Company.code','公司编码','文本','主标识、必填','组织主体唯一编码。'],
  ['PROC.Supplier.name','供应商名称','文本','必填','供应商主体名称。'],
  ['PROC.Supplier.status','供应商状态','枚举','准入/停用/黑名单','供应商准入与治理状态。'],
  ['PROC.Supplier.credit_code','统一社会信用代码','文本','主标识、必填','供应商工商登记主标识。'],
  ['PROC.Supplier.gln','全球位置码GLN','文本','可选','参与方或地点的GS1标识。'],
  ['PROC.SupplierQualification.type','资质类型','枚举','军工/涉密/体系/营业执照','供应商资质类别。'],
  ['PROC.SupplierQualification.valid_to','资质有效期','日期','必填','资质证照失效日期。'],
  ['PROC.SupplierPerformance.on_time_rate','准时交付率','百分比','0-100%','供应商履约准时率。'],
  ['PROC.Product.item_code','物料编码','文本','主标识、必填','物料内部编码。'],
  ['PROC.Product.gtin','全球贸易项目代码GTIN','文本','可选','物料跨系统唯一标识。'],
  ['PROC.ProductCategory.unspsc_commodity','UNSPSC品类编码','文本','可选','采购品类标准编码。'],
  ['PROC.ProductPrice.price','采购单价','金额','必填','供应商报价或协议价格。'],
  ['PROC.ProductPrice.valid_to','价格有效期','日期','可选','价格适用截止日期。'],
  ['PROC.Warehouse.code','仓库编码','文本','主标识、必填','仓储主体编码。'],
  ['PROC.Location.code','库位编码','文本','主标识、必填','仓库内库位编码。'],
  ['PROC.StockBalance.quantity','现存量','数字','必填','物料在地点和批次维度的库存数量。'],
  ['PROC.StockBalance.available_quantity','可用量','数字','可选','扣除预留后的可用库存。'],
  ['PROC.LotSerial.lot_no','批次号','文本','批次/序列号二选一','批次追溯标识。'],
  ['PROC.LotSerial.serial_no','序列号','文本','批次/序列号二选一','序列号追溯标识。'],
  ['PROC.PurchaseRequest.request_no','请购单号','文本','主标识、必填','采购需求来源单据编号。'],
  ['PROC.PurchaseRequest.request_date','申请日期','日期','必填','采购申请发生日期。'],
  ['PROC.RFQ.rfq_no','询价单号','文本','主标识、必填','面向供应商的询价单据编号。'],
  ['PROC.SupplierQuotation.amount','报价金额','金额','必填','供应商报价总金额。'],
  ['PROC.BidEvaluation.rank','评审排名','数字','必填','评审或比价后的供应商排名。'],
  ['PROC.AwardDecision.award_amount','授标金额','金额','必填','授标确认金额。'],
  ['PROC.PurchaseOrder.order_no','采购订单号','文本','主标识、必填','正式采购订单编号。'],
  ['PROC.PurchaseOrder.total_amount','订单总额','金额','必填','采购订单含税或未税总额。'],
  ['PROC.PurchaseOrder.promised_date','承诺交期','日期','必填','供应商承诺交付日期。'],
  ['PROC.PaymentPlan.due_date','付款到期日','日期','可选','阶段性付款到期日期。'],
  ['PROC.PurchaseArrival.received_quantity','实收数量','数字','必填','到货实际接收数量。'],
  ['PROC.PurchaseReceipt.receipt_date','入库日期','日期','必填','采购入库过账日期。'],
  ['PROC.PurchaseReceiptLine.cost_amount','入库成本','金额','可选','入库形成的库存成本。'],
  ['PROC.QualityInspection.result','检验结论','枚举','合格/不合格/待复检','来料质量检验结论。'],
  ['PROC.PurchaseSettlement.settlement_amount','结算金额','金额','必填','采购结算确认金额。'],
  ['PROC.PurchaseInvoice.invoice_no','发票号','文本','主标识、必填','供应商发票或账单编号。'],
  ['PROC.Payment.payment_date','付款日期','日期','必填','付款实际发生日期。'],
  ['PROC.PaymentAllocation.allocated_amount','核销金额','金额','必填','付款分配到业务单据的金额。'],
  ['PROC.RiskEvent.level','风险等级','枚举','高/中/低','采购与供应链风险等级。'],
  ['PROC.SourceRecord.source_pk','来源主键','文本','主标识、必填','来源系统原始记录主键。'],
]

const standardProcurementRelations = [
  ['PROC.owns_supplier','拥有供应商','PROC.Company','PROC.Supplier','公司维护供应商主体。'],
  ['PROC.has_site','拥有供货地点','PROC.Supplier','PROC.SupplierSite','供应商关联工厂或服务地点。'],
  ['PROC.has_qualification','具备资质','PROC.Supplier','PROC.SupplierQualification','供应商关联资质证照和认证。'],
  ['PROC.has_risk_profile','形成风险画像','PROC.Supplier','PROC.SupplierRiskProfile','供应商关联综合风险画像。'],
  ['PROC.has_performance','产生绩效','PROC.Supplier','PROC.SupplierPerformance','供应商关联周期绩效指标。'],
  ['PROC.supplies_product','供应物料','PROC.Supplier','PROC.Product','供应商与可供物料建立供货关系。'],
  ['PROC.product_in_category','属于品类','PROC.Product','PROC.ProductCategory','物料归属标准采购品类。'],
  ['PROC.product_has_variant','包含SKU','PROC.Product','PROC.ProductVariant','物料关联可交易规格变体。'],
  ['PROC.product_has_price','适用采购价格','PROC.Product','PROC.ProductPrice','物料关联供应商报价或协议价。'],
  ['PROC.warehouse_contains_location','包含库位','PROC.Warehouse','PROC.Location','仓库包含库区或库位。'],
  ['PROC.balance_of_product','形成库存余额','PROC.Product','PROC.StockBalance','物料在仓储维度形成库存事实。'],
  ['PROC.balance_at_location','位于库位','PROC.StockBalance','PROC.Location','库存余额落在具体库位。'],
  ['PROC.move_generates_balance','更新库存余额','PROC.StockMove','PROC.StockBalance','库存移动更新库存余额。'],
  ['PROC.move_uses_lot','使用批次序列号','PROC.StockMoveLine','PROC.LotSerial','库存移动关联批次或序列号。'],
  ['PROC.request_has_line','包含申请明细','PROC.PurchaseRequest','PROC.PurchaseRequestLine','请购单包含需求明细。'],
  ['PROC.request_submitted_by','申请人','PROC.PurchaseRequest','PROC.User','请购单由经办人提交。'],
  ['PROC.request_sources_order','形成采购订单','PROC.PurchaseRequest','PROC.PurchaseOrder','采购需求转化为正式订单。'],
  ['PROC.sourcing_has_rfq','发起询价','PROC.SourcingEvent','PROC.RFQ','寻源事件形成询价单。'],
  ['PROC.rfq_invites_supplier','邀请供应商','PROC.RFQ','PROC.RFQSupplier','询价单邀请供应商参与报价。'],
  ['PROC.quotation_responds_rfq','响应询价','PROC.SupplierQuotation','PROC.RFQ','供应商报价响应询价。'],
  ['PROC.quotation_from_supplier','由供应商报价','PROC.SupplierQuotation','PROC.Supplier','报价归属供应商主体。'],
  ['PROC.evaluation_reviews_quotation','评审报价','PROC.BidEvaluation','PROC.SupplierQuotation','评审结果引用供应商报价。'],
  ['PROC.award_awards_supplier','授标供应商','PROC.AwardDecision','PROC.Supplier','授标结果确认中标供应商。'],
  ['PROC.award_generates_order','生成采购订单','PROC.AwardDecision','PROC.PurchaseOrder','授标结果形成采购订单。'],
  ['PROC.order_ordered_from_supplier','向供应商下单','PROC.PurchaseOrder','PROC.Supplier','采购订单对应供应商。'],
  ['PROC.order_has_line','包含订单明细','PROC.PurchaseOrder','PROC.PurchaseOrderLine','订单包含物料、数量和价格明细。'],
  ['PROC.order_has_payment_plan','配置付款计划','PROC.PurchaseOrder','PROC.PaymentPlan','订单关联阶段性付款安排。'],
  ['PROC.arrival_against_order','依据订单到货','PROC.PurchaseArrival','PROC.PurchaseOrder','采购到货来源于采购订单。'],
  ['PROC.arrival_has_line','包含到货明细','PROC.PurchaseArrival','PROC.PurchaseArrivalLine','到货单包含实收和拒收明细。'],
  ['PROC.receipt_receives_arrival','接收入库','PROC.PurchaseReceipt','PROC.PurchaseArrival','采购入库承接到货记录。'],
  ['PROC.receipt_has_line','包含入库明细','PROC.PurchaseReceipt','PROC.PurchaseReceiptLine','入库单包含批次、成本和数量明细。'],
  ['PROC.inspection_inspects_arrival','检验到货','PROC.QualityInspection','PROC.PurchaseArrival','质检关联采购到货。'],
  ['PROC.return_against_receipt','依据入库退货','PROC.PurchaseReturn','PROC.PurchaseReceipt','退货来源于采购入库。'],
  ['PROC.settlement_settles_receipt','结算入库','PROC.PurchaseSettlement','PROC.PurchaseReceipt','采购结算引用入库数量和成本。'],
  ['PROC.invoice_bills_settlement','结算开票','PROC.PurchaseInvoice','PROC.PurchaseSettlement','发票关联采购结算。'],
  ['PROC.invoice_bills_order','订单开票','PROC.PurchaseInvoice','PROC.PurchaseOrder','发票可追溯至采购订单。'],
  ['PROC.payment_allocates_invoice','付款核销发票','PROC.Payment','PROC.PurchaseInvoice','付款分配至供应商发票。'],
  ['PROC.reconciliation_checks_payment','对账核验付款','PROC.SupplierReconciliation','PROC.Payment','供应商对账核验付款记录。'],
  ['PROC.approval_approves_document','审批业务单据','PROC.ApprovalTask','PROC.PurchaseOrder','审批任务关联采购业务单据。'],
  ['PROC.risk_affects_supplier','影响供应商','PROC.RiskEvent','PROC.Supplier','风险事件指向供应商治理。'],
  ['PROC.risk_affects_order','影响采购订单','PROC.RiskEvent','PROC.PurchaseOrder','风险事件指向订单执行。'],
  ['PROC.attachment_attached_to','附件归属单据','PROC.DocumentAttachment','PROC.PurchaseOrder','业务附件归属采购单据或证据对象。'],
]

// 合同领域标准图谱对象，依据《合同领域标准图谱结构数据.md》附录 A-C 整理。
// 合同主档、条款、履约和结算事实独立建模，便于合同审查与穿透追溯。
const standardContractClasses = [
  ['CONTRACT.SourceSystem','来源系统','系统编码为主标识','ERP、OA及外部合同数据来源系统。'],
  ['CONTRACT.SourceRecord','来源记录','来源记录编码为主标识','保留源对象、源主键、抽取批次和原始定位。'],
  ['CONTRACT.Company','公司/账套','公司编码为主标识','合同业务所属组织或账套。'],
  ['CONTRACT.LegalEntity','法律主体','法律主体编码为主标识','具备合同签署、开票和收付款资格的主体。'],
  ['CONTRACT.BusinessUnit','业务单元/部门','组织编码为主标识','合同归属、执行、成本和审批组织。'],
  ['CONTRACT.User','用户/经办人','用户编码为主标识','合同起草、审批、签署、履约和结算人员。'],
  ['CONTRACT.Party','合同参与方','参与方编码为主标识','客户、供应商、员工、合作方或内部主体。'],
  ['CONTRACT.PartyRole','合同参与方角色','合同+参与方+角色为主标识','甲方、乙方、担保方、开票方、收款方和履约方。'],
  ['CONTRACT.Contact','联系人','联系人编码为主标识','合同通知和履约联络人。'],
  ['CONTRACT.Address','地址/履约地点','地址编码为主标识','签约、交付、服务、开票和通知地点。'],
  ['CONTRACT.ContractType','合同类型','类型编码为主标识','销售、采购、服务、框架、租赁、劳动等类型。'],
  ['CONTRACT.ContractCategory','合同分类','分类编码为主标识','按业务、行业、风险和组织进行分类。'],
  ['CONTRACT.Contract','合同主档','合同编号为主标识','承载合同编号、相对方、期限、金额、状态和法律关系。'],
  ['CONTRACT.ContractVersion','合同版本','合同+版本号为主标识','合同正文、变更和生效版本。'],
  ['CONTRACT.ContractTemplate','合同模板','模板编码为主标识','可复用合同正文和变量模板。'],
  ['CONTRACT.ContractSection','合同章节','版本+章节号为主标识','合同正文章节和段落分组。'],
  ['CONTRACT.ContractClause','合同条款','合同+条款号为主标识','可单独跟踪、审批和履约的条款。'],
  ['CONTRACT.ClauseVersion','条款版本','条款+版本号为主标识','条款文本、来源和有效期版本。'],
  ['CONTRACT.Document','合同文档','文档哈希为主标识','正文、扫描件、补充协议和证明材料。'],
  ['CONTRACT.DocumentVersion','文档版本','文档+版本号为主标识','文档内容和格式版本。'],
  ['CONTRACT.ApprovalTask','审批任务','业务对象+节点号为主标识','合同、变更或终止的审批节点。'],
  ['CONTRACT.ApprovalRecord','审批记录','审批任务+动作号为主标识','审批处理、结果、意见和时间。'],
  ['CONTRACT.SignatureRecord','签署记录','版本+签署方+签署序号为主标识','合同版本的签署动作。'],
  ['CONTRACT.SignatureEvidence','签署证据','签署记录+证据号为主标识','签名、印章、证书、IP、时间戳和证据文件。'],
  ['CONTRACT.ContractObligation','合同义务','合同+义务号为主标识','责任方、履行内容、期限、金额和验收条件。'],
  ['CONTRACT.ContractRight','合同权利','合同+权利号为主标识','权利方、触发条件、额度和期限。'],
  ['CONTRACT.ContractDeliverable','合同交付物','合同+交付物号为主标识','货物、服务、成果或文件交付要求。'],
  ['CONTRACT.Milestone','合同里程碑','合同+里程碑号为主标识','阶段计划、完成和验收节点。'],
  ['CONTRACT.Acceptance','验收记录','来源系统+验收号为主标识','交付物或阶段成果的验收结果。'],
  ['CONTRACT.ServiceLevelAgreement','服务级别协议','合同+SLA号为主标识','服务时间、响应、解决和升级规则。'],
  ['CONTRACT.SLACommitment','SLA承诺','SLA+承诺号为主标识','可度量服务指标和目标值。'],
  ['CONTRACT.Opportunity','商务机会','来源系统+机会号为主标识','合同签订前的商机和客户需求。'],
  ['CONTRACT.Quotation','报价单','来源系统+报价号为主标识','合同前置报价和议价记录。'],
  ['CONTRACT.PurchaseAgreement','采购协议/框架协议','来源系统+协议号为主标识','采购长期价格、供货和履约条件。'],
  ['CONTRACT.SalesOrder','销售订单','来源系统+销售订单号为主标识','合同销售履约或生单事实。'],
  ['CONTRACT.PurchaseOrder','采购订单','来源系统+采购订单号为主标识','合同采购履约或生单事实。'],
  ['CONTRACT.OrderLine','订单明细','订单+行号为主标识','产品/服务、数量、价格、税和交期。'],
  ['CONTRACT.Project','合同执行项目','来源系统+项目号为主标识','合同交付和成本执行容器。'],
  ['CONTRACT.Task','合同履约任务','来源系统+任务号为主标识','可执行的交付、验收和整改任务。'],
  ['CONTRACT.Timesheet','服务工时','来源系统+工时号为主标识','按工时履约或计费的服务事实。'],
  ['CONTRACT.Delivery','交付记录','来源系统+交付号为主标识','货物、服务或成果实际交付事件。'],
  ['CONTRACT.AcceptanceLine','验收明细','验收+行号为主标识','验收数量、质量、结果和差异。'],
  ['CONTRACT.ContractChange','合同变更','来源系统+变更号为主标识','金额、期限、范围、主体或条款变更。'],
  ['CONTRACT.Renewal','合同续签','合同+续签号为主标识','续签、自动续期和续签结果。'],
  ['CONTRACT.Suspension','合同暂停','合同+暂停号为主标识','部分或全部义务暂停。'],
  ['CONTRACT.Termination','合同终止/解除','合同+终止号为主标识','到期、解除、取消、失效及原因。'],
  ['CONTRACT.Closeout','合同结项','合同+结项号为主标识','履约、验收、结算、归档和保证义务闭环。'],
  ['CONTRACT.Invoice','销售发票','来源系统+发票号为主标识','合同销售开票事实。'],
  ['CONTRACT.Bill','采购账单','来源系统+账单号为主标识','合同采购开票事实。'],
  ['CONTRACT.PaymentPlan','付款计划','归属对象+计划号为主标识','分期、触发点、比例和到期日。'],
  ['CONTRACT.Payment','收付款','来源系统+付款号为主标识','合同相关资金执行事实。'],
  ['CONTRACT.PaymentAllocation','付款核销','付款+核销号为主标识','付款与发票、账单或合同的分配。'],
  ['CONTRACT.RiskEvent','合同风险事件','来源系统+风险号为主标识','逾期、金额、合规、证照和履约风险。'],
  ['CONTRACT.BreachEvent','违约事件','来源系统+违约号为主标识','未履行、逾期、质量或付款违约。'],
  ['CONTRACT.Claim','索赔','来源系统+索赔号为主标识','因违约或损失提出的索赔请求。'],
  ['CONTRACT.Dispute','合同争议','来源系统+争议号为主标识','协商、仲裁、诉讼和争议结果。'],
  ['CONTRACT.CorrectiveAction','整改措施','来源系统+整改号为主标识','风险、违约、验收差异的纠正措施。'],
  ['CONTRACT.Communication','合同沟通','来源系统+沟通号为主标识','邮件、评论、会议、通知和往来。'],
  ['CONTRACT.ContractValueFact','合同金额事实','合同+日期+事实类型为主标识','合同额、变更额、执行额、开票额和付款额。'],
  ['CONTRACT.ObligationPerformanceFact','义务履约事实','义务+日期为主标识','义务完成率、逾期天数和验收率。'],
  ['CONTRACT.RenewalForecast','续签预测','合同+预测日期为主标识','到期合同、续签概率和预警。'],
  ['CONTRACT.PaymentExposure','付款暴露','合同+快照日期为主标识','未开票、未付款、质保金和保证金暴露。'],
]

const standardContractProperties = [
  ['CONTRACT.Common.source_system_code','来源系统编码','文本','必填','ERPNext、Odoo、Aureus、jshERP等来源。'],
  ['CONTRACT.Common.source_object_type','来源对象类型','文本','必填','源DocType、ORM模型、表或实体名称。'],
  ['CONTRACT.Common.source_record_id','来源主键','文本','必填','源对象主键或业务编号。'],
  ['CONTRACT.Common.source_record_url','来源定位','文本','可选','源文件、表、API或记录定位信息。'],
  ['CONTRACT.Common.source_batch_id','抽取批次','文本','必填','数据抽取或归并批次。'],
  ['CONTRACT.Common.standard_id','标准对象主键','文本','必填','统一图谱对象标识。'],
  ['CONTRACT.Common.external_no','外部业务编号','文本','可选','外部系统可见的业务编号。'],
  ['CONTRACT.Common.title','标题/名称','文本','可选','对象展示名称或主题。'],
  ['CONTRACT.Common.description','说明','长文本','可选','业务说明、备注或摘要。'],
  ['CONTRACT.Common.record_status','记录状态','枚举','必填','有效、无效、删除、归档、待核验。'],
  ['CONTRACT.Common.record_hash','记录哈希','文本','可选','用于重复检测和变更比对。'],
  ['CONTRACT.Company.company_code','公司编码','文本','必填','公司或账套编码。'],
  ['CONTRACT.Company.company_name','公司名称','文本','必填','公司或账套名称。'],
  ['CONTRACT.Company.base_currency_code','本位币','文本','可选','会计主体本位币。'],
  ['CONTRACT.LegalEntity.legal_entity_code','法律主体编码','文本','必填','签约主体唯一编码。'],
  ['CONTRACT.LegalEntity.registered_name','登记名称','文本','必填','工商或注册名称。'],
  ['CONTRACT.LegalEntity.registration_no','登记/统一社会信用代码','文本','可选','主体登记标识。'],
  ['CONTRACT.LegalEntity.tax_registration_no','税务登记号','文本','可选','开票和税务主体标识。'],
  ['CONTRACT.BusinessUnit.business_unit_code','业务单元编码','文本','必填','合同归属或执行组织。'],
  ['CONTRACT.BusinessUnit.business_unit_name','业务单元名称','文本','必填','部门、团队或利润中心名称。'],
  ['CONTRACT.User.user_id','用户标识','文本','必填','系统用户唯一标识。'],
  ['CONTRACT.User.user_name','用户名称','文本','必填','用户显示名称。'],
  ['CONTRACT.User.role_code','业务角色','文本','可选','合同管理员、采购员、销售员或审批人。'],
  ['CONTRACT.Party.party_code','参与方编码','文本','必填','客户、供应商、员工或合作方编码。'],
  ['CONTRACT.Party.party_name','参与方名称','文本','必填','合同相对方名称。'],
  ['CONTRACT.Party.party_type','参与方类型','枚举','必填','公司、客户、供应商、员工、个人或其他。'],
  ['CONTRACT.Party.registration_no','参与方登记编号','文本','可选','统一社会信用代码或注册号。'],
  ['CONTRACT.PartyRole.role_code','合同角色','枚举','必填','甲方、乙方、担保方、履约方、开票方或收款方。'],
  ['CONTRACT.PartyRole.is_primary','是否主要方','布尔','必填','是否为该角色的主要参与方。'],
  ['CONTRACT.Contact.contact_name','联系人姓名','文本','必填','联系人名称。'],
  ['CONTRACT.Contact.email','邮箱','文本','可选','合同通知或业务沟通邮箱。'],
  ['CONTRACT.Contact.phone','电话','文本','可选','合同通知或业务沟通电话。'],
  ['CONTRACT.Address.address_type','地址类型','枚举','必填','签约、履约、交付、开票、通知或注册地址。'],
  ['CONTRACT.Address.address_text','地址文本','长文本','必填','完整地址。'],
  ['CONTRACT.Contract.contract_no','合同编号','文本','必填','合同业务编号。'],
  ['CONTRACT.Contract.contract_title','合同名称','文本','必填','合同主题或项目名称。'],
  ['CONTRACT.Contract.contract_type_code','合同类型','枚举','必填','销售、采购、服务、框架、租赁、劳动或其他。'],
  ['CONTRACT.Contract.contract_category_code','合同分类','文本','可选','行业、业务或风险分类。'],
  ['CONTRACT.Contract.owner_company_id','所属公司','文本','必填','合同归属公司或账套。'],
  ['CONTRACT.Contract.signing_entity_id','签约主体','文本','必填','本方签约法律主体。'],
  ['CONTRACT.Contract.primary_party_id','主要相对方','文本','必填','主要客户、供应商或合作方。'],
  ['CONTRACT.Contract.contract_template_id','合同模板','文本','可选','生成合同正文的模板。'],
  ['CONTRACT.Contract.source_document_type','来源单据类型','文本','可选','报价、协议、订单或项目。'],
  ['CONTRACT.Contract.source_document_id','来源单据','文本','可选','来源单据主键或编号。'],
  ['CONTRACT.Contract.signing_date','签署日期','日期','可选','合同签署日期。'],
  ['CONTRACT.Contract.effective_date','生效日期','日期','可选','合同生效日期。'],
  ['CONTRACT.Contract.expiration_date','到期日期','日期','可选','合同到期日期。'],
  ['CONTRACT.Contract.auto_renewal_flag','自动续签','布尔','可选','是否满足条件自动续签。'],
  ['CONTRACT.Contract.renewal_notice_days','续签提醒天数','数字','可选','到期前提醒天数。'],
  ['CONTRACT.Contract.currency_code','合同币种','文本','可选','合同金额币种。'],
  ['CONTRACT.Contract.contract_amount','合同金额','金额','可选','初始合同含税或约定总金额。'],
  ['CONTRACT.Contract.tax_amount','税额','金额','可选','合同税额。'],
  ['CONTRACT.Contract.change_amount','变更金额累计','金额','可选','经生效变更后的金额调整。'],
  ['CONTRACT.Contract.executed_amount','已执行金额','金额','可选','已交付、开票或结算口径的执行金额。'],
  ['CONTRACT.Contract.paid_amount','已收付金额','金额','可选','与合同相关的已收或已付款金额。'],
  ['CONTRACT.Contract.document_status','单据状态','枚举','必填','草稿、审批中、已批准、已签署、已归档或已取消。'],
  ['CONTRACT.Contract.lifecycle_status','生命周期状态','枚举','必填','起草、审批、签署、生效、履约中、暂停、到期、终止或结项。'],
  ['CONTRACT.Contract.signature_status','签署状态','枚举','必填','未签署、部分签署、已签署、签署失败或无需签署。'],
  ['CONTRACT.Contract.fulfilment_status','履约状态','枚举','必填','未开始、履约中、部分完成、已完成、逾期或无法履约。'],
  ['CONTRACT.Contract.risk_level','风险等级','枚举','可选','低、中、高、重大或待评估。'],
  ['CONTRACT.Contract.confidentiality_level','保密等级','枚举','可选','公开、内部、机密或严格机密。'],
  ['CONTRACT.Contract.termination_reason','终止原因','长文本','可选','到期、违约、协商解除或取消原因。'],
  ['CONTRACT.ContractVersion.version_no','合同版本号','文本','必填','合同正文版本号。'],
  ['CONTRACT.ContractVersion.version_reason','版本原因','长文本','可选','新签、修订、补充或扫描替换。'],
  ['CONTRACT.ContractVersion.effective_from','版本生效时间','日期时间','必填','版本开始生效时间。'],
  ['CONTRACT.ContractVersion.effective_to','版本失效时间','日期时间','可选','版本结束生效时间。'],
  ['CONTRACT.ContractTemplate.template_code','模板编码','文本','必填','模板唯一编码。'],
  ['CONTRACT.ContractTemplate.template_name','模板名称','文本','必填','模板名称。'],
  ['CONTRACT.ContractClause.clause_no','条款编号','文本','必填','合同条款编号。'],
  ['CONTRACT.ContractClause.clause_type','条款类型','枚举','必填','标的、价格、交付、付款、保密、违约或争议等。'],
  ['CONTRACT.ContractClause.clause_text','条款正文','长文本','必填','条款原文。'],
  ['CONTRACT.ContractClause.mandatory_flag','是否强制条款','布尔','可选','是否为业务必备条款。'],
  ['CONTRACT.ContractClause.risk_level','条款风险等级','枚举','可选','低、中、高或重大。'],
  ['CONTRACT.ApprovalTask.business_type','审批业务类型','枚举','必填','合同、变更、终止或付款。'],
  ['CONTRACT.ApprovalTask.business_id','审批业务对象','文本','必填','待审批业务对象标识。'],
  ['CONTRACT.ApprovalTask.node_no','审批节点号','数字','必填','审批流程节点序号。'],
  ['CONTRACT.ApprovalTask.status','审批状态','枚举','必填','待审批、已通过、已驳回、已退回或已撤回。'],
  ['CONTRACT.ApprovalRecord.action','审批动作','枚举','必填','通过、驳回、退回、转交或撤回。'],
  ['CONTRACT.ApprovalRecord.comment','审批意见','长文本','可选','审批处理意见。'],
  ['CONTRACT.ApprovalRecord.processed_at','处理时间','日期时间','必填','审批处理时间。'],
  ['CONTRACT.SignatureRecord.signer_id','签署方标识','文本','必填','具体签署人或签署方。'],
  ['CONTRACT.SignatureRecord.signature_status','签署状态','枚举','必填','未签署、已签署、失败或撤销。'],
  ['CONTRACT.SignatureRecord.signed_at','签署时间','日期时间','可选','签署完成时间。'],
  ['CONTRACT.SignatureRecord.signature_channel','签署渠道','枚举','可选','电子签、纸质签或其他。'],
  ['CONTRACT.SignatureEvidence.evidence_type','证据类型','枚举','必填','签名、印章、证书、IP、时间戳或文件。'],
  ['CONTRACT.SignatureEvidence.evidence_hash','证据哈希','文本','必填','签署证据完整性摘要。'],
  ['CONTRACT.ContractObligation.obligation_no','义务编号','文本','必填','合同义务编号。'],
  ['CONTRACT.ContractObligation.obligation_type','义务类型','枚举','必填','交付、付款、保密、服务、维护或其他。'],
  ['CONTRACT.ContractObligation.responsible_party_id','责任方','文本','必填','承担义务的参与方。'],
  ['CONTRACT.ContractObligation.due_date','义务截止日期','日期','可选','义务完成期限。'],
  ['CONTRACT.ContractObligation.status','义务状态','枚举','必填','未开始、进行中、已完成、逾期或豁免。'],
  ['CONTRACT.ContractDeliverable.deliverable_no','交付物编号','文本','必填','交付物编号。'],
  ['CONTRACT.ContractDeliverable.deliverable_type','交付物类型','枚举','必填','货物、服务、成果、文件或数据。'],
  ['CONTRACT.ContractDeliverable.planned_date','计划交付日期','日期','可选','计划交付时间。'],
  ['CONTRACT.ContractDeliverable.acceptance_criteria','验收标准','长文本','可选','交付物验收条件。'],
  ['CONTRACT.Milestone.milestone_no','里程碑编号','文本','必填','合同阶段节点编号。'],
  ['CONTRACT.Milestone.planned_date','计划日期','日期','必填','里程碑计划日期。'],
  ['CONTRACT.Milestone.actual_date','实际日期','日期','可选','里程碑实际完成日期。'],
  ['CONTRACT.Acceptance.acceptance_no','验收编号','文本','必填','验收记录编号。'],
  ['CONTRACT.Acceptance.acceptance_date','验收日期','日期','必填','验收发生日期。'],
  ['CONTRACT.Acceptance.result','验收结果','枚举','必填','合格、不合格、部分通过或待整改。'],
  ['CONTRACT.Acceptance.accepted_by','验收人','文本','必填','验收处理人。'],
  ['CONTRACT.ServiceLevelAgreement.sla_no','SLA编号','文本','必填','服务级别协议编号。'],
  ['CONTRACT.ServiceLevelAgreement.service_window','服务时段','文本','可选','约定服务时间窗口。'],
  ['CONTRACT.SLACommitment.metric_code','指标编码','文本','必填','SLA指标编码。'],
  ['CONTRACT.SLACommitment.target_value','目标值','数字','必填','服务指标目标值。'],
  ['CONTRACT.SLACommitment.unit','计量单位','文本','必填','小时、天、百分比或次数。'],
  ['CONTRACT.OrderLine.quantity','数量','数字','必填','订单明细数量。'],
  ['CONTRACT.OrderLine.unit_price','含税单价','金额','必填','订单明细单价。'],
  ['CONTRACT.OrderLine.tax_rate','税率','百分比','可选','订单明细税率。'],
  ['CONTRACT.Project.project_no','项目编号','文本','必填','合同执行项目编号。'],
  ['CONTRACT.Task.task_no','任务编号','文本','必填','合同履约任务编号。'],
  ['CONTRACT.Delivery.delivery_no','交付编号','文本','必填','交付记录编号。'],
  ['CONTRACT.Delivery.delivered_at','交付时间','日期时间','必填','实际交付时间。'],
  ['CONTRACT.ContractChange.change_no','变更单号','文本','必填','合同变更编号。'],
  ['CONTRACT.ContractChange.change_type','变更类型','枚举','必填','条款、金额、期限、范围、主体、交付或付款。'],
  ['CONTRACT.ContractChange.reason','变更原因','长文本','可选','业务或法律变更原因。'],
  ['CONTRACT.ContractChange.effective_date','变更生效日期','日期','可选','变更生效时间。'],
  ['CONTRACT.Renewal.renewal_no','续签编号','文本','必填','续签事件编号。'],
  ['CONTRACT.Renewal.renewal_type','续签类型','枚举','必填','手工续签、自动续期或重新谈判。'],
  ['CONTRACT.Termination.termination_no','终止编号','文本','必填','终止事件编号。'],
  ['CONTRACT.Termination.termination_type','终止类型','枚举','必填','到期、协商解除、违约解除、取消或部分终止。'],
  ['CONTRACT.Termination.termination_date','终止日期','日期','必填','终止生效日期。'],
  ['CONTRACT.Termination.termination_reason','终止原因','长文本','必填','终止或解除原因。'],
  ['CONTRACT.Closeout.closeout_date','结项日期','日期','必填','合同结项日期。'],
  ['CONTRACT.Closeout.closeout_status','结项状态','枚举','必填','待结项、履约确认、结算确认、资料归档或已结项。'],
  ['CONTRACT.Invoice.invoice_no','发票号','文本','必填','销售发票编号。'],
  ['CONTRACT.Bill.bill_no','账单号','文本','必填','采购账单编号。'],
  ['CONTRACT.PaymentPlan.plan_no','付款计划编号','文本','必填','付款计划编号。'],
  ['CONTRACT.PaymentPlan.due_date','付款到期日','日期','可选','阶段性付款到期日期。'],
  ['CONTRACT.PaymentPlan.amount','计划金额','金额','可选','付款计划金额。'],
  ['CONTRACT.Payment.payment_no','付款编号','文本','必填','收付款记录编号。'],
  ['CONTRACT.Payment.payment_date','付款日期','日期','必填','付款实际发生日期。'],
  ['CONTRACT.Payment.amount','付款金额','金额','必填','收付款金额。'],
  ['CONTRACT.PaymentAllocation.allocated_amount','核销金额','金额','必填','付款分配到业务单据的金额。'],
  ['CONTRACT.RiskEvent.risk_no','风险编号','文本','必填','风险事件编号。'],
  ['CONTRACT.RiskEvent.risk_type','风险类型','枚举','必填','到期、履约、付款、合规、证照、数据或声誉。'],
  ['CONTRACT.RiskEvent.risk_level','风险等级','枚举','必填','低、中、高或重大。'],
  ['CONTRACT.RiskEvent.mitigation_plan','缓解计划','长文本','可选','风险处置措施。'],
  ['CONTRACT.BreachEvent.breach_no','违约编号','文本','必填','违约事件编号。'],
  ['CONTRACT.BreachEvent.breach_type','违约类型','枚举','必填','交付逾期、质量、付款、保密或合规。'],
  ['CONTRACT.BreachEvent.occurred_at','发生时间','日期时间','必填','违约发生时间。'],
  ['CONTRACT.BreachEvent.cure_due_date','整改截止日期','日期','可选','违约补救截止日期。'],
  ['CONTRACT.Claim.claim_no','索赔编号','文本','必填','索赔请求编号。'],
  ['CONTRACT.Claim.claimant_id','索赔方','文本','必填','提出索赔的一方。'],
  ['CONTRACT.Claim.claimed_amount','索赔金额','金额','可选','索赔请求金额。'],
  ['CONTRACT.Dispute.dispute_no','争议编号','文本','必填','争议事项编号。'],
  ['CONTRACT.Dispute.dispute_type','争议类型','枚举','必填','解释、付款、交付、质量、终止或知识产权。'],
  ['CONTRACT.Dispute.resolution_channel','解决渠道','枚举','可选','协商、调解、仲裁或诉讼。'],
  ['CONTRACT.CorrectiveAction.action_no','整改编号','文本','必填','整改措施编号。'],
  ['CONTRACT.CorrectiveAction.owner_id','责任人','文本','必填','整改负责人。'],
  ['CONTRACT.CorrectiveAction.due_date','整改截止日期','日期','可选','整改完成期限。'],
  ['CONTRACT.Document.document_no','文档编号','文本','必填','合同文档或档案编号。'],
  ['CONTRACT.Document.document_type','文档类型','枚举','必填','合同正文、补充协议、报价、验收、发票或签署证据。'],
  ['CONTRACT.Document.file_name','文件名','文本','必填','文件名称。'],
  ['CONTRACT.Document.file_format','文件格式','文本','可选','PDF、DOCX、图片、XML或其他。'],
  ['CONTRACT.Document.file_hash','文件哈希','文本','必填','文件完整性校验值。'],
  ['CONTRACT.Document.confidentiality_level','保密等级','枚举','可选','公开、内部、机密或严格机密。'],
  ['CONTRACT.Communication.communication_type','沟通类型','枚举','必填','邮件、评论、会议、通知、电话或其他。'],
  ['CONTRACT.Communication.occurred_at','沟通时间','日期时间','必填','沟通发生时间。'],
  ['CONTRACT.Communication.content','沟通内容','长文本','可选','邮件、评论或会议摘要。'],
  ['CONTRACT.ContractValueFact.fact_date','事实日期','日期','必填','金额事实日期。'],
  ['CONTRACT.ContractValueFact.fact_type','金额事实类型','枚举','必填','约定、变更、执行、开票、收款、付款或未结。'],
  ['CONTRACT.ContractValueFact.amount','金额','金额','必填','对应事实金额。'],
  ['CONTRACT.ObligationPerformanceFact.planned_count','计划事项数','数字','可选','计划完成事项数。'],
  ['CONTRACT.ObligationPerformanceFact.completed_count','完成事项数','数字','可选','已完成事项数。'],
  ['CONTRACT.ObligationPerformanceFact.overdue_count','逾期事项数','数字','可选','逾期事项数。'],
  ['CONTRACT.ObligationPerformanceFact.performance_rate','履约率','百分比','可选','完成与计划比例。'],
  ['CONTRACT.RenewalForecast.days_to_expiry','距到期天数','数字','必填','到期剩余天数。'],
  ['CONTRACT.RenewalForecast.renewal_probability','续签概率','百分比','可选','续签预测概率。'],
  ['CONTRACT.PaymentExposure.unbilled_amount','未开票金额','金额','可选','已履约未开票金额。'],
  ['CONTRACT.PaymentExposure.unpaid_amount','未付款金额','金额','可选','已开票未付款金额。'],
  ['CONTRACT.PaymentExposure.retention_amount','质保/留置金额','金额','可选','合同约定的留置金额。'],
]

const standardContractRelations = [
  ['CONTRACT.belongs_to_company','归属公司','CONTRACT.Contract','CONTRACT.Company','合同归属公司或账套。'],
  ['CONTRACT.signed_by_entity','签约主体','CONTRACT.Contract','CONTRACT.LegalEntity','合同本方签约法律主体。'],
  ['CONTRACT.has_party_role','包含参与方角色','CONTRACT.Contract','CONTRACT.PartyRole','合同参与方角色集合。'],
  ['CONTRACT.role_of_party','角色对应参与方','CONTRACT.PartyRole','CONTRACT.Party','参与方角色对应具体主体。'],
  ['CONTRACT.has_contact','拥有联系人','CONTRACT.Contract','CONTRACT.Contact','合同关联业务联系人。'],
  ['CONTRACT.located_at','履约地点','CONTRACT.Contract','CONTRACT.Address','合同签约、履约或通知地点。'],
  ['CONTRACT.uses_template','使用模板','CONTRACT.Contract','CONTRACT.ContractTemplate','合同使用的正文模板。'],
  ['CONTRACT.has_version','包含版本','CONTRACT.Contract','CONTRACT.ContractVersion','合同版本集合。'],
  ['CONTRACT.has_section','包含章节','CONTRACT.ContractVersion','CONTRACT.ContractSection','版本章节集合。'],
  ['CONTRACT.has_clause','包含条款','CONTRACT.ContractSection','CONTRACT.ContractClause','章节条款集合。'],
  ['CONTRACT.clause_has_version','条款版本','CONTRACT.ContractClause','CONTRACT.ClauseVersion','条款版本集合。'],
  ['CONTRACT.documented_by','正文或条款文档','CONTRACT.Contract','CONTRACT.Document','合同正文、条款或证明文档。'],
  ['CONTRACT.has_document_version','包含文档版本','CONTRACT.Document','CONTRACT.DocumentVersion','文档内容和格式版本。'],
  ['CONTRACT.has_attachment','包含附件','CONTRACT.Contract','CONTRACT.Document','合同相关附件。'],
  ['CONTRACT.requires_approval','需要审批','CONTRACT.Contract','CONTRACT.ApprovalTask','合同或变更需要经过的审批任务。'],
  ['CONTRACT.has_approval_record','包含审批记录','CONTRACT.ApprovalTask','CONTRACT.ApprovalRecord','审批过程记录。'],
  ['CONTRACT.processed_by','审批处理人','CONTRACT.ApprovalRecord','CONTRACT.User','审批记录处理人。'],
  ['CONTRACT.authorized_by','授权主体','CONTRACT.Contract','CONTRACT.User','签约或审批授权主体。'],
  ['CONTRACT.has_signature','包含签署记录','CONTRACT.ContractVersion','CONTRACT.SignatureRecord','合同版本的签署记录。'],
  ['CONTRACT.signed_by','具体签署方','CONTRACT.SignatureRecord','CONTRACT.Party','签署人或签署方。'],
  ['CONTRACT.has_signature_evidence','包含签署证据','CONTRACT.SignatureRecord','CONTRACT.SignatureEvidence','签署证据集合。'],
  ['CONTRACT.evidenced_by_document','证据文件','CONTRACT.SignatureEvidence','CONTRACT.Document','签署证据对应文档。'],
  ['CONTRACT.governs','条款约束义务','CONTRACT.ContractClause','CONTRACT.ContractObligation','条款约束合同义务。'],
  ['CONTRACT.grants','条款产生权利','CONTRACT.ContractClause','CONTRACT.ContractRight','条款产生合同权利。'],
  ['CONTRACT.responsible_for','承担义务','CONTRACT.Party','CONTRACT.ContractObligation','参与方承担合同义务。'],
  ['CONTRACT.benefits','享有权利','CONTRACT.Party','CONTRACT.ContractRight','参与方享有合同权利。'],
  ['CONTRACT.requires_deliverable','要求交付物','CONTRACT.ContractObligation','CONTRACT.ContractDeliverable','义务要求交付物。'],
  ['CONTRACT.has_milestone','包含里程碑','CONTRACT.Contract','CONTRACT.Milestone','合同阶段计划和验收节点。'],
  ['CONTRACT.delivered_as','实际交付','CONTRACT.ContractDeliverable','CONTRACT.Delivery','交付物实际交付记录。'],
  ['CONTRACT.accepted_in','验收记录','CONTRACT.ContractDeliverable','CONTRACT.Acceptance','交付物验收记录。'],
  ['CONTRACT.has_acceptance_line','包含验收明细','CONTRACT.Acceptance','CONTRACT.AcceptanceLine','验收数量、质量和差异明细。'],
  ['CONTRACT.performed_as_task','映射履约任务','CONTRACT.ContractObligation','CONTRACT.Task','义务映射执行任务。'],
  ['CONTRACT.recorded_by_timesheet','记录服务工时','CONTRACT.Task','CONTRACT.Timesheet','任务工时事实。'],
  ['CONTRACT.governed_by_sla','受SLA约束','CONTRACT.Contract','CONTRACT.ServiceLevelAgreement','合同服务级别约定。'],
  ['CONTRACT.has_commitment','包含SLA承诺','CONTRACT.ServiceLevelAgreement','CONTRACT.SLACommitment','SLA指标承诺。'],
  ['CONTRACT.measured_by','指标执行事实','CONTRACT.SLACommitment','CONTRACT.ObligationPerformanceFact','SLA指标执行事实。'],
  ['CONTRACT.executed_in_project','执行项目','CONTRACT.Contract','CONTRACT.Project','合同对应执行项目。'],
  ['CONTRACT.has_task','项目任务','CONTRACT.Project','CONTRACT.Task','项目履约任务。'],
  ['CONTRACT.updated_by_communication','项目沟通更新','CONTRACT.Project','CONTRACT.Communication','项目进度或沟通更新。'],
  ['CONTRACT.originates_from','商务来源','CONTRACT.Contract','CONTRACT.Quotation','合同前置商务来源。'],
  ['CONTRACT.generates_sales_order','生成销售订单','CONTRACT.Contract','CONTRACT.SalesOrder','合同生成销售订单。'],
  ['CONTRACT.generates_purchase_order','生成采购订单','CONTRACT.Contract','CONTRACT.PurchaseOrder','合同生成采购订单。'],
  ['CONTRACT.has_order_line','包含订单明细','CONTRACT.PurchaseOrder','CONTRACT.OrderLine','订单包含产品、数量、价格和税。'],
  ['CONTRACT.references_contract','引用合同','CONTRACT.PurchaseOrder','CONTRACT.Contract','订单或明细引用合同。'],
  ['CONTRACT.delivers','订单交付','CONTRACT.PurchaseOrder','CONTRACT.Delivery','订单对应交付事实。'],
  ['CONTRACT.accepted_against','验收对应交付','CONTRACT.Acceptance','CONTRACT.Delivery','验收对应订单或交付。'],
  ['CONTRACT.bills','执行开票','CONTRACT.Contract','CONTRACT.Invoice','合同执行开票或账单。'],
  ['CONTRACT.has_payment_plan','配置付款计划','CONTRACT.Contract','CONTRACT.PaymentPlan','合同阶段性付款安排。'],
  ['CONTRACT.paid_by','产生收付款','CONTRACT.Contract','CONTRACT.Payment','合同相关收付款事实。'],
  ['CONTRACT.allocates_to','付款核销分配','CONTRACT.Payment','CONTRACT.PaymentAllocation','付款分配至发票、账单或订单。'],
  ['CONTRACT.has_change','包含合同变更','CONTRACT.Contract','CONTRACT.ContractChange','合同变更事件。'],
  ['CONTRACT.changes_version','影响合同版本','CONTRACT.ContractChange','CONTRACT.ContractVersion','变更产生或影响版本。'],
  ['CONTRACT.renews','续签原合同','CONTRACT.Renewal','CONTRACT.Contract','续签针对原合同。'],
  ['CONTRACT.produces_contract','续签生成合同','CONTRACT.Renewal','CONTRACT.Contract','续签生成新合同。'],
  ['CONTRACT.suspends','暂停合同','CONTRACT.Suspension','CONTRACT.Contract','暂停合同全部或部分义务。'],
  ['CONTRACT.terminates','终止合同','CONTRACT.Termination','CONTRACT.Contract','终止或解除合同。'],
  ['CONTRACT.has_risk_event','包含风险事件','CONTRACT.Contract','CONTRACT.RiskEvent','合同风险事件。'],
  ['CONTRACT.breaches','违约对应义务','CONTRACT.BreachEvent','CONTRACT.ContractObligation','违约对应的合同义务。'],
  ['CONTRACT.raises_claim','违约产生索赔','CONTRACT.BreachEvent','CONTRACT.Claim','违约产生索赔请求。'],
  ['CONTRACT.participates_in_dispute','参与合同争议','CONTRACT.Party','CONTRACT.Dispute','参与争议的合同主体。'],
  ['CONTRACT.remedied_by','事件整改措施','CONTRACT.RiskEvent','CONTRACT.CorrectiveAction','风险或违约事件的整改措施。'],
  ['CONTRACT.closes_with','合同结项','CONTRACT.Contract','CONTRACT.Closeout','合同履约、结算和归档闭环。'],
]

const standardElements = [
  ...standardProcurementClasses.map(([code,name,constraint,description]) => ['ONT-PROC','class',code,name,'实体类型',constraint,description]),
  ...standardProcurementProperties.map(([code,name,dataType,constraint,description]) => ['ONT-PROC','property',code,name,dataType,constraint,description]),
  ...standardProcurementRelations.map(([code,name,owner,target,description]) => ['ONT-PROC','relation',code,name,`${owner} → ${target}`,'多对一或多对多',description]),
  ...standardContractClasses.map(([code,name,constraint,description]) => ['ONT-CONTRACT','class',code,name,'实体类型',constraint,description]),
  ...standardContractProperties.map(([code,name,dataType,constraint,description]) => ['ONT-CONTRACT','property',code,name,dataType,constraint,description]),
  ...standardContractRelations.map(([code,name,owner,target,description]) => ['ONT-CONTRACT','relation',code,name,`${owner} → ${target}`,'多对一或多对多',description]),
]

let pool

async function ensureColumn(table,column,definition){
  const [rows]=await pool.query('SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,table,column])
  if(!Number(rows[0].total))await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
}

const legacyEntityGroupOrder=['组织与供应商','物料与价格','仓储与库存','寻源与采购','项目与合同','履约与到货','质量与退货','结算与付款','合同主档与模板','条款与版本','审批与签署','合同履约与交付','合同商务与订单','合同变更与终止','合同风险与争议','合同文档与追溯','合同分析事实','治理与追溯']
function legacyEntityGroupLabel(code=''){
  if(/CONTRACT\.(Company|LegalEntity|BusinessUnit|User|Party|PartyRole|Contact|Address|ContractType|ContractCategory)/.test(code))return '组织与供应商'
  if(/CONTRACT\.(Contract|ContractTemplate)/.test(code))return '合同主档与模板'
  if(/CONTRACT\.(ContractVersion|ContractSection|ContractClause|ClauseVersion)/.test(code))return '条款与版本'
  if(/CONTRACT\.(ApprovalTask|ApprovalRecord|SignatureRecord|SignatureEvidence)/.test(code))return '审批与签署'
  if(/CONTRACT\.(ContractObligation|ContractRight|ContractDeliverable|Milestone|Acceptance|AcceptanceLine|ServiceLevelAgreement|SLACommitment|Project|Task|Timesheet|Delivery)/.test(code))return '合同履约与交付'
  if(/CONTRACT\.(Opportunity|Quotation|PurchaseAgreement|SalesOrder|PurchaseOrder|OrderLine)/.test(code))return '合同商务与订单'
  if(/CONTRACT\.(ContractChange|Renewal|Suspension|Termination|Closeout)/.test(code))return '合同变更与终止'
  if(/CONTRACT\.(RiskEvent|BreachEvent|Claim|Dispute|CorrectiveAction)/.test(code))return '合同风险与争议'
  if(/CONTRACT\.(Document|DocumentVersion|Communication|SourceSystem|SourceRecord)/.test(code))return '合同文档与追溯'
  if(/CONTRACT\.(ContractValueFact|ObligationPerformanceFact|RenewalForecast|PaymentExposure)/.test(code))return '合同分析事实'
  if(/CONTRACT\.(Invoice|Bill|PaymentPlan|Payment|PaymentAllocation)/.test(code))return '结算与付款'
  if(/PROC\.(Company|LegalEntity|BusinessUnit|User|Role|Address|BankAccount|Supplier|SupplierSite|SupplierQualification|SupplierRiskProfile|SupplierPerformance|Reviewer|Contact)/.test(code))return '组织与供应商'
  if(/PROC\.(Product|ProductIdentifier|ProductCategory|ProductAttribute|ProductVariant|ProductPackage|SupplierProduct|ApprovedSupplierList|ProductPrice|PriceHistory)/.test(code))return '物料与价格'
  if(/PROC\.(Warehouse|Location|StockBalance|InventoryLedger|StockMove|StockMoveLine|InventoryOwner|InventoryOperation|InventoryOperationLine|InventoryTransfer|InventoryCount|InventoryAdjustment|StockReservation|OwnershipTransfer|LotSerial|LogisticUnit)/.test(code))return '仓储与库存'
  if(/PROC\.(PurchaseRequest|SourcingEvent|RFQ|RFQLine|RFQSupplier|SupplierQuotation|SupplierQuotationLine|BidEvaluation|AwardDecision|PurchaseAgreement|PurchaseAgreementLine|PurchaseOrder|PurchaseOrderLine)/.test(code))return '寻源与采购'
  if(/PROC\.(PaymentPlan|PaymentPlanLine|OrderSchedule|ChangeOrder|AdvanceShipmentNotice|ASNLine|PurchaseArrival|PurchaseArrivalLine|PurchaseReceipt|PurchaseReceiptLine)/.test(code))return '履约与到货'
  if(/PROC\.(QualityInspection|QualityInspectionLine|NonConformance|CorrectiveAction|PurchaseReturn|PurchaseReturnLine)/.test(code))return '质量与退货'
  if(/PROC\.(PurchaseSettlement|PurchaseSettlementLine|PurchaseInvoice|PurchaseInvoiceLine|SupplierReconciliation|SupplierReconciliationLine|Payment|PaymentAllocation|AccountJournal)/.test(code))return '结算与付款'
  return '治理与追溯'
}

const seededEntityGroupOverrides={
  'ONT-PROC':{
    '物料与价格':['SupplierProduct'],
    '寻源与采购':['SupplierQuotation','SupplierQuotationLine','BidConfirmed'],
    '项目与合同':['PurchaseProject','PurchaseCreated','Contract','ContractChanged'],
    '结算与付款':['SupplierReconciliation','SupplierReconciliationLine','PaymentPlan','PaymentPlanLine'],
  },
  'ONT-CONTRACT':{
    '合同主档与模板':['ContractType','ContractCategory'],
    '条款与版本':['ContractVersion','ContractSection','ContractClause'],
    '合同履约与交付':['ContractObligation','ContractRight','ContractDeliverable'],
    '合同变更与终止':['ContractChange'],
    '合同分析事实':['ContractValueFact','RenewalForecast'],
  },
  'ONT-PROC-DEMO':{
    '组织与供应商':['Organization','Department','Person','Supplier','BankAccount','Contact','Address','Customer'],
    '物料与价格':['TradeItem'],
    '仓储与库存':['Warehouse'],
    '寻源与采购':['ProcurementDemand','ProcurementPlan','BudgetApproval','TenderAnnouncement','Bid','BidDocument','ReviewPanel','Award','BidEvaluation','PurchaseOrder','DemandCreated','BudgetApproved','PlanApproved','ProcurementMethodChosen','TenderPublished','BidSubmitted','BidOpened','PanelSelected','EvaluationCompleted','BidConfirmed','EvaluationScored','OrderIssued'],
    '项目与合同':['PurchaseProject','Contract','ContractChange','ContractSigned','ContractChanged'],
    '履约与到货':['LogisticsRecord','GoodsReceipt','InspectionRecord','GoodsDispatched','GoodsReceived','InspectionAccepted'],
    '结算与付款':['Invoice','Payment','PaymentExecuted','InvoiceIssued','FundTransferred','Receivable','Prepayment','CollectionReceived','ReceivableRecorded','PrepaymentRecorded'],
    '治理与追溯':['IPAddress','Device','RiskWarning','WarningGenerated'],
  },
}
function seededEntityGroupLabel(ontologyId,code){
  const groups=seededEntityGroupOverrides[ontologyId]
  if(groups){
    const prefix=ontologyId==='ONT-CONTRACT'?'CONTRACT.':'PROC.'
    if(code.startsWith(prefix)){
      const suffix=code.slice(prefix.length)
      for(const [name,codes] of Object.entries(groups))if(codes.includes(suffix))return name
    }
  }
  return legacyEntityGroupLabel(code)
}

async function migrateOntologyGroups(){
  const [ontologies]=await pool.query('SELECT id FROM ontologies')
  for(const ontology of ontologies){
    const [classes]=await pool.query("SELECT element_id,code,group_name FROM ontology_elements WHERE ontology_id=? AND element_type='class' ORDER BY element_id",[ontology.id])
    for(const entity of classes){
      const groupName=String(entity.group_name||'').trim()||seededEntityGroupLabel(ontology.id,entity.code)
      if(!entity.group_name)await pool.query('UPDATE ontology_elements SET group_name=? WHERE element_id=?',[groupName,entity.element_id])
      await pool.query('INSERT IGNORE INTO ontology_entity_groups (ontology_id,name,sort_order) VALUES (?,?,?)',[ontology.id,groupName,Math.max(0,legacyEntityGroupOrder.indexOf(groupName))])
    }
    await pool.query("INSERT IGNORE INTO ontology_entity_groups (ontology_id,name,sort_order) VALUES (?,'未分组',999)",[ontology.id])
  }
}

async function regroupSeedOntologyEntities(){
  for(const id of Object.keys(seededEntityGroupOverrides)){
    const connection=await pool.getConnection()
    try{
      await connection.beginTransaction()
      const [ontologies]=await connection.query('SELECT id FROM ontologies WHERE id=? FOR UPDATE',[id])
      if(!ontologies.length){await connection.rollback();continue}
      const [audits]=await connection.query("SELECT audit_id FROM ontology_audits WHERE ontology_id=? AND action='整理存量实体分组V2' LIMIT 1",[id])
      if(audits.length){await connection.rollback();continue}
      const [classes]=await connection.query("SELECT element_id,code,group_name FROM ontology_elements WHERE ontology_id=? AND element_type='class' FOR UPDATE",[id])
      const previousGroups=new Set()
      let changed=0
      for(const entity of classes){
        const next=seededEntityGroupLabel(id,entity.code)
        if(next===entity.group_name||entity.group_name!==legacyEntityGroupLabel(entity.code))continue
        await connection.query('INSERT IGNORE INTO ontology_entity_groups (ontology_id,name,sort_order) VALUES (?,?,?)',[id,next,legacyEntityGroupOrder.indexOf(next)])
        await connection.query('UPDATE ontology_elements SET group_name=? WHERE element_id=?',[next,entity.element_id])
        previousGroups.add(entity.group_name)
        changed++
      }
      for(const name of previousGroups){
        if(name==='未分组')continue
        await connection.query("DELETE FROM ontology_entity_groups WHERE ontology_id=? AND name=? AND NOT EXISTS (SELECT 1 FROM ontology_elements WHERE ontology_id=? AND element_type='class' AND group_name=?)",[id,name,id,name])
      }
      if(changed)await resetOntologyDraft(connection,id)
      await ontologyAudit(connection,id,'整理存量实体分组V2',`按业务阶段整理 ${changed} 个实体类型`)
      await connection.commit()
    }catch(error){await connection.rollback();throw error}finally{connection.release()}
  }
}

async function columnExists(table,column){
  const [rows]=await pool.query('SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,table,column])
  return Number(rows[0].total)>0
}

async function dropColumnIfExists(table,column){
  if(await columnExists(table,column))await pool.query('ALTER TABLE '+table+' DROP COLUMN '+column)
}

async function syncOntologyCounts(connection=pool,id=''){
  const where=id?' WHERE id=?':'';const params=id?[id]:[]
  await connection.query(`UPDATE ontologies o SET
    class_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='class'),
    property_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='property'),
    relation_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='relation'),
    event_count=0${where}`,params)
}

async function initializeDatabase(){
  const bootstrap=await mysql.createConnection({...connectionConfig,connectTimeout:10000});await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await bootstrap.end()
  pool=mysql.createPool({...connectionConfig,database,waitForConnections:true,connectionLimit:8,charset:'utf8mb4'})
  await pool.query(`CREATE TABLE IF NOT EXISTS ontologies (
    id VARCHAR(64) PRIMARY KEY,name VARCHAR(160) NOT NULL,scope VARCHAR(64) NOT NULL,domain VARCHAR(64) NOT NULL,version VARCHAR(24) NOT NULL,
    class_count INT NOT NULL DEFAULT 0,property_count INT NOT NULL DEFAULT 0,relation_count INT NOT NULL DEFAULT 0,event_count INT NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL DEFAULT '草稿',description TEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS ontology_elements (
    element_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,ontology_id VARCHAR(64) NOT NULL,element_type VARCHAR(24) NOT NULL,code VARCHAR(120) NOT NULL,
    name VARCHAR(160) NOT NULL,data_type VARCHAR(120) NOT NULL DEFAULT '',constraint_desc VARCHAR(240) NOT NULL DEFAULT '',description TEXT NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ontology_element (ontology_id,element_type,code),CONSTRAINT fk_element_ontology FOREIGN KEY (ontology_id) REFERENCES ontologies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS ontology_entity_groups (
    group_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,ontology_id VARCHAR(64) NOT NULL,name VARCHAR(120) NOT NULL,sort_order INT NOT NULL DEFAULT 1000,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uk_ontology_entity_group (ontology_id,name),KEY idx_ontology_entity_group_order (ontology_id,sort_order,group_id),
    CONSTRAINT fk_entity_group_ontology FOREIGN KEY (ontology_id) REFERENCES ontologies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS ontology_audits (
    audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,ontology_id VARCHAR(64) NOT NULL,action VARCHAR(80) NOT NULL,summary VARCHAR(500) NOT NULL,
    operator_name VARCHAR(80) NOT NULL DEFAULT '尹晨阳',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_ontology_audit (ontology_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn('ontologies','source_version_id','source_version_id VARCHAR(64) NULL AFTER version')
  await ensureColumn('ontologies','validation_json','validation_json JSON NULL AFTER description')
  await ensureColumn('ontologies','published_at','published_at TIMESTAMP NULL AFTER validation_json')
  await ensureColumn('ontology_elements','owner_code','owner_code VARCHAR(120) NOT NULL DEFAULT \'\' AFTER name')
  await ensureColumn('ontology_elements','target_code','target_code VARCHAR(120) NOT NULL DEFAULT \'\' AFTER owner_code')
  await ensureColumn('ontology_elements','group_name','group_name VARCHAR(120) NOT NULL DEFAULT \'\' AFTER name')
  await pool.query("UPDATE ontology_elements SET element_type='class',owner_code='',target_code='',data_type='实体类型' WHERE element_type='event'")
  await pool.query("UPDATE ontology_elements SET data_type='实体类型' WHERE element_type='class'")
  await pool.query("UPDATE ontology_elements SET constraint_desc='发生时间必填' WHERE element_type='class' AND constraint_desc IN ('起始事件','前置事件','目标事件','履约事件','结算事件','事后事件','监管事件','评标事件')")
  await pool.query("UPDATE ontology_elements SET name=REPLACE(name,'事件编号','记录编号'),constraint_desc=REPLACE(constraint_desc,'事件时间','发生时间'),description=REPLACE(REPLACE(description,'事件实例','节点实例'),'事件关联','节点实例关联') WHERE element_type IN ('property','relation')")
  await dropColumnIfExists('ontology_elements','class_kind')
  await dropColumnIfExists('ontology_elements','entity_category')
  for(const item of initialOntologies)await pool.query(`INSERT IGNORE INTO ontologies (id,name,scope,domain,version,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,item)
  for(const item of [...initialElements, ...standardElements])await pool.query('INSERT IGNORE INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?)',item)
  const elementReferences=[
    ['PROC.Supplier.credit_code','PROC.Supplier',''],['PROC.Supplier.phone','PROC.Supplier',''],['PROC.Reviewer.phone','PROC.Reviewer',''],
    ['PROC.Contract.change_rate','PROC.Contract',''],['PROC.Contract.change_amount','PROC.Contract',''],['PROC.Contact.valid_time','PROC.Contact',''],
    ['PROC.supplier_contact','PROC.Supplier','PROC.Contact'],['PROC.shared_contact','PROC.Contact','PROC.Reviewer'],['PROC.actual_control','PROC.Supplier','PROC.Reviewer'],
    ['PROC.BidConfirmed.event_id','PROC.BidConfirmed',''],['PROC.BidConfirmed.occurred_at','PROC.BidConfirmed',''],
    ['PROC.ContractChanged.event_id','PROC.ContractChanged',''],['PROC.ContractChanged.occurred_at','PROC.ContractChanged',''],
    ['PROC.PurchaseCreated.event_id','PROC.PurchaseCreated',''],['PROC.PurchaseCreated.occurred_at','PROC.PurchaseCreated',''],
    ['PROC.participate','PROC.Supplier','PROC.PurchaseProject'],
    ['PROC.bid_confirmed_project','PROC.BidConfirmed','PROC.PurchaseProject'],['PROC.contract_changed_contract','PROC.ContractChanged','PROC.Contract'],['PROC.purchase_created_project','PROC.PurchaseCreated','PROC.PurchaseProject'],
  ]
  for(const [code,owner,target] of [...elementReferences, ...standardProcurementProperties.map(([code]) => [code, code.split('.').slice(0,2).join('.'), '']), ...standardProcurementRelations.map(([code,,owner,target]) => [code, owner, target])])await pool.query("UPDATE ontology_elements SET owner_code=IF(owner_code='',?,owner_code),target_code=IF(target_code='',?,target_code) WHERE ontology_id='ONT-PROC' AND code=?",[owner,target,code])
  for(const [code] of standardContractProperties)await pool.query("UPDATE ontology_elements SET owner_code=IF(owner_code='',?,owner_code) WHERE ontology_id='ONT-CONTRACT' AND code=?",[code.split('.').slice(0,2).join('.'),code])
  for(const [code,,owner,target] of standardContractRelations)await pool.query("UPDATE ontology_elements SET owner_code=IF(owner_code='',?,owner_code),target_code=IF(target_code='',?,target_code) WHERE ontology_id='ONT-CONTRACT' AND code=?",[owner,target,code])
  await migrateOntologyGroups()
  await regroupSeedOntologyEntities()
  await pool.query("UPDATE ontologies SET name='合同合规监管图谱',domain='合同',version='V2',description='覆盖合同主档、版本条款、审批签署、履约交付、验收结算、变更续签、风险争议和文档血缘。' WHERE id='ONT-CONTRACT'")
  await pool.query("UPDATE ontologies SET name='采购与供应链合规监管图谱',domain='采购与供应链',version='V3',description='覆盖采购与供应链主数据、寻源、订单、到货入库、库存、质量、结算付款、风险与来源追溯的标准对象和关系。' WHERE id='ONT-PROC'")
  await pool.query("UPDATE ontologies SET name='采购与供应链监管图谱（历史版本）',domain='采购与供应链' WHERE id='ONT-PROC-DEMO' OR name='采购与供应链监管演示图谱结构'")
  await pool.query("UPDATE ontologies SET status='停用' WHERE status IN ('已下架','已废止','已停用')")
  await pool.query("UPDATE ontologies SET status='启用' WHERE status IN ('已发布','已启用')")
  await pool.query("UPDATE ontologies SET status='草稿' WHERE status='待校验'")
  await normalizeStoredOntologyVersions()
  await syncOntologyCounts()
  await pool.query("UPDATE ontologies SET status='草稿',validation_json=NULL,published_at=NULL WHERE status='启用' AND class_count=0")
  await initializeSceneRuleDatabase(pool)
  await initializeRuleCatalogDatabase(pool)
  await initializeDataGraphDatabase(pool)
}

const formatTime=(value)=>value instanceof Date?value.toLocaleString('zh-CN',{hour12:false}).replaceAll('/','-'):String(value||'')
const parseJson=(value,fallback)=>{if(value===null||value===undefined||value==='')return fallback;if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return fallback}}
const toJson=(value)=>JSON.stringify(value??null)
const mapElement=(row)=>({id:String(row.element_id),type:row.element_type,code:row.code,name:row.name,groupName:row.group_name||'',ownerCode:row.owner_code||'',targetCode:row.target_code||'',dataType:row.element_type==='class'?'实体类型':row.data_type,constraint:row.constraint_desc,description:row.description})
const normalizeOntologyStatus=(status)=>['已废止','已下架','已停用'].includes(status)?'停用':['已发布','已启用'].includes(status)?'启用':status==='待校验'?'草稿':status
const baseOntologyId=(id='')=>String(id||'').replace(/-DRAFT-[A-Z0-9]+$/,'')
const officialVersionNumber=(version='')=>{
  const text=String(version||'').trim()
  const match=text.match(/^V(\d+)$/i)||text.match(/^v(\d+)(?:\.\d+)?$/i)
  if(!match)return 0
  const number=Number(match[1])
  return number>0?number:1
}
const officialVersionLabel=(version='')=>{
  const number=officialVersionNumber(version)
  return number?`V${number}`:''
}
async function nextOntologyPublishVersion(connection,current){
  const base=baseOntologyId(current.sourceVersionId||current.source_version_id||current.id)
  const [rows]=await connection.query('SELECT version FROM ontologies WHERE id=? OR id LIKE ?',[base,`${base}-DRAFT-%`])
  const maxOfficial=rows.reduce((max,row)=>Math.max(max,officialVersionNumber(row.version)),0)
  return `V${Math.max(maxOfficial+1,1)}`
}
async function normalizeStoredOntologyVersions(){
  const [rows]=await pool.query('SELECT id,version,status,source_version_id FROM ontologies')
  const rowMap=new Map(rows.map((row)=>[row.id,row]))
  for(const row of rows){
    const status=normalizeOntologyStatus(row.status)
    let nextVersion=String(row.version||'').trim()
    if(status==='草稿'){
      nextVersion='待启用'
    }else{
      const label=officialVersionLabel(nextVersion)
      if(label)nextVersion=label
    }
    if(nextVersion&&nextVersion!==row.version)await pool.query('UPDATE ontologies SET version=? WHERE id=?',[nextVersion,row.id])
  }
}
const mapOntology=(row,elements=[],groups=[])=>{
  const count=(type)=>elements.filter((item)=>item.type===type).length
  return {id:row.id,name:row.name,scope:row.scope,domain:row.domain,version:row.version,sourceVersionId:row.source_version_id||'',classes:count('class'),properties:count('property'),relations:count('relation'),events:0,status:normalizeOntologyStatus(row.status),description:row.description,validation:parseJson(row.validation_json,{blockers:[],warnings:[],validatedAt:''}),publishedAt:formatTime(row.published_at),updatedAt:formatTime(row.updated_at),elements,groups}
}

async function getOntology(id,connection=pool){const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=?',[id]);if(!rows.length)return null;const [elements]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? ORDER BY element_type,element_id',[id]);const [groups]=await connection.query('SELECT name FROM ontology_entity_groups WHERE ontology_id=? ORDER BY sort_order,group_id',[id]);return mapOntology(rows[0],elements.map(mapElement),groups.map((group)=>group.name))}
async function listOntologies(){const [rows]=await pool.query("SELECT * FROM ontologies WHERE status<>'已删除' ORDER BY updated_at DESC,id ASC");const [elements]=await pool.query('SELECT * FROM ontology_elements ORDER BY element_type,element_id');const [groups]=await pool.query('SELECT ontology_id,name FROM ontology_entity_groups ORDER BY sort_order,group_id');const grouped=new Map();const groupedGroups=new Map();for(const element of elements){if(!grouped.has(element.ontology_id))grouped.set(element.ontology_id,[]);grouped.get(element.ontology_id).push(mapElement(element))}for(const group of groups){if(!groupedGroups.has(group.ontology_id))groupedGroups.set(group.ontology_id,[]);groupedGroups.get(group.ontology_id).push(group.name)}return rows.map((row)=>mapOntology(row,grouped.get(row.id)||[],groupedGroups.get(row.id)||[]))}
async function ontologyAudit(connection,id,action,summary){await connection.query('INSERT INTO ontology_audits (ontology_id,action,summary) VALUES (?,?,?)',[id,action,summary])}
function isLockedOntologyStatus(status){return status!=='草稿'}
function lockedOntologyMessage(status,action){return status==='已删除'?`已删除图谱模型不可${action}`:`只有草稿图谱模型可以${action}，请复制为草稿后修改`}
async function ontologyReferenceSummary(connection,id){
  const checks=[
    {label:'数据源',sql:'SELECT COUNT(DISTINCT source_id) AS total FROM data_source_structures WHERE ontology_id=?'},
    {label:'知识图谱',sql:'SELECT COUNT(*) AS total FROM graph_versions WHERE ontology_id=?'},
    {label:'风险场景',sql:'SELECT COUNT(*) AS total FROM scene_versions WHERE ontology_id=?'},
    {label:'规则',sql:'SELECT COUNT(*) AS total FROM rule_asset_versions WHERE ontology_id=?'},
  ]
  let total=0;const parts=[]
  for(const item of checks){const [rows]=await connection.query(item.sql,[id]);const count=Number(rows[0]?.total||0);if(count>0)parts.push(`${item.label}${count}个`);total+=count}
  return {total,summary:parts.length?parts.join('、'):'无引用'}
}

function normalizeElementPayload(payload,typeFallback=''){
  const requestedType=String(payload.type||typeFallback||'').trim()
  const type=requestedType==='event'?'class':requestedType
  return {
    type,
    code:String(payload.code||'').trim(),
    name:String(payload.name||'').trim(),
    groupName:String(payload.groupName||'').trim(),
    ownerCode:String(payload.ownerCode||'').trim(),
    targetCode:String(payload.targetCode||'').trim(),
    dataType:String(payload.dataType||'').trim(),
    constraint:String(payload.constraint||'').trim(),
    description:String(payload.description||'').trim(),
  }
}
function validateOntologyRecord(ontology){
  const blockers=[];const warnings=[]
  const classCodes=new Set(ontology.elements.filter((item)=>item.type==='class').map((item)=>item.code))
  if(!ontology.elements.some((item)=>item.type==='class'))blockers.push({field:'classes',tab:'class',message:'至少需要定义一个实体类型'})
  for(const element of ontology.elements){
    if(!String(element.name||'').trim())blockers.push({field:element.id,tab:element.type,message:`${element.code} 的中文名称不能为空`})
    if(element.type==='property'){
      if(!element.ownerCode)blockers.push({field:element.id,tab:'property',message:`属性字段 ${element.name} 必须选择所属实体类型`})
      else if(!classCodes.has(element.ownerCode))blockers.push({field:element.id,tab:'property',message:`属性字段 ${element.name} 的所属实体类型不存在`})
    }
    if(element.type==='relation'){
      if(!element.ownerCode||!element.targetCode)blockers.push({field:element.id,tab:'relation',message:`关系类型 ${element.name} 必须选择起点实体类型和终点实体类型`})
      else {
        if(!classCodes.has(element.ownerCode))blockers.push({field:element.id,tab:'relation',message:`关系类型 ${element.name} 的起点实体类型不存在`})
        if(!classCodes.has(element.targetCode))blockers.push({field:element.id,tab:'relation',message:`关系类型 ${element.name} 的终点实体类型不存在`})
      }
    }
  }
  if(!ontology.elements.some((item)=>item.type==='property'&&/主标识/.test(item.constraint||'')))warnings.push({field:'identity',tab:'property',message:'建议至少配置一个标记为“主标识”的属性字段，便于图谱实例识别'})
  return {blockers,warnings,validatedAt:new Date().toISOString()}
}
async function resetOntologyDraft(connection,id){
  await connection.query("UPDATE ontologies SET validation_json=NULL,updated_at=NOW() WHERE id=?",[id])
}
async function validateOntologyVersion(connection,id){
  const ontology=await getOntology(id,connection);if(!ontology)return null
  const validation=validateOntologyRecord(ontology)
  await connection.query("UPDATE ontologies SET validation_json=? WHERE id=?",[toJson(validation),id])
  await ontologyAudit(connection,id,'校验图谱模型',`${validation.blockers.length}个阻断项，${validation.warnings.length}个提示项`)
  return {ontology:await getOntology(id,connection),validation}
}
async function rejectReferencedClass(connection,id,elementId,code){
  const [refs]=await connection.query('SELECT COUNT(*) AS total FROM ontology_elements WHERE ontology_id=? AND element_id<>? AND (owner_code=? OR target_code=?)',[id,elementId,code,code])
  if(Number(refs[0].total))throw Object.assign(new Error(`实体类型 ${code} 已被属性字段或关系类型引用，请先调整引用后再修改或删除`),{status:409})
}

function sendJson(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});res.end(body)}
async function readBody(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>1024*1024)throw Object.assign(new Error('请求内容过大'),{status:413})}return body?JSON.parse(body):{}}

async function createOntology(req,res){
  const payload=await readBody(req)
  const name=String(payload.name||'').trim();if(!name)return sendJson(res,400,{message:'结构名称不能为空'})
  const domain=String(payload.domain||'采购').trim()||'采购'
  const domainCode={通用:'BASE',采购:'PROC',合同:'CONTRACT',财务:'FIN',投资:'INVEST'}[domain]||domain.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'CUSTOM'
  const id=String(payload.id||`ONT-${domainCode}-${Date.now().toString(36).toUpperCase()}`).trim().toUpperCase()
  if(!/^[A-Z0-9_-]{3,64}$/.test(id))return sendJson(res,400,{message:'结构编码只能包含大写字母、数字、下划线和中划线'})
  try{await pool.query(`INSERT INTO ontologies (id,name,scope,domain,version,status,description) VALUES (?,?,?,?,?,'草稿',?)`,[id,name,payload.scope||'领域图谱结构',domain,'待启用',String(payload.description||'')]);await pool.query("INSERT INTO ontology_entity_groups (ontology_id,name,sort_order) VALUES (?,'未分组',999)",[id]);await ontologyAudit(pool,id,'新建图谱结构',`${name} / ${domain}`);sendJson(res,201,await getOntology(id))}catch(error){if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:`结构编码 ${id} 已存在`});throw error}
}
async function updateOntology(req,res,id){const payload=await readBody(req);const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'图谱结构不存在'});if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'直接修改')});if(payload.name!==undefined&&!String(payload.name).trim())return sendJson(res,400,{message:'结构名称不能为空'});await pool.query('UPDATE ontologies SET name=?,scope=?,domain=?,description=? WHERE id=?',[payload.name??current.name,payload.scope??current.scope,payload.domain??current.domain,payload.description??current.description,id]);await ontologyAudit(pool,id,'保存图谱结构草稿','更新基本信息');sendJson(res,200,await getOntology(id))}
async function copyOntology(res,id){const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=? FOR UPDATE',[id]);if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'图谱结构不存在'})}const source=rows[0];const base=baseOntologyId(id);const nextId=`${base}-DRAFT-${Date.now().toString(36).toUpperCase()}`;await connection.query(`INSERT INTO ontologies (id,name,scope,domain,version,source_version_id,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,?,'草稿',?)`,[nextId,source.name,source.scope,source.domain,'待启用',id,source.class_count,source.property_count,source.relation_count,source.event_count,source.description]);await connection.query(`INSERT INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) SELECT ?,element_type,code,name,data_type,constraint_desc,description FROM ontology_elements WHERE ontology_id=?`,[nextId,id]);await ontologyAudit(connection,nextId,'复制图谱结构版本',`${id} → ${nextId}`);await connection.commit();sendJson(res,201,await getOntology(nextId))}catch(error){await connection.rollback();throw error}finally{connection.release()}}
 async function publishOntology(res,id){const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'图谱结构不存在'});if(current.classes<1)return sendJson(res,409,{message:'图谱结构至少需要一个实体类型才能启用'});const nextVersion=await nextOntologyPublishVersion(pool,current);await pool.query("UPDATE ontologies SET version=?,status='启用' WHERE id=?",[nextVersion,id]);await ontologyAudit(pool,id,'启用图谱结构版本',`${current.name} ${nextVersion}`);sendJson(res,200,await getOntology(id))}

const countColumns={class:'class_count',property:'property_count',relation:'relation_count'}
async function addElement(req,res,id){const payload=await readBody(req);const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'图谱结构不存在'});if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'新增结构定义项')});if(!countColumns[payload.type])return sendJson(res,400,{message:'结构定义类型无效'});if(!String(payload.code||'').trim()||!String(payload.name||'').trim())return sendJson(res,400,{message:'结构定义项编码和名称不能为空'});const connection=await pool.getConnection();try{await connection.beginTransaction();await connection.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?)',[id,payload.type,String(payload.code).trim(),String(payload.name).trim(),String(payload.dataType||''),String(payload.constraint||''),String(payload.description||'')]);const column=countColumns[payload.type];await connection.query(`UPDATE ontologies SET ${column}=${column}+1 WHERE id=?`,[id]);await ontologyAudit(connection,id,'新增结构定义项',`${payload.type} / ${payload.code}`);await connection.commit();sendJson(res,201,await getOntology(id))}catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型结构定义项编码已存在'});throw error}finally{connection.release()}}
async function deleteElement(res,id,elementId){const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'图谱结构不存在'});if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'删除结构定义项')});const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId]);if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'结构定义项不存在'})}const column=countColumns[rows[0].element_type];await connection.query('DELETE FROM ontology_elements WHERE element_id=?',[elementId]);await connection.query(`UPDATE ontologies SET ${column}=GREATEST(${column}-1,0) WHERE id=?`,[id]);await ontologyAudit(connection,id,'删除结构定义项',`${rows[0].element_type} / ${rows[0].code}`);await connection.commit();sendJson(res,200,await getOntology(id))}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function updateOntologyV2(req,res,id){
  const payload=await readBody(req)
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'直接修改')})
  if(payload.name!==undefined&&!String(payload.name).trim())return sendJson(res,400,{message:'结构名称不能为空'})
  await pool.query("UPDATE ontologies SET name=?,scope=?,domain=?,description=?,validation_json=NULL WHERE id=?",[payload.name??current.name,payload.scope??current.scope,payload.domain??current.domain,payload.description??current.description,id])
  await ontologyAudit(pool,id,'保存图谱模型','更新基本信息')
  sendJson(res,200,await getOntology(id))
}

async function copyOntologyV2(res,id){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=? FOR UPDATE',[id])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'图谱结构不存在'})}
    const source=rows[0]
    if(source.status==='已删除'){await connection.rollback();return sendJson(res,404,{message:'图谱结构不存在'})}
    const base=baseOntologyId(id)
    const nextId=`${base}-DRAFT-${Date.now().toString(36).toUpperCase()}`
     await connection.query(`INSERT INTO ontologies (id,name,scope,domain,version,source_version_id,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,?,'草稿',?)`,[nextId,source.name,source.scope,source.domain,'待启用',id,source.class_count,source.property_count,source.relation_count,source.event_count,source.description])
    await connection.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,group_name,owner_code,target_code,data_type,constraint_desc,description) SELECT ?,element_type,code,name,group_name,owner_code,target_code,data_type,constraint_desc,description FROM ontology_elements WHERE ontology_id=?',[nextId,id])
    await connection.query('INSERT INTO ontology_entity_groups (ontology_id,name,sort_order) SELECT ?,name,sort_order FROM ontology_entity_groups WHERE ontology_id=?',[nextId,id])
    await syncOntologyCounts(connection,nextId)
    await ontologyAudit(connection,nextId,'复制图谱结构版本',`${id} → ${nextId}`)
    await connection.commit()
    sendJson(res,201,await getOntology(nextId))
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function validateOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
   if(!['草稿','启用'].includes(current.status))return sendJson(res,409,{message:'只有可用图谱模型可以发起校验'})
  const result=await validateOntologyVersion(pool,id)
  sendJson(res,200,result)
}
async function publishOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
   if(current.status!=='草稿')return sendJson(res,409,{message:'只有草稿图谱结构可以启用'})
  const validation=validateOntologyRecord(current)
  if(validation.blockers.length){
    await pool.query("UPDATE ontologies SET status='草稿',validation_json=? WHERE id=?",[toJson(validation),id])
     return sendJson(res,409,{message:'图谱模型结构不完整，不能启用',validation})
  }
   await pool.query("UPDATE ontologies SET status='启用',validation_json=?,published_at=NOW() WHERE id=?",[toJson(validation),id])
   await ontologyAudit(pool,id,'启用图谱模型',current.name)
  sendJson(res,200,await getOntology(id))
}

async function addElementV2(req,res,id){
  const payload=normalizeElementPayload(await readBody(req))
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'新增结构定义项')})
  if(!countColumns[payload.type])return sendJson(res,400,{message:'结构定义类型无效'})
  if(!payload.code||!payload.name)return sendJson(res,400,{message:'结构定义项编码和名称不能为空'})
  const owner=payload.type==='class'?'':payload.ownerCode
  const dataType=payload.type==='class'?'实体类型':payload.dataType
  const target=payload.type==='relation'?payload.targetCode:''
  const groupName=payload.type==='class'?(payload.groupName||'未分组'):''
  if(payload.type==='class'&&!(current.groups||[]).includes(groupName))return sendJson(res,400,{message:'请选择当前图谱模型中的实体分组'})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    if(payload.type==='class'){
      const [groups]=await connection.query('SELECT group_id FROM ontology_entity_groups WHERE ontology_id=? AND name=? FOR UPDATE',[id,groupName])
      if(!groups.length){await connection.rollback();return sendJson(res,400,{message:'请选择当前图谱模型中的实体分组'})}
    }
    await connection.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,group_name,owner_code,target_code,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?,?,?,?)',[id,payload.type,payload.code,payload.name,groupName,owner,target,dataType,payload.constraint,payload.description])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'新增结构定义项',`${payload.type} / ${payload.code}`)
    await connection.commit()
    sendJson(res,201,await getOntology(id))
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型结构定义项编码已存在'});throw error}finally{connection.release()}
}

async function updateElementV2(req,res,id,elementId){
  const payload=await readBody(req)
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'编辑结构定义项')})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'结构定义项不存在'})}
    const row=rows[0]
    if(payload.type&&payload.type!==row.element_type){await connection.rollback();return sendJson(res,400,{message:'定义类型不可修改，请删除后重新新增'})}
    const next=normalizeElementPayload({type:row.element_type,code:payload.code??row.code,name:payload.name??row.name,groupName:payload.groupName??row.group_name??'未分组',ownerCode:payload.ownerCode??row.owner_code,targetCode:payload.targetCode??row.target_code,dataType:payload.dataType??row.data_type,constraint:payload.constraint??row.constraint_desc,description:payload.description??row.description},row.element_type)
    if(!next.code||!next.name){await connection.rollback();return sendJson(res,400,{message:'结构定义项编码和名称不能为空'})}
    if(row.element_type==='class'&&!(current.groups||[]).includes(next.groupName)){await connection.rollback();return sendJson(res,400,{message:'请选择当前图谱模型中的实体分组'})}
    if(row.element_type==='class'){
      const [groups]=await connection.query('SELECT group_id FROM ontology_entity_groups WHERE ontology_id=? AND name=? FOR UPDATE',[id,next.groupName])
      if(!groups.length){await connection.rollback();return sendJson(res,400,{message:'请选择当前图谱模型中的实体分组'})}
    }
    if(row.element_type==='class'&&next.code!==row.code)await rejectReferencedClass(connection,id,elementId,row.code)
    await connection.query('UPDATE ontology_elements SET code=?,name=?,group_name=?,owner_code=?,target_code=?,data_type=?,constraint_desc=?,description=? WHERE ontology_id=? AND element_id=?',[next.code,next.name,row.element_type==='class'?next.groupName:'',row.element_type==='class'?'':next.ownerCode,row.element_type==='relation'?next.targetCode:'',row.element_type==='class'?'实体类型':next.dataType,next.constraint,next.description,id,elementId])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'编辑结构定义项',`${row.element_type} / ${next.code}`)
    await connection.commit()
    sendJson(res,200,await getOntology(id))
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型结构定义项编码已存在'});throw error}finally{connection.release()}
}

async function createOntologyGroup(req,res,id){
  const payload=await readBody(req);const name=String(payload.name||'').trim()
  if(!name)return sendJson(res,400,{message:'分组名称不能为空'})
  if(name.length>120)return sendJson(res,400,{message:'分组名称不能超过120个字符'})
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'新增实体分组')})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM ontology_entity_groups WHERE ontology_id=?',[id])
    await connection.query('INSERT INTO ontology_entity_groups (ontology_id,name,sort_order) VALUES (?,?,?)',[id,name,Number(rows[0].next_order||1000)])
    await resetOntologyDraft(connection,id)
    await ontologyAudit(connection,id,'新增实体分组',name)
    await connection.commit()
    sendJson(res,201,await getOntology(id))
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'该分组名称已存在'});throw error}finally{connection.release()}
}

async function renameOntologyGroup(req,res,id,currentName){
  const payload=await readBody(req);const name=String(payload.name||'').trim()
  if(currentName==='未分组')return sendJson(res,409,{message:'系统分组“未分组”不可重命名'})
  if(!name)return sendJson(res,400,{message:'分组名称不能为空'})
  if(name.length>120)return sendJson(res,400,{message:'分组名称不能超过120个字符'})
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'重命名实体分组')})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [groups]=await connection.query('SELECT group_id FROM ontology_entity_groups WHERE ontology_id=? AND name=? FOR UPDATE',[id,currentName])
    if(!groups.length){await connection.rollback();return sendJson(res,404,{message:'实体分组不存在'})}
    await connection.query('UPDATE ontology_entity_groups SET name=? WHERE group_id=?',[name,groups[0].group_id])
    await connection.query("UPDATE ontology_elements SET group_name=? WHERE ontology_id=? AND element_type='class' AND group_name=?",[name,id,currentName])
    await resetOntologyDraft(connection,id)
    await ontologyAudit(connection,id,'重命名实体分组',`${currentName} → ${name}`)
    await connection.commit()
    sendJson(res,200,await getOntology(id))
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'该分组名称已存在'});throw error}finally{connection.release()}
}

async function deleteOntologyGroup(res,id,name){
  if(name==='未分组')return sendJson(res,409,{message:'系统分组“未分组”不可删除'})
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'删除实体分组')})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [groups]=await connection.query('SELECT group_id FROM ontology_entity_groups WHERE ontology_id=? AND name=? FOR UPDATE',[id,name])
    if(!groups.length){await connection.rollback();return sendJson(res,404,{message:'实体分组不存在'})}
    const [members]=await connection.query("SELECT COUNT(*) AS total FROM ontology_elements WHERE ontology_id=? AND element_type='class' AND group_name=?",[id,name])
    await connection.query("INSERT IGNORE INTO ontology_entity_groups (ontology_id,name,sort_order) VALUES (?,'未分组',999)",[id])
    await connection.query("UPDATE ontology_elements SET group_name='未分组' WHERE ontology_id=? AND element_type='class' AND group_name=?",[id,name])
    await connection.query('DELETE FROM ontology_entity_groups WHERE group_id=?',[groups[0].group_id])
    await resetOntologyDraft(connection,id)
    await ontologyAudit(connection,id,'删除实体分组',`${name}；${members[0].total}个实体类型移至未分组`)
    await connection.commit()
    sendJson(res,200,await getOntology(id))
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function deleteElementV2(res,id,elementId){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'删除结构定义项')})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'结构定义项不存在'})}
    if(rows[0].element_type==='class')await rejectReferencedClass(connection,id,elementId,rows[0].code)
    await connection.query('DELETE FROM ontology_elements WHERE element_id=?',[elementId])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'删除结构定义项',`${rows[0].element_type} / ${rows[0].code}`)
    await connection.commit()
    sendJson(res,200,await getOntology(id))
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

 async function disableOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current||current.status==='已删除')return sendJson(res,404,{message:'图谱结构不存在'})
   if(current.status!=='启用')return sendJson(res,409,{message:'只有启用状态的图谱结构可以停用'})
   await pool.query("UPDATE ontologies SET status='停用' WHERE id=?",[id])
   await ontologyAudit(pool,id,'停用图谱模型',current.name)
  sendJson(res,200,await getOntology(id))
}

async function enableOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current||current.status==='已删除')return sendJson(res,404,{message:'图谱结构不存在'})
  if(!['草稿','停用'].includes(current.status))return sendJson(res,409,{message:'只有草稿或停用状态的图谱模型可以启用'})
  const validation=validateOntologyRecord(current)
  if(validation.blockers.length)return sendJson(res,409,{message:'图谱模型结构不完整，不能启用',validation})
  const version=current.status==='草稿'?await nextOntologyPublishVersion(pool,current):current.version
  await pool.query("UPDATE ontologies SET version=?,status='启用',validation_json=?,published_at=NOW() WHERE id=?",[version,toJson(validation),id])
  await ontologyAudit(pool,id,current.status==='草稿'?'启用图谱模型':'重新启用图谱模型',current.name)
  sendJson(res,200,await getOntology(id))
}

async function deleteOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current||current.status==='已删除')return sendJson(res,404,{message:'图谱结构不存在'})
   if(current.status!=='草稿')return sendJson(res,409,{message:'只有草稿图谱模型可以删除；停用模型需保留历史版本'})
  const references=await ontologyReferenceSummary(pool,id)
  if(references.total>0)return sendJson(res,409,{message:`该图谱结构仍被${references.summary}引用，不能删除`})
  await ontologyAudit(pool,id,'删除图谱模型草稿',current.name)
  await pool.query('DELETE FROM ontologies WHERE id=?',[id])
  sendJson(res,200,{ok:true,message:'图谱结构草稿已删除'})
}
async function handleApi(req,res,url){
  if(url.pathname==='/api/health'&&req.method==='GET')return sendJson(res,200,{ok:true,database})
  if(await handleSuperAgentApi(req,res,url,{sendJson}))return
  if(await handleDemoReadApi(req,res,url,{pool,sendJson}))return
  if(await handleRuleCatalogApi(req,res,url,{pool,sendJson,readBody}))return
  if(await handleSceneRuleApi(req,res,url,{pool,sendJson,readBody}))return
  if(await handleDataGraphApi(req,res,url,{pool,sendJson,readBody}))return
  if(url.pathname==='/api/ontologies'&&req.method==='GET')return sendJson(res,200,await listOntologies())
  if(url.pathname==='/api/ontologies'&&req.method==='POST')return createOntology(req,res)
  const draft=url.pathname.match(/^\/api\/ontologies\/([^/]+)\/draft$/);if(draft&&req.method==='PUT')return sendJson(res,200,await saveOntologyDraft(pool,decodeURIComponent(draft[1]),await readBody(req),getOntology))
  const group=url.pathname.match(/^\/api\/ontologies\/([^/]+)\/groups(?:\/([^/]+))?$/);if(group){const id=decodeURIComponent(group[1]);if(req.method==='POST'&&!group[2])return createOntologyGroup(req,res,id);if(req.method==='PUT'&&group[2])return renameOntologyGroup(req,res,id,decodeURIComponent(group[2]));if(req.method==='DELETE'&&group[2])return deleteOntologyGroup(res,id,decodeURIComponent(group[2]))}
  const element=url.pathname.match(/^\/api\/ontologies\/([^/]+)\/elements(?:\/([^/]+))?$/);if(element){const id=decodeURIComponent(element[1]);if(req.method==='POST'&&!element[2])return addElementV2(req,res,id);if(req.method==='PUT'&&element[2])return updateElementV2(req,res,id,decodeURIComponent(element[2]));if(req.method==='DELETE'&&element[2])return deleteElementV2(res,id,decodeURIComponent(element[2]))}
   const action=url.pathname.match(/^\/api\/ontologies\/([^/]+)\/(copy|enable|disable|validate|publish|retire|activate)$/);if(action&&req.method==='POST'){const actionName=action[2];if(actionName==='copy')return copyOntologyV2(res,decodeURIComponent(action[1]));if(actionName==='validate')return validateOntologyV2(res,decodeURIComponent(action[1]));if(actionName==='disable'||actionName==='retire')return disableOntologyV2(res,decodeURIComponent(action[1]));if(actionName==='enable'||actionName==='activate')return enableOntologyV2(res,decodeURIComponent(action[1]));return publishOntologyV2(res,decodeURIComponent(action[1]))}
  const item=url.pathname.match(/^\/api\/ontologies\/([^/]+)$/);if(item){const id=decodeURIComponent(item[1]);if(req.method==='GET'){const result=await getOntology(id);return sendJson(res,result&&result.status!=='已删除'?200:404,result&&result.status!=='已删除'?result:{message:'图谱结构不存在'})}if(req.method==='PUT')return updateOntologyV2(req,res,id);if(req.method==='DELETE')return deleteOntologyV2(res,id)}
  sendJson(res,404,{message:'接口不存在'})
}

const mimeTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'}
function serveProduction(res,url){const dist=resolve(root,'dist');const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';let file=resolve(dist,relative);if(!file.startsWith(dist)||!existsSync(file))file=resolve(dist,'index.html');res.writeHead(200,{'Content-Type':mimeTypes[extname(file)]||'application/octet-stream'});createReadStream(file).pipe(res)}

await initializeDatabase()
const devMode=process.argv.includes('--dev');const port=Number(process.env.APP_PORT||4173);const vite=devMode?await(await import('vite')).createServer({server:{middlewareMode:true,hmr:{port:port+20505}},appType:'spa'}):null
const server=http.createServer(async(req,res)=>{const url=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);try{if(url.pathname.startsWith('/api/'))return await handleApi(req,res,url);if(vite)return vite.middlewares(req,res,()=>sendJson(res,404,{message:'页面不存在'}));serveProduction(res,url)}catch(error){console.error('[request-error]',error?.message||error);if(!res.headersSent)sendJson(res,Number(error?.status)||500,{message:error?.message||'服务处理失败，请检查数据库连接或请求内容'});else res.end()}})
server.listen(port,'127.0.0.1',()=>{console.log(`穿透式监管服务已启动：http://127.0.0.1:${port}`);console.log(`MySQL业务库已就绪：${database}`)})
async function shutdown(){await vite?.close();await pool?.end();server.close(()=>process.exit(0))}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
