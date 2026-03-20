# 本 Skill 使用的阿里云 RDS API（全部通过 SDK）

安装脚本 **不依赖 rds-openapi-skill**，全部通过 **alibabacloud_rds20140815** SDK 调用以下 RDS OpenAPI：

| 步骤 | API / 方法 | 说明 |
|------|------------|------|
| 创建实例 | CreateDBInstance | MySQL 8.0、按量付费、Basic、VPC |
| 轮询状态 | DescribeDBInstanceAttribute | 直至 DBInstanceStatus == Running |
| 开启向量 | ModifyDBInstanceVectorSupportStatus | Status=ON（若 SDK 支持） |
| 创建数据库 | CreateDatabase | 库名 openclaw_memory，字符集 utf8mb4 |
| 创建账号 | CreateAccount | 账号 openclaw_memory，随机 8 位密码 |
| 授权 | GrantAccountPrivilege | 对库 openclaw_memory 授予 ReadWrite |
| 白名单 | ModifySecurityIps | 仅本机公网 IP |
| 连接地址 | DescribeDBInstanceAttribute / DescribeDBInstanceNetInfo | 取 ConnectionString 写 MYSQL_HOST |

依赖包见 `requirements.txt`：alibabacloud-rds20140815、alibabacloud_tea_openapi。
