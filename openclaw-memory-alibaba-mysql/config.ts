import type { MemoryCategory } from "./categories.js";
import { ALL_CATEGORIES, USER_MEMORY_FACT } from "./categories.js";

export type MysqlConnectionConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

export type EmbeddingConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  dimensions?: number;
};

export type LLMConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type MemoryConfig = {
  /** Omitted when plugin is loaded without DB config (e.g. npm install); required at runtime for memory ops. */
  mysql?: MysqlConnectionConfig;
  /** Omitted when plugin is loaded without DB config; required at runtime for memory ops. */
  embedding?: EmbeddingConfig;
  /** When true, use LLM to decide insert vs update among top-10 similar memories; requires llm config. Default false. */
  memory_duplication_conflict_process: boolean;
  /** Required when memory_duplication_conflict_process is true. */
  llm?: LLMConfig;
  /** Similarity threshold for user_memory_* (0–1). Default 0.95. */
  similarityThresholdUserMemory: number;
  /** Similarity threshold for self_improving_* (0–1). Default 0.92. */
  similarityThresholdSelfImproving: number;
  /** When false, full_context_memory is not written or recalled. Default false. */
  enableFullContextMemory: boolean;
  /** When false, self_improving_* is not written or recalled. Default false. */
  enableSelfImprovingMemory: boolean;
  /** How to extract user and self_improving memories in auto-capture: "llm" (default) or "regex". Case-insensitive; invalid values fall back to "llm". When "llm", llm config is required. */
  memoryExtractionMethod: "regex" | "llm";
  autoRecall: boolean;
  autoCapture: boolean;
  captureMaxChars: number;
  /** When true, apply time decay to recall scores (older = lower effective score). Default false. Other decay params use built-in defaults (30 days half-life, exponential). */
  enableMemoryDecay: boolean;
  /** @internal Half-life in days; always 30 when enableMemoryDecay is true. Not configurable. */
  memoryDecayHalfLifeDays: number;
  /** @internal Decay curve; always "exponential". Not configurable. */
  memoryDecayStrategy: "exponential" | "linear" | "none";
  tableName: string;
};

/** Re-export for tools and DB (user_memory_* + full_context + self_improving_*) */
export { ALL_CATEGORIES, USER_MEMORY_FACT };
export type { MemoryCategory };

const DEFAULT_MODEL = "text-embedding-v3";
const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_TABLE_NAME = "openclaw_memories";
export const DEFAULT_CAPTURE_MAX_CHARS = 50000;

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-v3": 1024,
  "text-embedding-v2": 1536,
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  "embed-english-v3.0": 1024,
  "embed-multilingual-v3.0": 1024,
  "embed-english-light-v3.0": 384,
  "embed-multilingual-light-v3.0": 384,
  "jina-embeddings-v3": 1024,
  "jina-embeddings-v2-base-en": 768,
  "jina-embeddings-v2-base-zh": 768,
  "bge-large-zh-v1.5": 1024,
  "bge-large-en-v1.5": 1024,
  "bge-m3": 1024,
  "nomic-embed-text": 768,
  "text-embedding-004": 768,
};

const FLEX_DIMS_MODELS = new Set([
  "text-embedding-v3",
  "text-embedding-3-small",
  "text-embedding-3-large",
  "jina-embeddings-v3",
]);

export function vectorDimsForModel(model: string, explicit?: number): number {
  if (explicit && explicit > 0) return explicit;
  return EMBEDDING_DIMENSIONS[model] ?? 1024;
}

export function modelSupportsFlexDimensions(model: string): boolean {
  return FLEX_DIMS_MODELS.has(model);
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
  }
}

