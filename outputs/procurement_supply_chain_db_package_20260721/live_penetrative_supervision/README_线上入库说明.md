# 线上授权入库脚本

目标数据库：penetrative_supervision

安全调整：

- 不创建新数据库。
- 已有 SRC-ERP、SRC-OA、SRC-TREASURY 数据源使用 INSERT IGNORE，保留线上原配置。
- 语义映射唯一键冲突审计为0。
- 演示本体、图谱、场景、规则和运行记录ID冲突审计均为0。
- 执行前备份：../remote_preimport_backup.json。
