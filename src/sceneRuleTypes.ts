import type { RiskLevel, WarningStage } from './types'

export type SceneStatus='草稿'|'待试跑'|'待发布'|'已发布'|'已停用'
export type RuleType='属性'|'字段比对'|'关系路径'|'时序'|'聚合'|'高级表达式'
export type Logic='AND'|'OR'

export interface ValidationIssue{field:string;tab:string;message:string;ruleId?:string;skillId?:string}
export interface ValidationResult{blockers:ValidationIssue[];warnings:ValidationIssue[];validatedAt:string}
export interface OntologyElement{id:string;type:'class'|'property'|'relation';code:string;name:string;dataType:string;constraint:string;description:string}

export interface RuleCondition{
  id:string;fieldCode:string;fieldName:string;fieldType:string;operator:string;
  valueMode:'literal'|'field';value:string;valueFieldCode?:string;valueFieldName?:string
}
export interface ConditionGroup{
  id:string;logic:Logic;items:Array<RuleCondition|ConditionGroup>;expression?:string;expressionLanguage?:'DSL';
  detectionInput?:string;detectionText?:string;generationMode?:'generate'|'polish'|'batch_fill';generatedAt?:string
}
export const isConditionGroup=(item:RuleCondition|ConditionGroup):item is ConditionGroup=>'items'in item

export interface PathHop{from:string;relation:string;to:string}
export interface TimeCondition{id:string;eventCode:string;eventName:string;requirement:'必须发生'|'不得发生'}
export interface AggregateMetric{id:string;function:string;fieldCode:string;fieldName:string;operator:string;threshold:number}
export interface PathConfig{hops:PathHop[];logic?:Logic;constraints?:RuleCondition[]}
export interface TimeConfig{baseline?:'event'|'runtime';logic?:Logic;conditions?:TimeCondition[];eventCode:string;windowValue:number;windowUnit:string;direction:string}
export interface AggregateConfig{logic?:Logic;metrics?:AggregateMetric[];function:string;fieldCode:string;groupBy:string;operator:string;threshold:number}
export interface PolicyBasis{id?:string;name:string;version:string;clause:string;text?:string}
export interface EvidenceRequirement{id?:string;name:string;source:string;sourceField:string;description:string}
export interface SkillInput{id:string;name:string;sourceType:'对象字段'|'事件数据'|'附件'|'文本';source:string;required:boolean}
export interface SkillOutput{id:string;name:string;dataType:string;description:string}
export interface SkillItem{
  id:string;versionId:string;code:string;name:string;version:string;type:string;domain:string;description:string;
  level:RiskLevel;enabled:boolean;status:SceneStatus;inputs:SkillInput[];instruction:string;threshold:number;
  reviewDemand:string;reviewContent:string;reviewRequirement:string;expectedOutput:string;generatedAt:string;
  outputs:SkillOutput[];policies:PolicyBasis[];evidenceRequirements:EvidenceRequirement[];failureStrategy:string;
  summary:string;lockVersion:number;updatedAt:string;sceneNames?:string[];sceneIds?:string[];bindingCount?:number;priority?:number
}
export interface RuleItem{
  id:string;versionId:string;sceneId:string;sceneVersionId:string;code:string;name:string;version:string;
  type:RuleType;stage:WarningStage;level:RiskLevel;defaultLevel?:RiskLevel;enabled:boolean;status:SceneStatus;conditions:ConditionGroup;
  pathConfig:PathConfig;timeConfig:TimeConfig;
  aggregateConfig:AggregateConfig;
  exceptions:{enabled:boolean;description:string;whitelist:string[]};outputs:string[];evidence:string[];
  policy:{name:string;version:string;clause:string};failureStrategy:string;summary:string;lockVersion:number;updatedAt:string;
  policies?:PolicyBasis[];evidenceRequirements?:EvidenceRequirement[];levelMode?:'inherit'|'override';
  domain?:string;objectCode?:string;objectName?:string;eventCode?:string;eventName?:string;
  sceneName?:string;sceneNames?:string[];sceneIds?:string[];bindingCount?:number;catalogBindingCount?:number;sceneStatus?:SceneStatus;ontologyId?:string;graphVersion?:string;priority?:number
}

export interface SceneVersionSummary{id:string;version:string;status:SceneStatus;updatedBy:string;updatedAt:string;publishedAt:string;sourceVersionId:string}
export interface SceneItem{
  id:string;versionId:string;code:string;name:string;version:string;status:SceneStatus;domain:string;description:string;
  objectCode:string;objectName:string;eventCode:string;eventName:string;level:RiskLevel;observationValue:number;observationUnit:string;
  ontologyId:string;graphVersion:string;organizations:string[];objectScope:{logic:Logic;items:unknown[]};
  exceptions:{description:string;validUntil:string};evidence:string[];policies:Array<{name:string;version:string;clause:string}>;
  checkTemplate:{requirements:string;materials:string[];deadlineHours:number};validation:ValidationResult;
  lastTrialId:string;lastTrialStatus:string;runCount:number;lockVersion:number;updatedBy:string;updatedAt:string;
  publishedAt:string;stopReason:string;rules:RuleItem[];ruleCount:number;enabledRuleCount:number;skills:SkillItem[];skillCount:number;enabledSkillCount:number;versions:SceneVersionSummary[];canDelete:boolean
}

export interface TrialSample{id:number;code:string;objectName:string;outcome:'命中'|'未命中'|'错误';level:RiskLevel;evidenceStatus:string;detail:{sourceType?:'rule'|'skill';sourceVersionId?:string;sourceName?:string;ruleName?:string;skillName?:string;score?:number;relationHops?:number;matchedFields?:string[];message?:string}}
export interface TrialTask{id:string;sceneVersionId:string;ruleVersionId:string;status:string;graphVersion:string;sampleDays:number;organizationScope:string;maxSamples:number;timeoutSeconds:number;summary:{total:number;hit:number;miss:number;error:number;evidenceCompleteness:number;durationMs:number;passed:boolean};errorMessage:string;startedAt:string;finishedAt:string;samples:TrialSample[]}
export interface SceneReferences{runs:Array<{id:string;objectCode:string;objectName:string;outcome:string;warningCode:string;executedAt:string;evidence:Record<string,unknown>}>;audits:Array<{id:number;action:string;summary:string;operator:string;risk:string;createdAt:string}>}
