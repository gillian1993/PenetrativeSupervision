export type SituationDomainKey = '采购与供应链' | '财务' | '会计' | '投资' | '产权' | '金融' | '薪酬' | '军品' | '境外' | '合同'

export interface SituationDomainDefinition {
  key: SituationDomainKey
  label: string
  shortLabel: string
  color: string
  coverage: number
  trend: number
}

export const SITUATION_DOMAINS: SituationDomainDefinition[] = [
  { key: '采购与供应链', label: '采购与供应链', shortLabel: '采供', color: '#34d8ff', coverage: 2864, trend: 8.6 },
  { key: '财务', label: '财务', shortLabel: '财务', color: '#9f7cff', coverage: 3928, trend: -2.1 },
  { key: '会计', label: '会计', shortLabel: '会计', color: '#6a8cff', coverage: 1742, trend: 4.3 },
  { key: '投资', label: '投资', shortLabel: '投资', color: '#cf74ff', coverage: 638, trend: 1.8 },
  { key: '产权', label: '产权', shortLabel: '产权', color: '#ff9c61', coverage: 2460, trend: 2.6 },
  { key: '金融', label: '金融', shortLabel: '金融', color: '#48dfcb', coverage: 1268, trend: 3.2 },
  { key: '薪酬', label: '薪酬', shortLabel: '薪酬', color: '#73e6a8', coverage: 824, trend: 0.6 },
  { key: '军品', label: '军品', shortLabel: '军品', color: '#ff7c9c', coverage: 956, trend: -3.5 },
  { key: '境外', label: '境外', shortLabel: '境外', color: '#ffc85c', coverage: 1186, trend: -1.2 },
  { key: '合同', label: '合同', shortLabel: '合同', color: '#36b8ff', coverage: 1428, trend: -4.8 },
]

const domainKeywords: Record<SituationDomainKey, string[]> = {
  采购与供应链: ['采购与供应链', '采购', '供应链', '供应商', '招标', '投标', '中标', '评审', '库存', '物流', '仓储'],
  财务: ['财务', '付款', '资金', '账户', '预算', '报销', '发票', '费用', '收款'],
  会计: ['会计', '核算', '凭证', '账务', '记账', '科目', '报表', '财报', '往来账'],
  投资: ['投资', '股权投资', '并购', '投后', '立项', '决策审批', '可研'],
  产权: ['产权', '资产产权', '股权转让', '产权登记', '资产处置', '评估备案', '产权交易'],
  金融: ['金融', '融资', '贷款', '担保', '保函', '票据', '授信', '债券', '理财'],
  薪酬: ['薪酬', '工资', '奖金', '绩效', '津贴', '社保', '公积金', '个税', '人员薪酬'],
  军品: ['军品', '军工', '装备', '型号', '科研生产', '军贸', '保密', '涉密'],
  境外: ['境外', '海外', '外币', '外汇', '跨境', '境外机构', '境外项目', '国际', '出口'],
  合同: ['合同', '协议', '履约', '变更', '结算', '验收', '会签', '法务'],
}

const keywordPriority: SituationDomainKey[] = ['军品', '境外', '产权', '金融', '薪酬', '会计', '投资', '合同', '财务', '采购与供应链']

export function inferSituationDomain(sceneDomain: string | undefined, text: string): SituationDomainKey {
  const matched = keywordPriority.find((domain) => domainKeywords[domain].some((keyword) => text.includes(keyword)))
  if (sceneDomain && SITUATION_DOMAINS.some((item) => item.key === sceneDomain)) {
    return sceneDomain as SituationDomainKey
  }
  return matched || '采购与供应链'
}