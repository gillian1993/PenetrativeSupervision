import type { RelationConfiguration } from './graphMappingConfig'
interface Endpoints { ownerCode?: string; targetCode?: string }
export function directRelationConfiguration(relation: Endpoints, sourceField?: string, targetField?: string): RelationConfiguration
export function intermediateRelationConfiguration(table: string): RelationConfiguration
export function relationFieldSelection(config: RelationConfiguration, relation: Endpoints): { kind: 'direct' | 'table' | 'custom'; sourceField: string; targetField: string }
export function relationUsesLegacyMatching(config: RelationConfiguration, relation: Endpoints): boolean
export function updateRelationAssociation(config: RelationConfiguration, relation: Endpoints, side: 'start' | 'end', value: string): RelationConfiguration
