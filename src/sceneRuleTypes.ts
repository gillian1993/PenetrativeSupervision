import type { RiskLevel } from './types'

export type SceneStatus='草稿'|'待试跑'|'待发布'|'已发布'|'已停用'
export type RuleType='属性'|'字段比对'|'关系路径'|'时序'|'聚合'
export type Logic='AND'|'OR'

export interface ValidationIssue{field:string;tab:string;message:string;ruleId?:string}
export interface ValidationResult{blockers:ValidationIssue[];warnings:ValidationIssue[];validatedAt:string}
export interface OntologyElement{id:string;type:'class'|'property'|'relation'|'event';code:string;name:string;dataType:string;constraint:string;description:string}

export interface RuleCondition{
  id:string;fieldCode:string;fieldName:string;fieldType:string;operator:string;
  valueMode:'literal'|'field';value:string;valueFieldCode?:string;valueFieldName?:string
}
export interface ConditionGroup{id:string;logic:Logic;items:Array<RuleCondition|ConditionGroup>}
export const isConditionGroup=(item:RuleCondition|ConditionGroup):item is ConditionGroup=>'items'in item

export interface PathHop{from:string;relation:string;to:string}
export interface RuleItem{
  id:string;versionId:string;sceneId:string;sceneVersionId:string;code:string;name:string;version:string;
  type:RuleType;level:RiskLevel;defaultLevel?:RiskLevel;enabled:boolean;status:SceneStatus;conditions:ConditionGroup;
  pathConfig:{hops:PathHop[]};timeConfig:{eventCode:string;windowValue:number;windowUnit:string;direction:string};
  aggregateConfig:{function:string;fieldCode:string;groupBy:string;operator:string;threshold:number};
  exceptions:{enabled:boolean;description:string;whitelist:string[]};outputs:string[];evidence:string[];
  policy:{name:string;version:string;clause:string};failureStrategy:string;summary:string;lockVersion:number;updatedAt:string;
  domain?:string;objectCode?:string;objectName?:string;eventCode?:string;eventName?:string;
  sceneName?:string;sceneNames?:string[];sceneIds?:string[];bindingCount?:number;sceneStatus?:SceneStatus;ontologyId?:string;graphVersion?:string;priority?:number
}

export interface SceneVersionSummary{id:string;version:string;status:SceneStatus;updatedBy:string;updatedAt:string;publishedAt:string;sourceVersionId:string}
export interface SceneItem{
  id:string;versionId:string;code:string;name:string;version:string;status:SceneStatus;domain:string;description:string;
  objectCode:string;objectName:string;eventCode:string;eventName:string;level:RiskLevel;observationValue:number;observationUnit:string;
  ontologyId:string;graphVersion:string;organizations:string[];objectScope:{logic:Logic;items:unknown[]};
  exceptions:{description:string;validUntil:string};evidence:string[];policies:Array<{name:string;version:string;clause:string}>;
  checkTemplate:{requirements:string;materials:string[];deadlineHours:number};validation:ValidationResult;
  lastTrialId:string;lastTrialStatus:string;runCount:number;lockVersion:number;updatedBy:string;updatedAt:string;
  publishedAt:string;stopReason:string;rules:RuleItem[];ruleCount:number;enabledRuleCount:number;versions:SceneVersionSummary[]
}

export interface TrialSample{id:number;code:string;objectName:string;outcome:'命中'|'未命中'|'错误';level:RiskLevel;evidenceStatus:string;detail:{ruleName?:string;relationHops?:number;matchedFields?:string[];message?:string}}
export interface TrialTask{id:string;sceneVersionId:string;ruleVersionId:string;status:string;graphVersion:string;sampleDays:number;organizationScope:string;maxSamples:number;timeoutSeconds:number;summary:{total:number;hit:number;miss:number;error:number;evidenceCompleteness:number;durationMs:number;passed:boolean};errorMessage:string;startedAt:string;finishedAt:string;samples:TrialSample[]}
export interface SceneReferences{runs:Array<{id:string;objectCode:string;objectName:string;outcome:string;warningCode:string;executedAt:string;evidence:Record<string,unknown>}>;audits:Array<{id:number;action:string;summary:string;operator:string;risk:string;createdAt:string}>}
