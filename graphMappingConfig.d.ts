export interface EntityJoin { table: string; mainField: string; joinField: string }
export interface RelationConfiguration { origin: { kind: 'entity'; entityCode: string } | { kind: 'table'; table: string }; start: { field: string; match: string }; end: { field: string; match: string } }
export interface MappingConfig { joins?: EntityJoin[]; sourceTable?: string; priority?: number; relation?: RelationConfiguration }
interface MappingLike { source_field?: string; sourceField?: string; source_id?: string; sourceId?: string; mapping_group?: string; groupId?: string; transform_rule?: string; transform?: string; mapping_config?: unknown; config?: MappingConfig }
interface ElementLike { type: string; code: string; ownerCode?: string; targetCode?: string }
interface MetadataLike { tableName: string; fields?: string[] }
export function mappingConfig(mapping?: MappingLike | null): MappingConfig
export function normalizeMappingConfig(type: string, config: unknown): MappingConfig
export function entityJoins(mapping?: MappingLike | null): EntityJoin[]
export function entityTable(mapping?: MappingLike | null): string
export function propertyTable(entity: MappingLike, property: MappingLike): string
export function entityConfigurationIssue(entity: MappingLike, metadata: MetadataLike[]): string
export function propertyMappingAvailable(entity: MappingLike | null, property: MappingLike | null, metadata: MetadataLike[]): boolean
export function mappingGroup(mapping?: MappingLike | null): string
export function sameMappingGroup(left: MappingLike, right: MappingLike): boolean
export function mappingPriority(mapping: MappingLike): number
export function sortEntitySources<T extends MappingLike>(rows: T[]): T[]
export function relationConfiguration(mapping: MappingLike | null, relation: ElementLike): RelationConfiguration | null
export function relationConfigurationIssue(config: RelationConfiguration | null, relation: ElementLike, elements: ElementLike[], entityCodes: string[], propertyCodes: string[], metadata: MetadataLike[]): string
