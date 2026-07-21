-- 入库后校验：所有数量应“通过”，所有异常项应为0
SET NAMES utf8mb4;
USE `penetrative_supervision`;

SELECT 'ontology_elements' AS item,182 AS expected,COUNT(*) AS actual,IF(COUNT(*)=182,'通过','不一致') AS result FROM `ontology_elements` WHERE ontology_id='ONT-PROC-DEMO'
UNION ALL
SELECT 'data_sources' AS item,12 AS expected,COUNT(*) AS actual,IF(COUNT(*)=12,'通过','不一致') AS result FROM `data_sources` WHERE id IN ('SRC-ERP','SRC-OA','SRC-EPR','SRC-LOG','SRC-EXT','SRC-CONTRACT','SRC-WMS','SRC-LOGISTICS','SRC-INVOICE','SRC-TREASURY','SRC-BANK','SRC-RULE')
UNION ALL
SELECT 'semantic_mappings' AS item,25 AS expected,COUNT(*) AS actual,IF(COUNT(*)=25,'通过','不一致') AS result FROM `semantic_mappings` WHERE ontology_id='ONT-PROC-DEMO'
UNION ALL
SELECT 'graph_versions' AS item,1 AS expected,COUNT(*) AS actual,IF(COUNT(*)=1,'通过','不一致') AS result FROM `graph_versions` WHERE id='GRAPH-PROC-DEMO-20260720.1'
UNION ALL
SELECT 'graph_entities' AS item,171 AS expected,COUNT(*) AS actual,IF(COUNT(*)=171,'通过','不一致') AS result FROM `graph_entities` WHERE batch_id='DEMO-20260720-PKG-V1'
UNION ALL
SELECT 'graph_relations' AS item,249 AS expected,COUNT(*) AS actual,IF(COUNT(*)=249,'通过','不一致') AS result FROM `graph_relations` WHERE batch_id='DEMO-20260720-PKG-V1'
UNION ALL
SELECT 'graph_events' AS item,69 AS expected,COUNT(*) AS actual,IF(COUNT(*)=69,'通过','不一致') AS result FROM `graph_events` WHERE batch_id='DEMO-20260720-PKG-V1'
UNION ALL
SELECT 'risk_scenes' AS item,7 AS expected,COUNT(*) AS actual,IF(COUNT(*)=7,'通过','不一致') AS result FROM `risk_scenes` WHERE id IN ('SCENE-PROC-001','SCENE-PROC-002','SCENE-PROC-003','SCENE-PROC-004','SCENE-PROC-005','SCENE-SC-006','SCENE-CON-007')
UNION ALL
SELECT 'rule_assets' AS item,14 AS expected,COUNT(*) AS actual,IF(COUNT(*)=14,'通过','不一致') AS result FROM `rule_assets` WHERE id IN ('RULE-DEMO-001','RULE-DEMO-002','RULE-DEMO-003','RULE-DEMO-004','RULE-DEMO-005','RULE-DEMO-006','RULE-DEMO-007','RULE-DEMO-008','RULE-DEMO-009','RULE-DEMO-010','RULE-DEMO-011','RULE-DEMO-012','RULE-DEMO-013','RULE-DEMO-014')
UNION ALL
SELECT 'scene_rule_bindings' AS item,14 AS expected,COUNT(*) AS actual,IF(COUNT(*)=14,'通过','不一致') AS result FROM `scene_rule_bindings` WHERE scene_version_id IN ('SV-SCENE-PROC-001-V10','SV-SCENE-PROC-002-V10','SV-SCENE-PROC-003-V10','SV-SCENE-PROC-004-V10','SV-SCENE-PROC-005-V10','SV-SCENE-SC-006-V10','SV-SCENE-CON-007-V10')
UNION ALL
SELECT 'rule_run_records' AS item,18 AS expected,COUNT(*) AS actual,IF(COUNT(*)=18,'通过','不一致') AS result FROM `rule_run_records` WHERE id IN ('RUN-001','RUN-002','RUN-003','RUN-004','RUN-005','RUN-006','RUN-007','RUN-008','RUN-009','RUN-010','RUN-011','RUN-012','RUN-013','RUN-014','RUN-015','RUN-016','RUN-017','RUN-018')
UNION ALL
SELECT 'risk_warnings' AS item,7 AS expected,COUNT(*) AS actual,IF(COUNT(*)=7,'通过','不一致') AS result FROM `risk_warnings` WHERE batch_id='DEMO-20260720-PKG-V1'
UNION ALL
SELECT 'risk_evidence' AS item,33 AS expected,COUNT(*) AS actual,IF(COUNT(*)=33,'通过','不一致') AS result FROM `risk_evidence` WHERE batch_id='DEMO-20260720-PKG-V1'
UNION ALL
SELECT 'bid_evaluation_scores' AS item,6 AS expected,COUNT(*) AS actual,IF(COUNT(*)=6,'通过','不一致') AS result FROM `bid_evaluation_scores` WHERE batch_id='DEMO-20260720-PKG-V1'
UNION ALL
SELECT 'trade_cycle_records' AS item,8 AS expected,COUNT(*) AS actual,IF(COUNT(*)=8,'通过','不一致') AS result FROM `trade_cycle_records` WHERE batch_id='DEMO-20260720-PKG-V1';

