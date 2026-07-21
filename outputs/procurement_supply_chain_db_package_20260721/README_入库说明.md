# 采购与供应链穿透式监管演示数据入库包

生成日期：2026-07-21  
源文件：采购与供应链穿透式监管演示数据_案例包完善版_20260720.xlsx  
演示批次：DEMO-20260720-PKG-V1

## 安全说明

- 当前项目的 .env.local 指向非本机 MySQL 地址，本次生成过程没有连接或写入该数据库。
- SQL 固定使用隔离数据库 `penetrative_supervision_demo`，不会使用 `penetrative_supervision`。
- 如需更换测试库名称，请统一替换全部 SQL 中的 `penetrative_supervision_demo`，不要直接改为正式库名称。

## 执行顺序

1. 00_create_demo_database.sql：创建隔离演示库。
2. 01_schema_compat.sql：创建项目兼容表和案例扩展表。
3. 02_master_graph_data.sql：导入本体、数据源映射、图谱版本、节点、关系和事件。
4. 03_risk_case_data.sql：导入风险场景、规则、执行、预警、证据、智能评标和循环贸易明细。
5. 04_validation.sql：核验数据量、关系端点、本体编码和场景规则引用。
6. 05_rollback.sql：仅回滚 DEMO-20260720-PKG-V1 演示批次。

推荐命令示例：

`mysql -h 127.0.0.1 -u root -p < 00_create_demo_database.sql`

其余文件按编号依次执行。执行前请确认连接地址是本地或经批准的测试数据库。

## 数据规模

- ontology_elements: 182
- data_sources: 12
- semantic_mappings: 25
- graph_versions: 1
- graph_entities: 171
- graph_relations: 249
- graph_events: 69
- risk_scenes: 7
- rule_assets: 14
- scene_rule_bindings: 14
- rule_run_records: 18
- risk_warnings: 7
- risk_evidence: 33
- bid_evaluation_scores: 6
- trade_cycle_records: 8

## 与当前项目的兼容策略

- 复用：ontologies、ontology_elements、data_sources、semantic_mappings、graph_versions、risk_scenes、scene_versions、rule_assets、rule_asset_versions、scene_rule_bindings、rule_run_records。
- 新增：demo_import_batches、graph_entities、graph_relations、graph_events、risk_warnings、risk_evidence、bid_evaluation_scores、trade_cycle_records。
- 规则运行表没有案例ID、风险等级和实际值摘要独立列，本包将这些字段封装在 evidence_json 中，保持现有接口结构不变。

## 下一步

- 在本地或测试MySQL执行脚本并保存04_validation.sql结果。
- 为新增实例表补充只读查询API，再接入演示页面。
- 业务方确认正式制度名称、条款号和预警处置口径后，才生成正式库版本。
