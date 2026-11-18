// The compact form is an adapter; persisted relation rules keep their full semantics.
export function directRelationConfiguration(relation, sourceField = '', targetField = '') {
  return { origin: { kind: 'entity', entityCode: relation.ownerCode || '' }, start: { field: '$identifier', match: '$identifier' }, end: { field: sourceField, match: targetField } }
}

export function intermediateRelationConfiguration(table) {
  return { origin: { kind: 'table', table }, start: { field: '', match: '$identifier' }, end: { field: '', match: '$identifier' } }
}

export function relationFieldSelection(config, relation) {
  if (config.origin.kind === 'table') return { kind: 'table', sourceField: config.start.field, targetField: config.end.field }
  const canonical = config.start.field === '$identifier' && config.start.match === '$identifier'
  const legacy = Boolean(config.start.field) && config.start.field === config.start.match && config.start.field === config.end.field
  if (config.origin.entityCode === relation.ownerCode && (canonical || legacy)) return { kind: 'direct', sourceField: config.end.field, targetField: config.end.match }
  return { kind: 'custom', sourceField: '', targetField: '' }
}