SELECT '关系起点缺失' AS check_name,COUNT(*) AS anomaly_count FROM graph_relations r LEFT JOIN graph_entities e ON e.graph_id=r.graph_id AND e.id=r.from_entity_id WHERE r.batch_id='DEMO-20260720-PKG-V1' AND e.id IS NULL
UNION ALL SELECT '关系终点缺失',COUNT(*) FROM graph_relations r LEFT JOIN graph_entities e ON e.graph_id=r.graph_id AND e.id=r.to_entity_id WHERE r.batch_id='DEMO-20260720-PKG-V1' AND e.id IS NULL
UNION ALL SELECT '事件对象缺失',COUNT(*) FROM graph_events v LEFT JOIN graph_entities e ON e.graph_id=v.graph_id AND e.id=v.object_entity_id WHERE v.batch_id='DEMO-20260720-PKG-V1' AND e.id IS NULL
UNION ALL SELECT '节点本体类缺失',COUNT(*) FROM graph_entities e LEFT JOIN ontology_elements o ON o.ontology_id=e.ontology_id AND o.element_type='class' AND o.code=e.class_code WHERE e.batch_id='DEMO-20260720-PKG-V1' AND o.element_id IS NULL
UNION ALL SELECT '关系本体编码缺失',COUNT(*) FROM graph_relations r LEFT JOIN ontology_elements o ON o.ontology_id='ONT-PROC-DEMO' AND o.element_type='relation' AND o.code=r.relation_code WHERE r.batch_id='DEMO-20260720-PKG-V1' AND o.element_id IS NULL
UNION ALL SELECT '事件本体编码缺失',COUNT(*) FROM graph_events v LEFT JOIN ontology_elements o ON o.ontology_id='ONT-PROC-DEMO' AND o.element_type='event' AND o.code=v.event_code WHERE v.batch_id='DEMO-20260720-PKG-V1' AND o.element_id IS NULL
UNION ALL SELECT '证据无预警',COUNT(*) FROM risk_evidence e LEFT JOIN risk_warnings w ON w.warning_code=e.warning_code WHERE e.batch_id='DEMO-20260720-PKG-V1' AND w.warning_code IS NULL
UNION ALL SELECT '绑定无场景版本',COUNT(*) FROM scene_rule_bindings b LEFT JOIN scene_versions s ON s.id=b.scene_version_id WHERE b.scene_version_id LIKE 'SV-SCENE-PROC-%' AND s.id IS NULL
UNION ALL SELECT '绑定无规则版本',COUNT(*) FROM scene_rule_bindings b LEFT JOIN rule_asset_versions r ON r.id=b.rule_version_id WHERE b.scene_version_id LIKE 'SV-SCENE-PROC-%' AND r.id IS NULL;

SELECT warning_code,case_id,title,risk_level,risk_score,status FROM risk_warnings WHERE batch_id='DEMO-20260720-PKG-V1' ORDER BY risk_score DESC,warning_code;
SELECT project_id,supplier_name,total_score,risk_score,rating,recommendation FROM bid_evaluation_scores WHERE batch_id='DEMO-20260720-PKG-V1' ORDER BY project_id,risk_score DESC;
SELECT business_id,business_type,amount,direction,business_time,source_account_id,target_account_id,mode_codes FROM trade_cycle_records WHERE batch_id='DEMO-20260720-PKG-V1' ORDER BY business_time,business_id;
