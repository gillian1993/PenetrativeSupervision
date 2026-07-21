# 线上 MySQL 入库完成说明

完成时间：2026-07-20T16:49:34.618Z  
独立复核时间：2026-07-20T16:50:50.709Z  
目标：47.94.226.107:3306 / penetrative_supervision  
批次：DEMO-20260720-PKG-V1

## 结果

- 已创建 8 张扩展表：demo_import_batches、graph_entities、graph_relations、graph_events、risk_warnings、risk_evidence、bid_evaluation_scores、trade_cycle_records。
- 已写入 182 个本体元素、171 个图谱节点、249 条关系、69 个事件。
- 已写入 7 个风险场景、14 个规则、14 个绑定、18 条运行记录、7 条预警和 33 条证据。
- 已写入 6 条智能评标结果和 8 条循环贸易明细。
- 线上原有 SRC-ERP、SRC-OA、SRC-TREASURY 配置未被覆盖。
- 数量校验全部通过；孤立关系、孤立事件、无预警证据和评分计算异常均为 0。

## 审计说明

首次执行在校验阶段发现“场景ID校验清单”错误，程序自动运行回滚；随后独立确认演示数据为0，仅保留已授权创建的空扩展表。修正校验清单后重新执行并成功，相关记录保存在 remote_import_first_attempt_automatic_rollback.json。

## 主要文件

- 采购与供应链演示数据_入库映射与验收清单_20260721.xlsx：字段映射、数量验收、线上结果。
- remote_preimport_backup.json：入库前相关表结构、数据源及映射备份。
- remote_import_result.json：正式入库结果。
- remote_post_import_verification.json：独立连接持久化复核。
- live_penetrative_supervision/05_rollback_live.sql：线上演示批次回滚脚本。

## 后续建议

下一步为 graph_entities、risk_warnings、bid_evaluation_scores 和 trade_cycle_records 增加只读查询 API，并将页面切换到数据库真实数据。