function requireString(obj: Record<string, unknown>, key: string, label: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${label}.${key} is required and must be a non-empty string`);
  }
  return v;
}

function parseMysqlConfig(raw: unknown): MysqlConnectionConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("mysql config is required");
  }
  const m = raw as Record<string, unknown>;
  assertAllowedKeys(m, ["host", "port", "user", "password", "database", "ssl"], "mysql");

  return {
    host: requireString(m, "host", "mysql"),
    port: typeof m.port === "number" ? m.port : 3306,
    user: requireString(m, "user", "mysql"),
    password: resolveEnvVars(requireString(m, "password", "mysql")),
    database: requireString(m, "database", "mysql"),
    ssl: m.ssl === true,
  };
}

function parseEmbeddingConfig(raw: unknown): EmbeddingConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("embedding config is required");
  }
  const e = raw as Record<string, unknown>;
  assertAllowedKeys(e, ["apiKey", "model", "baseUrl", "dimensions"], "embedding");

  const model = typeof e.model === "string" ? e.model : DEFAULT_MODEL;
  const explicitDims = typeof e.dimensions === "number" ? e.dimensions : undefined;

  return {
    apiKey: resolveEnvVars(requireString(e, "apiKey", "embedding")),
    model,
    baseUrl: typeof e.baseUrl === "string" ? resolveEnvVars(e.baseUrl) : DEFAULT_BASE_URL,
    dimensions: explicitDims,
  };
}

const DEFAULT_LLM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

function parseLLMConfig(raw: unknown): LLMConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("llm config is required when memory_duplication_conflict_process is true");
  }
  const l = raw as Record<string, unknown>;
  assertAllowedKeys(l, ["apiKey", "model", "baseUrl"], "llm");
  return {
    apiKey: resolveEnvVars(requireString(l, "apiKey", "llm")),
    model: requireString(l, "model", "llm"),
    baseUrl: typeof l.baseUrl === "string" ? resolveEnvVars(l.baseUrl) : DEFAULT_LLM_BASE_URL,
  };
}

export const memoryConfigSchema = {
  parse(value: unknown): MemoryConfig {
    // Allow empty config during plugin registration
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      value = {};
    }
    const cfg = value as Record<string, unknown>;

    // --- Allowed keys ---
    assertAllowedKeys(
      cfg,
      [
        "mysql",
        "embedding",
        "memory_duplication_conflict_process",
        "llm",
        "similarityThresholdUserMemory",
        "similarityThresholdSelfImproving",
        "enableFullContextMemory",
        "enableSelfImprovingMemory",
        "memoryExtractionMethod",
        "autoRecall",
        "autoCapture",
        "captureMaxChars",
        "enableMemoryDecay",
        "memoryDecayHalfLifeDays",
        "memoryDecayStrategy",
        "tableName",
      ],
      "memory config",
    );

    // --- When DB config is missing, return minimal config without throwing (e.g. npm install) ---
    if (!cfg.mysql || typeof cfg.mysql !== "object" || Array.isArray(cfg.mysql) ||
        !cfg.embedding || typeof cfg.embedding !== "object" || Array.isArray(cfg.embedding)) {
      const tableName =
        typeof cfg.tableName === "string" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cfg.tableName)
          ? cfg.tableName
          : DEFAULT_TABLE_NAME;
      const capChars =
        typeof cfg.captureMaxChars === "number" && cfg.captureMaxChars >= 100 && cfg.captureMaxChars <= 100_000
          ? Math.floor(cfg.captureMaxChars)
          : DEFAULT_CAPTURE_MAX_CHARS;
      return {
        mysql: undefined,
        embedding: undefined,
        memory_duplication_conflict_process: false,
        llm: undefined,
        similarityThresholdUserMemory: 0.65,
        similarityThresholdSelfImproving: 0.62,
        enableFullContextMemory: false,
        enableSelfImprovingMemory: false,
        memoryExtractionMethod: "llm",
        autoRecall: cfg.autoRecall !== false,
        autoCapture: cfg.autoCapture !== false,
        captureMaxChars: capChars,
        enableMemoryDecay: false,
        memoryDecayHalfLifeDays: 30,
        memoryDecayStrategy: "exponential",
        tableName,
      };
    }

    // --- LLM requirement ---
    const memory_duplication_conflict_process = cfg.memory_duplication_conflict_process === true;
    const rawMethod =
      typeof cfg.memoryExtractionMethod === "string"
        ? cfg.memoryExtractionMethod.trim().toLowerCase()
        : "";
    const memoryExtractionMethod: "regex" | "llm" =
      rawMethod === "regex" ? "regex" : "llm";
    const needsLlm = memory_duplication_conflict_process || memoryExtractionMethod === "llm";
    if (needsLlm && (!cfg.llm || typeof cfg.llm !== "object")) {
      throw new Error(
        "llm config is required when memory_duplication_conflict_process is true or memoryExtractionMethod is \"llm\"",
      );
    }

    // --- Thresholds and feature flags ---
    const similarityThresholdUserMemory =
      typeof cfg.similarityThresholdUserMemory === "number"
        ? cfg.similarityThresholdUserMemory
        : 0.65;
    const similarityThresholdSelfImproving =
      typeof cfg.similarityThresholdSelfImproving === "number"
        ? cfg.similarityThresholdSelfImproving
        : 0.62;
    if (
      similarityThresholdUserMemory < 0 ||
      similarityThresholdUserMemory > 1 ||
      similarityThresholdSelfImproving < 0 ||
      similarityThresholdSelfImproving > 1
    ) {
      throw new Error("similarityThresholdUserMemory and similarityThresholdSelfImproving must be between 0 and 1");
    }

    const enableFullContextMemory = cfg.enableFullContextMemory === true;
    const enableSelfImprovingMemory = cfg.enableSelfImprovingMemory === true;

    const captureMaxChars =
      typeof cfg.captureMaxChars === "number" ? Math.floor(cfg.captureMaxChars) : undefined;
    if (typeof captureMaxChars === "number" && (captureMaxChars < 100 || captureMaxChars > 100_000)) {
      throw new Error("captureMaxChars must be between 100 and 100000");
    }

    // --- Memory decay: only enableMemoryDecay is configurable; half-life and strategy use defaults ---
    const enableMemoryDecay = cfg.enableMemoryDecay === true;
    const memoryDecayHalfLifeDays = 30;
    const memoryDecayStrategy: "exponential" | "linear" | "none" = "exponential";

    // --- Table name and final object ---
    const tableName = typeof cfg.tableName === "string" ? cfg.tableName : DEFAULT_TABLE_NAME;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error(
        `Invalid tableName "${tableName}": must contain only alphanumeric characters and underscores`,
      );
    }

    return {
      mysql: parseMysqlConfig(cfg.mysql),
      embedding: parseEmbeddingConfig(cfg.embedding),
      memory_duplication_conflict_process,
      llm: needsLlm ? parseLLMConfig(cfg.llm) : undefined,
      similarityThresholdUserMemory,
      similarityThresholdSelfImproving,
      enableFullContextMemory,
      enableSelfImprovingMemory,
      memoryExtractionMethod,
      autoRecall: cfg.autoRecall !== false,
      autoCapture: cfg.autoCapture !== false,
      captureMaxChars: captureMaxChars ?? DEFAULT_CAPTURE_MAX_CHARS,
      enableMemoryDecay,
      memoryDecayHalfLifeDays,
      memoryDecayStrategy,
      tableName,
    };
  },
};
