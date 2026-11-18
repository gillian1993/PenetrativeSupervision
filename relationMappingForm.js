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

export function relationUsesLegacyMatching(config, relation) {
  return relationFieldSelection(config, relation).kind === 'custom'
    || config.origin.kind === 'table' && (config.start.match !== '$identifier' || config.end.match !== '$identifier')
}

export function updateRelationAssociation(config, relation, side, value) {
  const selection = relationFieldSelection(config, relation)
  if (selection.kind === 'table') {
    const next = intermediateRelationConfiguration(config.origin.table)
    if (!relationUsesLegacyMatching(config, relation)) {
      next.start.field = selection.sourceField
      next.end.field = selection.targetField
    }
    next[side].field = value
    return next
  }
  return directRelationConfiguration(relation, side === 'start' ? value : selection.sourceField, side === 'end' ? value : selection.targetField)
}
