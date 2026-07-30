import { createHash, randomUUID } from 'node:crypto'

const editableStatuses = new Set(['草稿', '待试跑', '待发布'])
const warningStages = new Set(['事前', '事中', '事后'])

function normalizeWarningStage(value, fallback = '事中') {
  const text = String(value || '').trim()
  if (warningStages.has(text)) return text
  if (text.includes('事前')) return '事前'
  if (text.includes('事中')) return '事中'
  if (text.includes('事后')) return '事后'
  return fallback
}

async function ensureColumn(pool, table, column, definition) {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [table, column])
  if (!Number(rows[0]?.total || 0)) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
}

const parseJson = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

const makeId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`
const hashOf = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const asJson = (value) => JSON.stringify(value ?? null)

function nextMajor(version) {
  const major = Number(String(version || 'v0.1').replace(/^v/, '').split('.')[0]) || 0
  return `v${major + 1}.0`
}

function mapRule(row) {
  return {
    id: row.rule_id,
    versionId: row.id,
    sceneId: row.scene_id,
    sceneVersionId: row.scene_version_id,
    code: row.code,
    name: row.name,
    version: row.version,
    type: row.rule_type,
    stage: normalizeWarningStage(row.stage),
    level: row.risk_level,
    enabled: Boolean(row.enabled),
    status: row.status,
    conditions: parseJson(row.condition_json, { id: 'group-root', logic: 'AND', items: [] }),
    pathConfig: parseJson(row.path_json, { hops: [] }),
    timeConfig: parseJson(row.time_json, { eventCode: '', windowValue: 180, windowUnit: '天', direction: '之前' }),
    aggregateConfig: parseJson(row.aggregate_json, { function: 'COUNT', fieldCode: '', groupBy: '', operator: '大于等于', threshold: 2 }),
    exceptions: parseJson(row.exception_json, { enabled: false, description: '', whitelist: [] }),
    outputs: parseJson(row.output_json, []),
    evidence: parseJson(row.evidence_json, []),
    policy: parseJson(row.policy_json, { name: '', version: '', clause: '' }),
    failureStrategy: row.failure_strategy,
    summary: row.summary,
    lockVersion: Number(row.lock_version),
    updatedAt: row.updated_at,
    sceneName: row.scene_name || '',
    sceneStatus: row.scene_status || '',
    ontologyId: row.ontology_id || '',
    graphVersion: row.graph_version || '',
  }
}

function mapScene(row, rules = [], versions = []) {
  return {
    id: row.scene_id,
    versionId: row.id,
    code: row.code,
    name: row.name,
    version: row.version,
    status: row.status,
    domain: row.domain,
    description: row.description,
    objectCode: row.object_code,
    objectName: row.object_name,
    eventCode: row.event_code,
    eventName: row.event_name,
    level: row.risk_level,
    observationValue: Number(row.observation_value),
    observationUnit: row.observation_unit,
    ontologyId: row.ontology_id,
    graphVersion: row.graph_version,
    organizations: parseJson(row.organization_json, []),
    objectScope: parseJson(row.object_scope_json, { logic: 'AND', items: [] }),
    exceptions: parseJson(row.exception_json, { description: '', validUntil: '' }),
    evidence: parseJson(row.evidence_json, []),
    policies: parseJson(row.policy_json, []),
    checkTemplate: parseJson(row.check_template_json, { requirements: '', materials: [], deadlineHours: 48 }),
    validation: parseJson(row.validation_json, { blockers: [], warnings: [], validatedAt: '' }),
    lastTrialId: row.last_trial_id || '',
    lastTrialStatus: row.last_trial_status || '',
    runCount: Number(row.run_count || 0),
    lockVersion: Number(row.lock_version),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || '',
    stopReason: row.stop_reason || '',
    rules,
    ruleCount: rules.length || Number(row.rule_count || 0),
    enabledRuleCount: rules.length ? rules.filter((item) => item.enabled).length : Number(row.enabled_rule_count || 0),
    versions,
  }
}

function ruleSnapshot(rule) {
  return {
    id: rule.id,
    name: rule.name,
    type: rule.rule_type,
    stage: normalizeWarningStage(rule.stage),
    level: rule.risk_level,
    enabled: Boolean(rule.enabled),
    conditions: parseJson(rule.condition_json, {}),
    path: parseJson(rule.path_json, {}),
    time: parseJson(rule.time_json, {}),
    aggregate: parseJson(rule.aggregate_json, {}),
    exceptions: parseJson(rule.exception_json, {}),
    outputs: parseJson(rule.output_json, []),
    evidence: parseJson(rule.evidence_json, []),
    policy: parseJson(rule.policy_json, {}),
    failureStrategy: rule.failure_strategy,
  }
}

function sceneSnapshot(scene, rules) {
  return {
    scene: {
      name: scene.name,
      domain: scene.domain,
      description: scene.description,
      objectCode: scene.object_code,
      eventCode: scene.event_code,
      level: scene.risk_level,
      observationValue: scene.observation_value,
      observationUnit: scene.observation_unit,
      ontologyId: scene.ontology_id,
      graphVersion: scene.graph_version,
      organizations: parseJson(scene.organization_json, []),
      objectScope: parseJson(scene.object_scope_json, {}),
      exceptions: parseJson(scene.exception_json, {}),
      evidence: parseJson(scene.evidence_json, []),
      policies: parseJson(scene.policy_json, []),
      checkTemplate: parseJson(scene.check_template_json, {}),
    },
    rules: rules.map(ruleSnapshot),
  }
}

async function audit(connection, sceneVersionId, action, summary, risk = '普通') {
  await connection.query(
    'INSERT INTO scene_rule_audits (scene_version_id,action,summary,risk_level) VALUES (?,?,?,?)',
    [sceneVersionId, action, summary, risk],
  )
}

export async function initializeSceneRuleDatabase(pool) {
async function migrateRuleAssets(pool) {
  await pool.query(`INSERT IGNORE INTO rule_assets (id,code,current_version_id,status,created_at)
    SELECT rr.id,rr.code,
      (SELECT rv2.id FROM rule_versions rv2 WHERE rv2.rule_id=rr.id ORDER BY rv2.updated_at DESC,rv2.created_at DESC LIMIT 1),
      COALESCE((SELECT rv3.status FROM rule_versions rv3 WHERE rv3.rule_id=rr.id ORDER BY rv3.updated_at DESC,rv3.created_at DESC LIMIT 1),'草稿'),
      rr.created_at
    FROM risk_rules rr`)
  await pool.query(`INSERT IGNORE INTO rule_asset_versions
    (id,rule_id,version,name,domain,object_code,object_name,event_code,event_name,ontology_id,graph_version,rule_type,risk_level,stage,status,condition_json,path_json,time_json,aggregate_json,exception_json,output_json,evidence_json,policy_json,failure_strategy,summary,lock_version,updated_at,created_at)
    SELECT rv.id,rv.rule_id,rv.version,rv.name,sv.domain,sv.object_code,sv.object_name,sv.event_code,sv.event_name,sv.ontology_id,sv.graph_version,rv.rule_type,rv.risk_level,'事中',rv.status,rv.condition_json,rv.path_json,rv.time_json,rv.aggregate_json,rv.exception_json,rv.output_json,rv.evidence_json,rv.policy_json,rv.failure_strategy,rv.summary,rv.lock_version,rv.updated_at,rv.created_at
    FROM rule_versions rv JOIN scene_versions sv ON sv.id=rv.scene_version_id`)
  await pool.query(`INSERT IGNORE INTO scene_rule_bindings
    (scene_version_id,rule_version_id,enabled,risk_level_override,parameters_json,priority,created_at,updated_at)
    SELECT rv.scene_version_id,rv.id,rv.enabled,NULL,JSON_OBJECT(),100,rv.created_at,rv.updated_at
    FROM rule_versions rv`)
  await pool.query(`UPDATE rule_assets ra SET current_version_id=(
    SELECT rav.id FROM rule_asset_versions rav WHERE rav.rule_id=ra.id ORDER BY rav.updated_at DESC,rav.created_at DESC LIMIT 1
  ) WHERE ra.current_version_id IS NULL`)
}

  await pool.query(`CREATE TABLE IF NOT EXISTS risk_scenes (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    current_version_id VARCHAR(80) NULL,
    created_by VARCHAR(80) NOT NULL DEFAULT '尹晨阳',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS scene_versions (
    id VARCHAR(80) PRIMARY KEY,
    scene_id VARCHAR(64) NOT NULL,
    version VARCHAR(24) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT '草稿',
    name VARCHAR(160) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    object_code VARCHAR(120) NOT NULL DEFAULT '',
    object_name VARCHAR(160) NOT NULL DEFAULT '',
    event_code VARCHAR(120) NOT NULL DEFAULT '',
    event_name VARCHAR(160) NOT NULL DEFAULT '',
    risk_level VARCHAR(16) NOT NULL DEFAULT '高',
    observation_value INT NOT NULL DEFAULT 180,
    observation_unit VARCHAR(16) NOT NULL DEFAULT '天',
    ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC',
    graph_version VARCHAR(64) NOT NULL DEFAULT 'GRAPH-20260717.2',
    organization_json JSON NOT NULL,
    object_scope_json JSON NOT NULL,
    exception_json JSON NOT NULL,
    evidence_json JSON NOT NULL,
    policy_json JSON NOT NULL,
    check_template_json JSON NOT NULL,
    validation_json JSON NULL,
    dependency_hash VARCHAR(64) NOT NULL DEFAULT '',
    last_trial_id VARCHAR(80) NULL,
    lock_version INT NOT NULL DEFAULT 1,
    source_version_id VARCHAR(80) NULL,
    published_at DATETIME NULL,
    stop_reason VARCHAR(500) NOT NULL DEFAULT '',
    updated_by VARCHAR(80) NOT NULL DEFAULT '尹晨阳',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_scene_version (scene_id, version),
    KEY idx_scene_status (status, updated_at),
    CONSTRAINT fk_scene_version_scene FOREIGN KEY (scene_id) REFERENCES risk_scenes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS risk_rules (
    id VARCHAR(64) PRIMARY KEY,
    scene_id VARCHAR(64) NOT NULL,
    code VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rule_code (scene_id, code),
    CONSTRAINT fk_rule_scene FOREIGN KEY (scene_id) REFERENCES risk_scenes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS rule_versions (
    id VARCHAR(80) PRIMARY KEY,
    rule_id VARCHAR(64) NOT NULL,
    scene_version_id VARCHAR(80) NOT NULL,
    version VARCHAR(24) NOT NULL,
    name VARCHAR(160) NOT NULL,
    rule_type VARCHAR(32) NOT NULL DEFAULT '属性',
    risk_level VARCHAR(16) NOT NULL DEFAULT '高',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT '草稿',
    condition_json JSON NOT NULL,
    path_json JSON NOT NULL,
    time_json JSON NOT NULL,
    aggregate_json JSON NOT NULL,
    exception_json JSON NOT NULL,
    output_json JSON NOT NULL,
    evidence_json JSON NOT NULL,
    policy_json JSON NOT NULL,
    failure_strategy VARCHAR(40) NOT NULL DEFAULT '进入异常队列',
    summary TEXT NOT NULL,
    lock_version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rule_scene_version (rule_id, scene_version_id),
    KEY idx_rule_scene_version (scene_version_id),
    CONSTRAINT fk_rule_version_rule FOREIGN KEY (rule_id) REFERENCES risk_rules(id) ON DELETE CASCADE,
    CONSTRAINT fk_rule_version_scene_version FOREIGN KEY (scene_version_id) REFERENCES scene_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS rule_assets (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    current_version_id VARCHAR(80) NULL,
    status VARCHAR(24) NOT NULL DEFAULT '草稿',
    created_by VARCHAR(80) NOT NULL DEFAULT '尹晨阳',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS rule_asset_versions (
    id VARCHAR(80) PRIMARY KEY,
    rule_id VARCHAR(64) NOT NULL,
    version VARCHAR(24) NOT NULL,
    name VARCHAR(160) NOT NULL,
    domain VARCHAR(64) NOT NULL DEFAULT '采购',
    object_code VARCHAR(120) NOT NULL DEFAULT '',
    object_name VARCHAR(160) NOT NULL DEFAULT '',
    event_code VARCHAR(120) NOT NULL DEFAULT '',
    event_name VARCHAR(160) NOT NULL DEFAULT '',
    ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC',
    graph_version VARCHAR(64) NOT NULL DEFAULT 'GRAPH-20260717.2',
    rule_type VARCHAR(32) NOT NULL DEFAULT '属性',
    risk_level VARCHAR(16) NOT NULL DEFAULT '高',
    stage VARCHAR(16) NOT NULL DEFAULT '事中',
    status VARCHAR(24) NOT NULL DEFAULT '草稿',
    condition_json JSON NOT NULL,
    path_json JSON NOT NULL,
    time_json JSON NOT NULL,
    aggregate_json JSON NOT NULL,
    exception_json JSON NOT NULL,
    output_json JSON NOT NULL,
    evidence_json JSON NOT NULL,
    policy_json JSON NOT NULL,
    failure_strategy VARCHAR(40) NOT NULL DEFAULT '进入异常队列',
    summary TEXT NOT NULL,
    lock_version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rule_asset_version (rule_id,version),
    KEY idx_rule_asset_status (status,updated_at),
    CONSTRAINT fk_rule_asset_version_rule FOREIGN KEY (rule_id) REFERENCES rule_assets(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS scene_rule_bindings (
    scene_version_id VARCHAR(80) NOT NULL,
    rule_version_id VARCHAR(80) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    risk_level_override VARCHAR(16) NULL,
    parameters_json JSON NOT NULL,
    priority INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (scene_version_id,rule_version_id),
    KEY idx_binding_rule (rule_version_id,scene_version_id),
    CONSTRAINT fk_binding_scene FOREIGN KEY (scene_version_id) REFERENCES scene_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_binding_rule_version FOREIGN KEY (rule_version_id) REFERENCES rule_asset_versions(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS skill_assets (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    current_version_id VARCHAR(80) NULL,
    status VARCHAR(24) NOT NULL DEFAULT '草稿',
    created_by VARCHAR(80) NOT NULL DEFAULT '尹晨阳',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS skill_asset_versions (
    id VARCHAR(80) PRIMARY KEY,
    skill_id VARCHAR(64) NOT NULL,
    version VARCHAR(24) NOT NULL,
    name VARCHAR(160) NOT NULL,
    skill_type VARCHAR(64) NOT NULL DEFAULT '文档分析',
    domain VARCHAR(64) NOT NULL DEFAULT '采购',
    description TEXT NOT NULL,
    risk_level VARCHAR(16) NOT NULL DEFAULT '高',
    status VARCHAR(24) NOT NULL DEFAULT '草稿',
    input_json JSON NOT NULL,
    config_json JSON NOT NULL,
    output_json JSON NOT NULL,
    evidence_json JSON NOT NULL,
    policy_json JSON NOT NULL,
    failure_strategy VARCHAR(80) NOT NULL DEFAULT '记录执行异常，不产生预警',
    summary TEXT NOT NULL,
    lock_version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_skill_asset_version (skill_id,version),
    KEY idx_skill_asset_status (status,updated_at),
    CONSTRAINT fk_skill_asset_version_skill FOREIGN KEY (skill_id) REFERENCES skill_assets(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS scene_skill_bindings (
    scene_version_id VARCHAR(80) NOT NULL,
    skill_version_id VARCHAR(80) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    risk_level_override VARCHAR(16) NULL,
    parameters_json JSON NOT NULL,
    priority INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (scene_version_id,skill_version_id),
    KEY idx_binding_skill (skill_version_id,scene_version_id),
    CONSTRAINT fk_skill_binding_scene FOREIGN KEY (scene_version_id) REFERENCES scene_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_binding_skill_version FOREIGN KEY (skill_version_id) REFERENCES skill_asset_versions(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS rule_trial_tasks (
    id VARCHAR(80) PRIMARY KEY,
    scene_version_id VARCHAR(80) NOT NULL,
    rule_version_id VARCHAR(80) NULL,
    status VARCHAR(24) NOT NULL,
    graph_version VARCHAR(64) NOT NULL,
    sample_days INT NOT NULL,
    organization_scope VARCHAR(240) NOT NULL,
    max_samples INT NOT NULL,
    timeout_seconds INT NOT NULL,
    parameters_json JSON NOT NULL,
    summary_json JSON NULL,
    error_message VARCHAR(500) NOT NULL DEFAULT '',
    config_hash VARCHAR(64) NOT NULL,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_trial_scene (scene_version_id, created_at),
    CONSTRAINT fk_trial_scene_version FOREIGN KEY (scene_version_id) REFERENCES scene_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS rule_trial_samples (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    task_id VARCHAR(80) NOT NULL,
    sample_code VARCHAR(80) NOT NULL,
    object_name VARCHAR(200) NOT NULL,
    outcome VARCHAR(24) NOT NULL,
    risk_level VARCHAR(16) NOT NULL,
    evidence_status VARCHAR(24) NOT NULL,
    detail_json JSON NOT NULL,
    KEY idx_trial_sample (task_id, outcome),
    CONSTRAINT fk_trial_sample_task FOREIGN KEY (task_id) REFERENCES rule_trial_tasks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS rule_run_records (
    id VARCHAR(80) PRIMARY KEY,
    scene_version_id VARCHAR(80) NOT NULL,
    rule_version_id VARCHAR(80) NOT NULL,
    trial_sample_id BIGINT UNSIGNED NULL,
    object_code VARCHAR(80) NOT NULL,
    object_name VARCHAR(200) NOT NULL,
    outcome VARCHAR(24) NOT NULL,
    evidence_json JSON NOT NULL,
    warning_code VARCHAR(80) NOT NULL DEFAULT '',
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_run_scene (scene_version_id, executed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS skill_run_records (
    id VARCHAR(80) PRIMARY KEY,
    scene_version_id VARCHAR(80) NOT NULL,
    skill_version_id VARCHAR(80) NOT NULL,
    trial_sample_id BIGINT UNSIGNED NULL,
    object_code VARCHAR(80) NOT NULL,
    object_name VARCHAR(200) NOT NULL,
    outcome VARCHAR(24) NOT NULL,
    score DECIMAL(6,2) NULL,
    evidence_json JSON NOT NULL,
    warning_code VARCHAR(80) NOT NULL DEFAULT '',
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_skill_run_scene (scene_version_id, executed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS rule_effect_samples (
    id VARCHAR(80) PRIMARY KEY,
    run_record_id VARCHAR(80) NOT NULL,
    conclusion VARCHAR(40) NOT NULL,
    effect_label VARCHAR(40) NOT NULL,
    feedback_json JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_effect_run (run_record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS scene_rule_audits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    scene_version_id VARCHAR(80) NOT NULL,
    action VARCHAR(80) NOT NULL,
    summary VARCHAR(500) NOT NULL,
    operator_name VARCHAR(80) NOT NULL DEFAULT '尹晨阳',
    risk_level VARCHAR(16) NOT NULL DEFAULT '普通',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_scene_audit (scene_version_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await ensureColumn(pool, 'rule_asset_versions', 'stage', "`stage` VARCHAR(16) NOT NULL DEFAULT '事中' AFTER `risk_level`")
  await pool.query("UPDATE rule_asset_versions SET stage='事中' WHERE stage IS NULL OR stage NOT IN ('事前','事中','事后')")

  const [skillRows] = await pool.query('SELECT COUNT(*) AS total FROM skill_assets')
  if (Number(skillRows[0].total) === 0) await seedSkillAssets(pool)
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM risk_scenes')
  if (Number(rows[0].total) === 0) await seedSceneRules(pool)
  await migrateRuleAssets(pool)
  await pool.query("UPDATE scene_versions SET graph_version='GRAPH-20260717.2' WHERE graph_version='GRAPH-0717.2'")
  await pool.query("UPDATE rule_asset_versions SET graph_version='GRAPH-20260717.2' WHERE graph_version='GRAPH-0717.2'")
}

async function seedSkillAssets(pool){
  const skills=[
    {id:'SKILL-BID-DOC-SIM',versionId:'SKV-BID-DOC-SIM-01',code:'SKILL-BID-DOC-SIM',name:'投标文件异常相似检测',type:'文档异常相似检测',description:'对同一项目下不同供应商的投标文件进行语义和版式相似分析，识别异常相似段落、相同错误及格式特征。',level:'高',instruction:'比较同一项目下不同供应商的投标文件，识别异常相似段落、相同错别字、相同格式错误和非模板化表述。',threshold:85,policy:{name:'招标投标管理办法',version:'v2.1',clause:'第三十六条'},evidence:'相似段落及页码'},
    {id:'SKILL-CONTRACT-BIAS',versionId:'SKV-CONTRACT-BIAS-01',code:'SKILL-CONTRACT-BIAS',name:'合同倾向性条款识别',type:'风险条款识别',description:'识别采购合同中可能排斥竞争、倾向特定供应商或明显偏离标准模板的条款。',level:'中',instruction:'分析合同条款与标准模板的差异，识别可能倾向特定供应商、限制竞争或显著偏离制度要求的内容。',threshold:80,policy:{name:'采购合同管理制度',version:'v3.0',clause:'第十八条'},evidence:'风险条款原文及位置'},
    {id:'SKILL-DATA-ATTACH-CHECK',versionId:'SKV-DATA-ATTACH-CHECK-01',code:'SKILL-DATA-ATTACH-CHECK',name:'数据与附件一致性核验',type:'数据与附件一致性检查',description:'核验业务系统结构化字段与审批单、合同、报价单等附件中的关键信息是否一致。',level:'中',instruction:'提取附件中的项目、供应商、金额和关键日期，与业务系统字段逐项比对并说明不一致内容。',threshold:90,policy:{name:'采购业务数据质量规范',version:'v1.4',clause:'第九条'},evidence:'字段与附件比对明细'},
  ]
  const outputs=[{id:'output-match',name:'是否命中',dataType:'布尔',description:'是否达到风险命中条件'},{id:'output-score',name:'风险评分',dataType:'数字',description:'0至100分'},{id:'output-conclusion',name:'判断结论',dataType:'文本',description:'结构化风险结论'},{id:'output-evidence',name:'证据列表',dataType:'列表',description:'原文、页码或字段比对明细'}]
  for(const skill of skills){
    await pool.query("INSERT IGNORE INTO skill_assets (id,code,current_version_id,status) VALUES (?,?,?,'草稿')",[skill.id,skill.code,skill.versionId])
    await pool.query(`INSERT IGNORE INTO skill_asset_versions (id,skill_id,version,name,skill_type,domain,description,risk_level,status,input_json,config_json,output_json,evidence_json,policy_json,failure_strategy,summary) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
      skill.versionId,skill.id,'v0.1',skill.name,skill.type,'采购',skill.description,skill.level,'草稿',
      asJson([{id:'input-file',name:'业务附件',sourceType:'附件',source:'场景运行对象关联附件',required:true}]),asJson({instruction:skill.instruction,threshold:skill.threshold}),asJson(outputs),
      asJson([{id:'evidence-result',name:skill.evidence,source:'Skill分析结果',sourceField:'evidence',attachmentRequirement:'保留原始附件',completeness:'必须包含文件名称、原文位置、分析结果和Skill版本',description:''}]),
      asJson([{id:'policy-default',...skill.policy,text:''}]),'记录执行异常，不产生预警',`${skill.type}；评分达到${skill.threshold}分时命中，并返回结构化实际证据。`,
    ])
  }
}
async function seedSceneRules(pool) {
  const common = {
    organizations: ['中国电子云集团', '集团采购中心', '各事业部采购组织'],
    objectScope: { logic: 'AND', items: [] },
    exceptions: { description: '已批准单一来源采购、集团内部关联交易转人工复核', validUntil: '2027-12-31' },
    evidence: ['业务来源记录', '主体信息', '审批记录', '规则运行明细'],
    policies: [{ name: '采购评审管理办法', version: 'v3.2', clause: '第十二条' }],
    checkTemplate: { requirements: '核验主体关系、联系方式来源及审批留痕，确认是否影响公平评审。', materials: ['工商信息', '评审记录', '审批单'], deadlineHours: 48 },
  }
  const scenes = [
    { id:'SCENE-001', versionId:'SV-SCENE-001-V23', version:'v2.3', status:'已发布', name:'供应商与评审人员利益关联', domain:'采购', description:'识别供应商、实际控制人与评审人员之间可能影响公平评审的关联。', objectCode:'PROC.Supplier', objectName:'供应商', eventCode:'PROC.BidConfirmed', eventName:'中标确认', level:'重大', window:180, publishedAt:'2026-07-17 10:30:00' },
    { id:'SCENE-002', versionId:'SV-SCENE-002-V11', version:'v1.1', status:'待试跑', name:'中标后异常合同变更', domain:'合同', description:'识别中标后短期内金额或关键条款发生异常变化的合同。', objectCode:'PROC.Contract', objectName:'合同', eventCode:'PROC.ContractChanged', eventName:'合同变更', level:'高', window:90, publishedAt:null },
    { id:'SCENE-003', versionId:'SV-SCENE-003-V01', version:'v0.1', status:'草稿', name:'集中采购拆分规避', domain:'采购', description:'识别同主体、同周期的小额采购拆分行为。', objectCode:'PROC.PurchaseProject', objectName:'采购项目', eventCode:'PROC.PurchaseCreated', eventName:'采购立项', level:'中', window:30, publishedAt:null },
  ]
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    for (const scene of scenes) {
      await connection.query('INSERT INTO risk_scenes (id,code,current_version_id) VALUES (?,?,?)', [scene.id, scene.id, scene.versionId])
      await connection.query(`INSERT INTO scene_versions
        (id,scene_id,version,status,name,domain,description,object_code,object_name,event_code,event_name,risk_level,observation_value,observation_unit,ontology_id,graph_version,organization_json,object_scope_json,exception_json,evidence_json,policy_json,check_template_json,validation_json,published_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ONT-PROC','GRAPH-20260717.2',?,?,?,?,?,?,?,?)`, [scene.versionId,scene.id,scene.version,scene.status,scene.name,scene.domain,scene.description,scene.objectCode,scene.objectName,scene.eventCode,scene.eventName,scene.level,scene.window,'天',asJson(common.organizations),asJson(common.objectScope),asJson(common.exceptions),asJson(common.evidence),asJson(common.policies),asJson(common.checkTemplate),asJson({blockers:[],warnings:[],validatedAt:scene.status==='草稿'?'':'2026-07-17 09:20:00'}),scene.publishedAt])
    }
    const defaultOutputs = ['主体名称与编码', '命中字段和值', '关系路径', '来源记录与版本']
    const defaultEvidence = ['业务来源记录', '主体信息', '规则运行明细']
    const defaultPolicy = { name:'采购评审管理办法', version:'v3.2', clause:'第十二条' }
    const rules = [
      { id:'RULE-001', sceneId:'SCENE-001', versionId:'RV-RULE-001-V23', sceneVersionId:'SV-SCENE-001-V23', version:'v2.3', name:'供应商与评审人员共同联系方式', type:'关系路径', level:'重大', status:'已发布', conditions:{id:'group-root',logic:'AND',items:[{id:'cond-phone',fieldCode:'PROC.Supplier.phone',fieldName:'供应商.联系电话',fieldType:'文本',operator:'等于',valueMode:'field',value:'',valueFieldCode:'PROC.Reviewer.phone',valueFieldName:'评审人员.联系电话'},{id:'cond-time',fieldCode:'PROC.Contact.valid_time',fieldName:'共同信息.有效时间',fieldType:'日期时间',operator:'覆盖',valueMode:'literal',value:'目标类节点前180天'}]}, path:{hops:[{from:'供应商',relation:'登记联系方式',to:'联系方式'},{from:'联系方式',relation:'共同使用',to:'评审人员'}]} },
      { id:'RULE-002', sceneId:'SCENE-001', versionId:'RV-RULE-002-V23', sceneVersionId:'SV-SCENE-001-V23', version:'v2.3', name:'实际控制人与评审人员任职关联', type:'关系路径', level:'高', status:'已发布', conditions:{id:'group-root',logic:'OR',items:[{id:'cond-controller',fieldCode:'PROC.Controller.person_id',fieldName:'实际控制人.人员ID',fieldType:'文本',operator:'等于',valueMode:'field',value:'',valueFieldCode:'PROC.Reviewer.person_id',valueFieldName:'评审人员.人员ID'}]}, path:{hops:[{from:'供应商',relation:'实际控制',to:'人员'},{from:'人员',relation:'参与评审',to:'评审人员'}]} },
      { id:'RULE-003', sceneId:'SCENE-002', versionId:'RV-RULE-003-V11', sceneVersionId:'SV-SCENE-002-V11', version:'v1.1', name:'合同金额短期异常增加', type:'聚合', level:'高', status:'待试跑', conditions:{id:'group-root',logic:'AND',items:[{id:'cond-amount',fieldCode:'PROC.Contract.change_rate',fieldName:'合同.金额变更比例',fieldType:'数字',operator:'大于',valueMode:'literal',value:'20'}]}, path:{hops:[]} },
    ]
    for (const rule of rules) {
      await connection.query('INSERT INTO risk_rules (id,scene_id,code) VALUES (?,?,?)', [rule.id, rule.sceneId, rule.id])
      await connection.query(`INSERT INTO rule_versions
        (id,rule_id,scene_version_id,version,name,rule_type,risk_level,enabled,status,condition_json,path_json,time_json,aggregate_json,exception_json,output_json,evidence_json,policy_json,failure_strategy,summary)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [rule.versionId,rule.id,rule.sceneVersionId,rule.version,rule.name,rule.type,rule.level,1,rule.status,asJson(rule.conditions),asJson(rule.path),asJson({eventCode:'PROC.BidConfirmed',windowValue:180,windowUnit:'天',direction:'之前'}),asJson({function:'SUM',fieldCode:'PROC.Contract.change_amount',groupBy:'PROC.Contract.id',operator:'大于',threshold:1000000}),asJson({enabled:true,description:'集团内部关联交易转人工复核',whitelist:[]}),asJson(defaultOutputs),asJson(defaultEvidence),asJson(defaultPolicy),'进入异常队列',rule.type==='聚合'?'合同变更金额累计超过阈值时生成高风险预警。':'命中主体关联路径时生成风险预警并固化证据。'])
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
