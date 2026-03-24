/**
 * Memory category constants.
 * user_memory is subdivided into fact / preference / decision for storage and recall.
 */

/** User memory sub-categories (user-side facts, preferences, decisions) */
export const USER_MEMORY_FACT = "user_memory_fact" as const;
export const USER_MEMORY_PREFERENCE = "user_memory_preference" as const;
export const USER_MEMORY_DECISION = "user_memory_decision" as const;

/** All user memory category values (for recall: treat as one logical "user_memory" set) */
export const USER_MEMORY_CATEGORIES = [
  USER_MEMORY_FACT,
  USER_MEMORY_PREFERENCE,
  USER_MEMORY_DECISION,
] as const;

export type UserMemoryCategory =
  | typeof USER_MEMORY_FACT
  | typeof USER_MEMORY_PREFERENCE
  | typeof USER_MEMORY_DECISION;

/** Full context (conversation audit). Legacy single category. */
export const FULL_CONTEXT_MEMORY = "full_context_memory" as const;

/** Full context by source (user / assistant / system / tool / tool_result / others) */
export const FULL_CONTEXT_USER = "full_context_user" as const;
export const FULL_CONTEXT_ASSISTANT = "full_context_assistant" as const;
export const FULL_CONTEXT_SYSTEM = "full_context_system" as const;
export const FULL_CONTEXT_TOOL = "full_context_tool" as const;
export const FULL_CONTEXT_TOOL_RESULT = "full_context_tool_result" as const;
export const FULL_CONTEXT_OTHERS = "full_context_others" as const;

export const FULL_CONTEXT_SOURCE_CATEGORIES = [
  FULL_CONTEXT_USER,
  FULL_CONTEXT_ASSISTANT,
  FULL_CONTEXT_SYSTEM,
  FULL_CONTEXT_TOOL,
  FULL_CONTEXT_TOOL_RESULT,
  FULL_CONTEXT_OTHERS,
] as const;

export type FullContextSourceCategory = (typeof FULL_CONTEXT_SOURCE_CATEGORIES)[number];

export function isFullContextSourceCategory(cat: string): cat is FullContextSourceCategory {
  return FULL_CONTEXT_SOURCE_CATEGORIES.includes(cat as FullContextSourceCategory);
}

/** Self-improving memory sub-categories */
export const SELF_IMPROVING_LEARNINGS = "self_improving_learnings" as const;
export const SELF_IMPROVING_ERRORS = "self_improving_errors" as const;
export const SELF_IMPROVING_FEATURE_REQUESTS = "self_improving_feature_requests" as const;

export const SELF_IMPROVING_CATEGORIES = [
  SELF_IMPROVING_LEARNINGS,
  SELF_IMPROVING_ERRORS,
  SELF_IMPROVING_FEATURE_REQUESTS,
] as const;

export type SelfImprovingCategory = (typeof SELF_IMPROVING_CATEGORIES)[number];

/** All allowed category values */
export type MemoryCategory =
  | UserMemoryCategory
  | typeof FULL_CONTEXT_MEMORY
  | FullContextSourceCategory
  | SelfImprovingCategory;

export const ALL_CATEGORIES: readonly MemoryCategory[] = [
  ...USER_MEMORY_CATEGORIES,
  FULL_CONTEXT_MEMORY,
  ...FULL_CONTEXT_SOURCE_CATEGORIES,
  ...SELF_IMPROVING_CATEGORIES,
];

export function isUserMemoryCategory(cat: string): cat is UserMemoryCategory {
  return USER_MEMORY_CATEGORIES.includes(cat as UserMemoryCategory);
}

export function isSelfImprovingCategory(cat: string): cat is SelfImprovingCategory {
  return SELF_IMPROVING_CATEGORIES.includes(cat as SelfImprovingCategory);
}

/** Session id for rows inserted from the admin UI (manual add). */
export const MANUAL_INSERT_SESSION = "manual_insert" as const;

/** Chinese labels for admin UI and APIs (fixed mapping). */
export const MEMORY_CATEGORY_LABEL_ZH: Readonly<Record<MemoryCategory, string>> = {
  [USER_MEMORY_FACT]: "用户事实",
  [USER_MEMORY_PREFERENCE]: "用户偏好",
  [USER_MEMORY_DECISION]: "用户决策",
  [FULL_CONTEXT_MEMORY]: "全文记忆",
  [FULL_CONTEXT_USER]: "全文 · 用户消息",
  [FULL_CONTEXT_ASSISTANT]: "全文 · AI助手消息",
  [FULL_CONTEXT_SYSTEM]: "全文 · 系统消息",
  [FULL_CONTEXT_TOOL]: "全文 · 工具调用",
  [FULL_CONTEXT_TOOL_RESULT]: "全文 · 工具结果",
  [FULL_CONTEXT_OTHERS]: "全文 · 其他消息",
  [SELF_IMPROVING_LEARNINGS]: "最佳实践",
  [SELF_IMPROVING_ERRORS]: "错误经验",
  [SELF_IMPROVING_FEATURE_REQUESTS]: "行为诉求",
};

export function categoryLabelZh(category: string): string {
  return MEMORY_CATEGORY_LABEL_ZH[category as MemoryCategory] ?? category;
}
