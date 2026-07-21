-- 创建隔离演示库；不会读取或覆盖 penetrative_supervision 业务库
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS `penetrative_supervision_demo` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `penetrative_supervision_demo`;
SELECT DATABASE() AS selected_database, '隔离演示库已就绪' AS message;
