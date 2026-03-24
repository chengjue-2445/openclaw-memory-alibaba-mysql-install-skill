# openclaw-memory-alibaba-local — 对外 API 说明

本文档描述本插件向 **HTTP（管理端）** 与 **OpenClaw Agent 工具** 暴露的接口。网关实际主机与端口以部署为准（例如本地 `http://127.0.0.1:18789`），下文用 `{GATEWAY}` 表示网关根 URL。

---

## 一、HTTP — 记忆管理面板与 JSON API

**路由前缀**：`{GATEWAY}/plugins/memory`（`match: prefix`）

### 1.1 鉴权

| 路径 | 鉴权 |
|------|------|
| `GET /plugins/memory`（HTML 壳） | 无需 token |
| `/plugins/memory/api/*` | 若 `openclaw.json` 中配置了 `gateway.auth.token`，则 **必须** 满足其一：`?token=<token>`，或请求头 `Authorization: Bearer <token>` |
| 未配置 gateway token 时 | API 请求不校验 token（仅依赖网关其它策略） |

---

### 1.2 `GET /plugins/memory`

| 项目 | 说明 |
|------|------|
| **功能** | 返回记忆管理端单页 HTML（静态壳，前端再请求 JSON API）。 |
| **URI** | `{GATEWAY}/plugins/memory` |
| **查询参数** | 无 |
| **响应** | `200`，`Content-Type: text/html` |

---

### 1.3 `GET /plugins/memory/api/config`

| 项目 | 说明 |
|------|------|
| **功能** | 返回面板所需配置：是否开启全文/自进化、Tab 类别、中文标签、筛选项等。 |
| **URI** | `{GATEWAY}/plugins/memory/api/config` |
| **查询参数** | 无 |
| **响应** | `200` JSON：`enableFullContextMemory`、`enableSelfImprovingMemory`、`categoryLabelsZh`、`tabCategories`、`memoryTypeFilterOptions` |

---

### 1.4 `GET /plugins/memory/api/facets`

| 项目 | 说明 |
|------|------|
| **功能** | 返回当前库中出现过的不重复 `agentId`、`sessionId`（用于下拉框；不按类别过滤）。 |
| **URI** | `{GATEWAY}/plugins/memory/api/facets` |
| **查询参数** | 无 |
| **响应** | `200` JSON：`{ "agents": string[], "sessions": string[] }` |
| **错误** | `400`：`{ "error": string }`；`503`：数据库不可用 |

---

### 1.5 `GET /plugins/memory/api/dashboard`

| 项目 | 说明 |
|------|------|
| **功能** | 在指定时间范围与 Agent（及可选会话）下返回记忆大盘聚合统计。 |
| **URI** | `{GATEWAY}/plugins/memory/api/dashboard` |

| 参数 | 位置 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|------|----------------|--------|
| `timeFrom` | query | string | **是** | ISO 8601 时间字符串，须能被 `Date.parse` 解析 | 无 |
| `timeTo` | query | string | **是** | 同上 | 无 |
| `agentId` | query | string | **是** | 非空 trim 后字符串 | 无 |
| `sessionId` | query | string | 否 | 非空则只统计该会话；空表示不限会话 | 空（不限） |

| 响应 | 说明 |
|------|------|
| `200` | `MemoryDashboardAggregate`（`total`、`byKind`、`byCategory`、`topAgents` 等） |
| `400` | 缺少 `timeFrom`/`timeTo`、缺少 `agentId` 或其它业务错误 |

---

### 1.6 `GET /plugins/memory/api/list`

| 项目 | 说明 |
|------|------|
| **功能** | 分页列出记忆行（按 Tab 对应类别；全文 Tab 按 `batchId` 分组排序）。 |
| **URI** | `{GATEWAY}/plugins/memory/api/list` |

