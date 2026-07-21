-- 采购与供应链穿透式监管演示数据：兼容结构与扩展表
-- 生成时间：2026-07-21
-- 安全约束：本文件固定使用独立演示库，不读取项目 .env.local。
SET NAMES utf8mb4;
USE `penetrative_supervision_demo`;

CREATE TABLE IF NOT EXISTS ontologies (
  id VARCHAR(64) PRIMARY KEY,name VARCHAR(160) NOT NULL,scope VARCHAR(64) NOT NULL,domain VARCHAR(64) NOT NULL,version VARCHAR(24) NOT NULL,
  source_version_id VARCHAR(64) NULL,class_count INT NOT NULL DEFAULT 0,property_count INT NOT NULL DEFAULT 0,relation_count INT NOT NULL DEFAULT 0,event_count INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT '草稿',description TEXT NOT NULL,validation_json JSON NULL,published_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ontology_elements (
  element_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,ontology_id VARCHAR(64) NOT NULL,element_type VARCHAR(24) NOT NULL,code VARCHAR(120) NOT NULL,
  name VARCHAR(160) NOT NULL,owner_code VARCHAR(120) NOT NULL DEFAULT '',target_code VARCHAR(120) NOT NULL DEFAULT '',data_type VARCHAR(120) NOT NULL DEFAULT '',
  constraint_desc VARCHAR(240) NOT NULL DEFAULT '',description TEXT NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ontology_element (ontology_id,element_type,code),CONSTRAINT fk_demo_element_ontology FOREIGN KEY (ontology_id) REFERENCES ontologies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS data_sources (
  id VARCHAR(64) PRIMARY KEY,name VARCHAR(160) NOT NULL,mode VARCHAR(40) NOT NULL,data_range VARCHAR(300) NOT NULL,owner VARCHAR(80) NOT NULL,
  sync_mode VARCHAR(40) NOT NULL,last_success VARCHAR(80) NOT NULL DEFAULT '未同步',status VARCHAR(24) NOT NULL DEFAULT '草稿',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS semantic_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,source_id VARCHAR(64) NOT NULL,ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC',mapping_type VARCHAR(24) NOT NULL,
  source_field VARCHAR(160) NOT NULL,transform_rule VARCHAR(160) NOT NULL,target_code VARCHAR(160) NOT NULL,confidence INT NOT NULL DEFAULT 0,status VARCHAR(24) NOT NULL DEFAULT '待校验',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uk_mapping (source_id,mapping_type,source_field,target_code),
  CONSTRAINT fk_demo_mapping_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS semantic_mapping_sets (
  source_id VARCHAR(64) NOT NULL,ontology_id VARCHAR(64) NOT NULL,revision INT NOT NULL DEFAULT 1,status VARCHAR(24) NOT NULL DEFAULT '待校验',last_validated_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY (source_id,ontology_id),
  CONSTRAINT fk_demo_mapping_set_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS graph_versions (
  id VARCHAR(64) PRIMARY KEY,graph_code VARCHAR(64) NOT NULL DEFAULT '',graph_name VARCHAR(160) NOT NULL DEFAULT '',ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC',
  ontology_version VARCHAR(160) NOT NULL,mapping_version VARCHAR(80) NOT NULL,data_range VARCHAR(160) NOT NULL,entity_count INT NOT NULL DEFAULT 0,relation_count INT NOT NULL DEFAULT 0,
  event_count INT NOT NULL DEFAULT 0,blockers INT NOT NULL DEFAULT 0,warnings INT NOT NULL DEFAULT 0,status VARCHAR(24) NOT NULL DEFAULT '待发布',published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_graph_status (status,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS graph_version_sources (
  graph_id VARCHAR(64) NOT NULL,source_id VARCHAR(64) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (graph_id,source_id),
  CONSTRAINT fk_demo_graph_source_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_demo_graph_source_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS risk_scenes (
  id VARCHAR(64) PRIMARY KEY,code VARCHAR(64) NOT NULL UNIQUE,current_version_id VARCHAR(80) NULL,created_by VARCHAR(80) NOT NULL DEFAULT '演示数据管理员',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scene_versions (
  id VARCHAR(80) PRIMARY KEY,scene_id VARCHAR(64) NOT NULL,version VARCHAR(24) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT '草稿',name VARCHAR(160) NOT NULL,domain VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,object_code VARCHAR(120) NOT NULL DEFAULT '',object_name VARCHAR(160) NOT NULL DEFAULT '',event_code VARCHAR(120) NOT NULL DEFAULT '',event_name VARCHAR(160) NOT NULL DEFAULT '',
  risk_level VARCHAR(16) NOT NULL DEFAULT '高',observation_value INT NOT NULL DEFAULT 180,observation_unit VARCHAR(16) NOT NULL DEFAULT '天',ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC',
  graph_version VARCHAR(64) NOT NULL,organization_json JSON NOT NULL,object_scope_json JSON NOT NULL,exception_json JSON NOT NULL,evidence_json JSON NOT NULL,policy_json JSON NOT NULL,
  check_template_json JSON NOT NULL,validation_json JSON NULL,dependency_hash VARCHAR(64) NOT NULL DEFAULT '',last_trial_id VARCHAR(80) NULL,lock_version INT NOT NULL DEFAULT 1,
  source_version_id VARCHAR(80) NULL,published_at DATETIME NULL,stop_reason VARCHAR(500) NOT NULL DEFAULT '',updated_by VARCHAR(80) NOT NULL DEFAULT '演示数据管理员',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_scene_version (scene_id,version),CONSTRAINT fk_demo_scene_version_scene FOREIGN KEY (scene_id) REFERENCES risk_scenes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rule_assets (
  id VARCHAR(64) PRIMARY KEY,code VARCHAR(64) NOT NULL UNIQUE,current_version_id VARCHAR(80) NULL,status VARCHAR(24) NOT NULL DEFAULT '草稿',created_by VARCHAR(80) NOT NULL DEFAULT '演示数据管理员',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rule_asset_versions (
  id VARCHAR(80) PRIMARY KEY,rule_id VARCHAR(64) NOT NULL,version VARCHAR(24) NOT NULL,name VARCHAR(160) NOT NULL,domain VARCHAR(64) NOT NULL DEFAULT '采购',object_code VARCHAR(120) NOT NULL DEFAULT '',
  object_name VARCHAR(160) NOT NULL DEFAULT '',event_code VARCHAR(120) NOT NULL DEFAULT '',event_name VARCHAR(160) NOT NULL DEFAULT '',ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC',graph_version VARCHAR(64) NOT NULL,
  rule_type VARCHAR(32) NOT NULL DEFAULT '属性',risk_level VARCHAR(16) NOT NULL DEFAULT '高',status VARCHAR(24) NOT NULL DEFAULT '草稿',condition_json JSON NOT NULL,path_json JSON NOT NULL,
  time_json JSON NOT NULL,aggregate_json JSON NOT NULL,exception_json JSON NOT NULL,output_json JSON NOT NULL,evidence_json JSON NOT NULL,policy_json JSON NOT NULL,
  failure_strategy VARCHAR(40) NOT NULL DEFAULT '进入异常队列',summary TEXT NOT NULL,lock_version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rule_asset_version (rule_id,version),CONSTRAINT fk_demo_rule_asset_version_rule FOREIGN KEY (rule_id) REFERENCES rule_assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scene_rule_bindings (
  scene_version_id VARCHAR(80) NOT NULL,rule_version_id VARCHAR(80) NOT NULL,enabled TINYINT(1) NOT NULL DEFAULT 1,risk_level_override VARCHAR(16) NULL,
  parameters_json JSON NOT NULL,priority INT NOT NULL DEFAULT 100,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scene_version_id,rule_version_id),CONSTRAINT fk_demo_binding_scene FOREIGN KEY (scene_version_id) REFERENCES scene_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_demo_binding_rule FOREIGN KEY (rule_version_id) REFERENCES rule_asset_versions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rule_run_records (
  id VARCHAR(80) PRIMARY KEY,scene_version_id VARCHAR(80) NOT NULL,rule_version_id VARCHAR(80) NOT NULL,trial_sample_id BIGINT UNSIGNED NULL,object_code VARCHAR(80) NOT NULL,
  object_name VARCHAR(200) NOT NULL,outcome VARCHAR(24) NOT NULL,evidence_json JSON NOT NULL,warning_code VARCHAR(80) NOT NULL DEFAULT '',executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_run_scene (scene_version_id,executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS demo_import_batches (
  batch_id VARCHAR(80) PRIMARY KEY,package_version VARCHAR(40) NOT NULL,source_file VARCHAR(260) NOT NULL,source_sha256 CHAR(64) NOT NULL,status VARCHAR(24) NOT NULL,
  row_counts_json JSON NOT NULL,started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at DATETIME NULL,notes VARCHAR(500) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS graph_entities (
  graph_id VARCHAR(64) NOT NULL,id VARCHAR(100) NOT NULL,ontology_id VARCHAR(64) NOT NULL,class_code VARCHAR(160) NOT NULL,name VARCHAR(240) NOT NULL,case_id VARCHAR(80) NOT NULL,
  organization_id VARCHAR(100) NULL,source_system VARCHAR(80) NOT NULL,source_record VARCHAR(160) NOT NULL,valid_from DATETIME NULL,valid_to DATETIME NULL,status VARCHAR(24) NOT NULL,
  properties_json JSON NOT NULL,batch_id VARCHAR(80) NOT NULL,PRIMARY KEY (graph_id,id),KEY idx_demo_entity_case (case_id,class_code),
  CONSTRAINT fk_demo_entity_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS graph_relations (
  graph_id VARCHAR(64) NOT NULL,id VARCHAR(100) NOT NULL,relation_code VARCHAR(160) NOT NULL,from_entity_id VARCHAR(100) NOT NULL,to_entity_id VARCHAR(100) NOT NULL,case_id VARCHAR(80) NOT NULL,
  source_system VARCHAR(80) NOT NULL,source_record VARCHAR(160) NOT NULL,evidence_id VARCHAR(100) NULL,confidence DECIMAL(7,6) NOT NULL DEFAULT 1,
  valid_from DATETIME NULL,valid_to DATETIME NULL,properties_json JSON NOT NULL,batch_id VARCHAR(80) NOT NULL,PRIMARY KEY (graph_id,id),KEY idx_demo_relation_case (case_id,relation_code),
  CONSTRAINT fk_demo_relation_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_demo_relation_from FOREIGN KEY (graph_id,from_entity_id) REFERENCES graph_entities(graph_id,id) ON DELETE CASCADE,
  CONSTRAINT fk_demo_relation_to FOREIGN KEY (graph_id,to_entity_id) REFERENCES graph_entities(graph_id,id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS graph_events (
  graph_id VARCHAR(64) NOT NULL,id VARCHAR(100) NOT NULL,event_code VARCHAR(160) NOT NULL,name VARCHAR(240) NOT NULL,case_id VARCHAR(80) NOT NULL,object_entity_id VARCHAR(100) NOT NULL,
  actor_entity_id VARCHAR(100) NULL,organization_entity_id VARCHAR(100) NULL,event_time DATETIME NOT NULL,amount DECIMAL(20,4) NULL,status VARCHAR(24) NOT NULL,
  source_system VARCHAR(80) NOT NULL,source_record VARCHAR(160) NOT NULL,properties_json JSON NOT NULL,batch_id VARCHAR(80) NOT NULL,PRIMARY KEY (graph_id,id),KEY idx_demo_event_case (case_id,event_code,event_time),
  CONSTRAINT fk_demo_event_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_demo_event_object FOREIGN KEY (graph_id,object_entity_id) REFERENCES graph_entities(graph_id,id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS risk_warnings (
  warning_code VARCHAR(80) PRIMARY KEY,case_id VARCHAR(80) NOT NULL,scene_code VARCHAR(64) NOT NULL,scene_version_id VARCHAR(80) NOT NULL,title VARCHAR(240) NOT NULL,
  object_id VARCHAR(100) NOT NULL,object_name VARCHAR(240) NOT NULL,stage VARCHAR(24) NOT NULL,risk_level VARCHAR(16) NOT NULL,status VARCHAR(32) NOT NULL,
  hit_rule_count INT NOT NULL,evidence_count INT NOT NULL,risk_score DECIMAL(8,2) NOT NULL,evidence_status VARCHAR(24) NOT NULL,owner_name VARCHAR(80) NOT NULL,
  organization_name VARCHAR(160) NOT NULL,generated_at DATETIME NOT NULL,due_at DATETIME NULL,graph_version VARCHAR(64) NOT NULL,trace_id VARCHAR(100) NOT NULL,batch_id VARCHAR(80) NOT NULL,
  KEY idx_demo_warning_scene (scene_code,status),KEY idx_demo_warning_case (case_id,risk_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS risk_evidence (
  evidence_id VARCHAR(100) PRIMARY KEY,warning_code VARCHAR(80) NOT NULL,case_id VARCHAR(80) NOT NULL,evidence_type VARCHAR(80) NOT NULL,source_system VARCHAR(80) NOT NULL,
  source_record VARCHAR(160) NOT NULL,field_or_relation VARCHAR(200) NOT NULL,evidence_value TEXT NOT NULL,collected_at DATETIME NOT NULL,validity VARCHAR(24) NOT NULL,
  evidence_hash VARCHAR(160) NOT NULL,description VARCHAR(500) NOT NULL,batch_id VARCHAR(80) NOT NULL,KEY idx_demo_evidence_warning (warning_code,validity),
  CONSTRAINT fk_demo_evidence_warning FOREIGN KEY (warning_code) REFERENCES risk_warnings(warning_code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bid_evaluation_scores (
  evaluation_id VARCHAR(100) PRIMARY KEY,case_id VARCHAR(80) NOT NULL,project_id VARCHAR(100) NOT NULL,bid_id VARCHAR(100) NOT NULL,supplier_id VARCHAR(100) NOT NULL,supplier_name VARCHAR(240) NOT NULL,
  technical_score DECIMAL(8,2) NOT NULL,commercial_score DECIMAL(8,2) NOT NULL,price_score DECIMAL(8,2) NOT NULL,relation_risk_deduction DECIMAL(8,2) NOT NULL,
  total_score DECIMAL(8,2) NOT NULL,risk_score DECIMAL(8,2) NOT NULL,rating VARCHAR(8) NOT NULL,recommendation VARCHAR(120) NOT NULL,batch_id VARCHAR(80) NOT NULL,
  UNIQUE KEY uk_demo_bid_score (project_id,bid_id),KEY idx_demo_bid_supplier (supplier_id,risk_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_cycle_records (
  business_id VARCHAR(100) PRIMARY KEY,case_id VARCHAR(80) NOT NULL,business_type VARCHAR(40) NOT NULL,internal_org_id VARCHAR(100) NOT NULL,counterparty_id VARCHAR(100) NOT NULL,
  item_name VARCHAR(240) NOT NULL,specification VARCHAR(240) NOT NULL,quantity DECIMAL(20,4) NOT NULL,unit_price DECIMAL(20,4) NOT NULL,amount DECIMAL(20,4) NOT NULL,
  direction VARCHAR(24) NOT NULL,business_time DATETIME NOT NULL,source_account_id VARCHAR(100) NULL,target_account_id VARCHAR(100) NULL,mode_codes VARCHAR(240) NOT NULL,
  evidence_conclusion VARCHAR(500) NOT NULL,batch_id VARCHAR(80) NOT NULL,KEY idx_demo_trade_case (case_id,business_type,business_time),KEY idx_demo_trade_accounts (source_account_id,target_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
