export type SituationDomainKey = '采购' | '合同' | '财务' | '投资' | '工程' | '资产' | '营销' | '人力' | '科技' | '安全'

export interface SituationDomainDefinition {
  key: SituationDomainKey
  label: string
  shortLabel: string
  color: string
  coverage: number
  trend: number
}

export const SITUATION_DOMAINS: SituationDomainDefinition[] = [
  { key: '采购', label: '采购监管', shortLabel: '采购', color: '#34d8ff', coverage: 2864, trend: 8.6 },
  { key: '合同', label: '合同监管', shortLabel: '合同', color: '#6a8cff', coverage: 1742, trend: 4.3 },
  { key: '财务', label: '财务资金', shortLabel: '财务', color: '#9f7cff', coverage: 3928, trend: -2.1 },
  { key: '投资', label: '投资管理', shortLabel: '投资', color: '#cf74ff', coverage: 638, trend: 1.8 },
  { key: '工程', label: '工程建设', shortLabel: '工程', color: '#ff7c9c', coverage: 956, trend: -3.5 },
  { key: '资产', label: '资产管理', shortLabel: '资产', color: '#ff9c61', coverage: 2460, trend: 2.6 },
  { key: '营销', label: '营销管理', shortLabel: '营销', color: '#ffc85c', coverage: 1186, trend: -1.2 },
  { key: '人力', label: '人力资源', shortLabel: '人力', color: '#73e6a8', coverage: 824, trend: 0.6 },
  { key: '科技', label: '科技创新', shortLabel: '科技', color: '#48dfcb', coverage: 731, trend: 5.4 },
  { key: '安全', label: '安全生产', shortLabel: '安全', color: '#36b8ff', coverage: 1428, trend: -4.8 },
]

const domainKeywords: Record<SituationDomainKey, string[]> = {
  采购: ['采购', '供应商', '招标', '投标', '中标', '评审'],
  合同: ['合同', '法务', '会签', '履约'],
  财务: ['财务', '付款', '资金', '账户', '预算', '发票', '融资', '担保'],
  投资: ['投资', '股权', '并购', '决策审批'],
  工程: ['工程', '建设', '施工', '竣工'],
  资产: ['资产', '产权', '处置', '盘点'],
  营销: ['营销', '销售', '客户', '收入'],
  人力: ['人力', '人员', '薪酬', '招聘'],
  科技: ['科技', '研发', '创新', '数据治理', '信息技术', '数据中台', '云资源'],
  安全: ['安全', '环保', '生产事故', '网络安全'],
}

const keywordPriority: SituationDomainKey[] = ['安全', '科技', '人力', '工程', '资产', '投资', '营销', '合同', '财务', '采购']

export function inferSituationDomain(sceneDomain: string | undefined, text: string): SituationDomainKey {
  const matched = keywordPriority.find((domain) => domainKeywords[domain].some((keyword) => text.includes(keyword)))
  if (sceneDomain && SITUATION_DOMAINS.some((item) => item.key === sceneDomain)) {
    const normalized = sceneDomain as SituationDomainKey
    if (normalized === '采购' && matched && matched !== '采购') return matched
    return normalized
  }
  return matched || '采购'
}