| 参数 | 位置 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|------|----------------|--------|
| `agentId` | query | string | **是** | 非空 | 无 |
| `tab` | query | string | 否 | `user` \| `self` \| `full`；决定基础类别集合 | `user` |
| `sessionId` | query | string | 否 | 过滤会话 | 空 |
| `timeFrom` | query | string | 否 | ISO 8601 | 不限 |
| `timeTo` | query | string | 否 | ISO 8601 | 不限 |
| `category` | query | string | 否 | 须为当前 Tab 下合法类别，且在 `adminPanelMemoryTypeOptions` 对应 Tab 的筛选项中 | 不过滤子类型 |
| `page` | query | number | 否 | 正整数 | `1` |
| `limit` | query | number | 否 | 每页条数，范围 `1`～`500` | `100` |
| `sortDesc` | query | string | 否 | 传 `false` 时部分 Tab 改为升序；否则降序 | 降序 |

| 响应 | 说明 |
|------|------|
| `200` | `{ items, total, page, pageSize }` |
| `400` | `agentId` 缺失、`category` 与 Tab/配置不匹配、匹配行数超过上限等 |
| 特例 | `tab` 对应功能关闭时可能返回空列表 `items: []` |

---

### 1.7 `POST /plugins/memory/api/delete`

| 项目 | 说明 |
|------|------|
| **功能** | 按行 id 批量硬删除（LanceDB `delete`）。 |
| **URI** | `{GATEWAY}/plugins/memory/api/delete` |
| **Content-Type** | `application/json` |
| **Body 上限** | 约 64KB |

**JSON Body**

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `items` | `array` | **是** | 至少 1 个元素 |
| `items[].agentId` | `string` | **是** | 非空 |
| `items[].id` | `string` | **是** | 行 UUID |

| 响应 | 说明 |
|------|------|
| `200` | `{ "deleted": number }` 实际删除条数 |
| `400` | JSON 非法或 `items` 为空 |

---

### 1.8 `POST /plugins/memory/api/add`

| 项目 | 说明 |
|------|------|
| **功能** | 管理端手工插入一条逻辑记忆（可多 chunk 向量行）。`user_memory_*` / `self_improving_*` 走 embedding；`full_context_*` 使用零向量占位、不调用 embedding。 |
| **URI** | `{GATEWAY}/plugins/memory/api/add` |
| **Content-Type** | `application/json` |
| **Body 上限** | 约 64KB |

**JSON Body**

| 字段 | 类型 | 必须 | 合法值 | 默认值 |
|------|------|------|--------|--------|
| `agentId` | `string` | **是** | 非空 trim | 无 |
| `text` | `string` | **是** | trim 后非空；超长按 **8000 字符**截断后写入 | 无 |
| `category` | `string` | **是** | 见下文「面板可写类别」 | 无 |

**面板可写类别**（随插件配置增减）：

- 始终允许：`user_memory_fact`、`user_memory_preference`、`user_memory_decision`
- `enableFullContextMemory === true`：`full_context_user`、`full_context_assistant`、`full_context_system`、`full_context_tool`、`full_context_tool_result`、`full_context_others`（**不含** `full_context_memory` 字面量于本接口）
- `enableSelfImprovingMemory === true`：`self_improving_learnings`、`self_improving_errors`、`self_improving_feature_requests`

写入行的 `sessionId` 固定为 `manual_insert`。

| 响应 | 说明 |
|------|------|
| `200` | `{ id, createdAt, chunkRows }`（`id` 为首个向量行 id） |
| `400` | 缺字段、类别非法、embedding 结果为空等 |
| `502` | embedding 调用失败 |
| `503` | 需要真实向量但插件未配置 embedding |

---

## 二、OpenClaw Agent 工具（非 HTTP URI）

由网关在对话中作为 **tool** 调用；**工具名**即下表「工具名」。参数为 JSON，具体以运行时 schema 为准。

### 2.1 前置条件

未配置 `embedding` + `dbPath` 等时，工具会返回 `not_configured`，不访问库。

---

### 2.2 `memory_recall`

| 项目 | 说明 |
|------|------|
| **功能** | 混合召回：`user_memory_*` +（若开启）`self_improving_*`；**向量**最多 21 条候选合并排序后保留，**BM25** 在剩余语料上最多再补 9 条（去重），**合计最多 30 条**。 |
| **工具名** | `memory_recall` |

