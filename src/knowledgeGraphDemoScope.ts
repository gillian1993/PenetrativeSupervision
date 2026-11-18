export const knowledgeGraphDemoBatch = 'KG-DEMO-20261116-V1'
export function withDemoBatch<T extends object>(payload: T) {
  return { ...payload, ...(localStorage.getItem('knowledgeGraphScope') === 'all' ? {} : { demoBatch: knowledgeGraphDemoBatch }) }
}