| 参数 | 类型 | 必须 | 合法值 | 默认值 |
|------|------|------|--------|--------|
| `query` | `string` | **是** | 非空检索用语 | 无 |
| `limit` | `number` | 否 | 正整数；参与向量侧检索上限时会 **与 21 取 min**（每路 user/self） | **30**（代码常量 `RECALL_FINAL_MAX`） |

内部阈值（代码常量，非工具参数）：`RECALL_MIN_SCORE_RELAXED = 0.6`。

---

### 2.3 `memory_store`

| 项目 | 说明 |
|------|------|
| **功能** | 写入一条记忆；类别支持用户/全文/自进化（受配置开关约束）。全文类不向量化（零向量占位）。 |
| **工具名** | `memory_store` |

| 参数 | 类型 | 必须 | 合法值 | 默认值 |
|------|------|------|--------|--------|
| `text` | `string` | **是** | 待存储正文 | 无 |
| `importance` | `number` | 否 | 建议 `0`～`1` | `0.7` |
| `category` | `string` | 否 | 见枚举；未传为 `user_memory_fact` | `user_memory_fact` |

**`category` 枚举**（与配置联动；以运行时 TypeBox `enum` 为准）：

- 始终：`user_memory_fact`、`user_memory_preference`、`user_memory_decision`
- 开启全文：`full_context_user`、`full_context_assistant`、`full_context_system`、`full_context_tool`、`full_context_tool_result`、`full_context_others`（**不含** `full_context_memory` 字面量）
- 开启自进化：`self_improving_learnings`、`self_improving_errors`、`self_improving_feature_requests`

会话键来自上下文 `sessionId` / `sessionKey`（`resolveStorageSessionKey`）。

---

### 2.4 `memory_forget`

| 项目 | 说明 |
|------|------|
| **功能** | 按 `memoryId` 删一行；或按 `query` 向量检索候选，唯一且高分时按「同 agent + session + category + 正文」删齐；否则返回候选列表。 |
| **工具名** | `memory_forget` |

| 参数 | 类型 | 必须 | 合法值 | 默认值 |
|------|------|------|--------|--------|
| `memoryId` | `string` | 否 | UUID 行 id；与 `query` 二选一 | 无 |
| `query` | `string` | 否 | 检索语句；与 `memoryId` 二选一 | 无 |

**约束**：至少提供 `memoryId` 或 `query` 之一。

内部检索：`searchMerged` 最多取约 **30** 条候选，`minScore = 0.7`；仅当 **恰好 1 条** 且 `score > 0.9` 时自动删除。

检索类别：仅 `user_memory_*` 与（若开启）`self_improving_*`，不含 `full_context_*`。

---

## 三、插件内部服务（非 HTTP）

| 项目 | 说明 |
|------|------|
| **Service id** | `openclaw-memory-alibaba-local` |
| **功能** | `start` / `stop` 时打日志；`stop` 时关闭 LanceDB 连接。 |
| **对外 API** | 无额外 HTTP 或 RPC；仅供网关生命周期管理。 |

---

## 四、Hooks（行为说明，无独立 URI）

| Hook | 条件 | 行为摘要 |
|------|------|----------|
| `before_prompt_build` | `autoRecall === true` 且已配置 db+embedding，`prompt.length >= 5` | 对当前 prompt 做与 `memory_recall` 同源的混合召回，注入 `<relevant-memories>...</relevant-memories>` 前缀上下文 |
| `agent_end` | `autoCapture === true` 且成功、有 messages | 全文快照（可选）、用户记忆抽取、自进化抽取等 |

阈值常量：`RECALL_MIN_SCORE_HOOK = 0.6`（自动召回向量过滤）。

---

## 五、类别常量速查

| 常量值 | 含义 |
|--------|------|
| `user_memory_fact` | 用户事实 |
| `user_memory_preference` | 用户偏好 |
| `user_memory_decision` | 用户决策 |
| `full_context_memory` | 全文（遗留单类） |
| `full_context_user` / `assistant` / `system` / `tool` / `tool_result` / `others` | 全文按来源 |
| `self_improving_learnings` / `errors` / `feature_requests` | 自进化 |

---

*文档版本与源码一致；若升级插件请以仓库内 `web/memory-routes.ts`、`index.ts` 为准。*
