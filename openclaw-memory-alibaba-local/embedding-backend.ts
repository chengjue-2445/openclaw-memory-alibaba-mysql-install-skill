import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { splitTextIntoEmbeddingChunks } from "./embed-chunks.js";
import type { EmbeddingConfig, EmbeddingConfigLocal, EmbeddingConfigRemote } from "./config.js";
import { modelSupportsFlexDimensions } from "./config.js";

export type EmbeddingBackend = {
  readonly vectorDim: number;
  readonly maxToken: number;
  /** One logical batch; local backend serializes all calls onto one embedding context. */
  embedTexts(texts: string[]): Promise<number[][]>;
  encodeForStorage(fullText: string): Promise<{ chunks: string[]; vectors: number[][] }>;
};

const DEFAULT_LOCAL_GGUF = path.join(
  homedir(),
  ".openclaw",
  "embedding_model",
  "embeddinggemma-300M-Q8_0.gguf",
);

const DEFAULT_LOCAL_MAX_TOKEN = 2048;

function expandTildeModelPath(p: string): string {
  const home = homedir();
  return p
    .replace(/～/g, "~")
    .replace(/(^|[\s])~\//g, `$1${home}/`);
}

export function resolveEnvVarsForEmbedding(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar: string) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

function resolveLocalModelAbsolutePath(cfg: EmbeddingConfigLocal): string {
  const raw = cfg.modelPath?.trim()
    ? resolveEnvVarsForEmbedding(expandTildeModelPath(cfg.modelPath.trim()))
    : DEFAULT_LOCAL_GGUF;
  const abs = path.normalize(raw);
  if (!path.isAbsolute(abs)) {
    throw new Error(`embedding.modelPath must be an absolute path: "${raw}"`);
  }
  if (!fs.existsSync(abs)) {
    throw new Error(`embedding model file not found: ${abs}`);
  }
  return abs;
}

function assertRemoteReady(cfg: EmbeddingConfigRemote): void {
  const apiKey = (cfg.apiKey ?? "").trim();
  const model = (cfg.model ?? "").trim();
  const baseUrl = (cfg.baseUrl ?? "").trim();
  if (!apiKey) {
    throw new Error("embedding.apiKey is required when mode is remote");
  }
  if (!model) {
    throw new Error("embedding.model is required when mode is remote");
  }
  if (!baseUrl) {
    throw new Error("embedding.baseUrl is required when mode is remote");
  }
  if (typeof cfg.dimensions !== "number" || !Number.isFinite(cfg.dimensions) || cfg.dimensions <= 0) {
    throw new Error("embedding.dimensions must be a positive number when mode is remote");
  }
  if (typeof cfg.maxToken !== "number" || !Number.isFinite(cfg.maxToken) || cfg.maxToken <= 0) {
    throw new Error("embedding.maxToken must be a positive number when mode is remote");
  }
}

function buildRemoteBackend(remoteCfg: EmbeddingConfigRemote): EmbeddingBackend {
  const maxToken = remoteCfg.maxToken;
  const vectorDim = remoteCfg.dimensions;
  let client: OpenAI | null = null;
  const sendDimensions = modelSupportsFlexDimensions(remoteCfg.model);

  async function embedTexts(texts: string[]): Promise<number[][]> {
    assertRemoteReady(remoteCfg);
    if (!client) {
      client = new OpenAI({
        apiKey: resolveEnvVarsForEmbedding(remoteCfg.apiKey.trim()),
        baseURL: resolveEnvVarsForEmbedding(remoteCfg.baseUrl.trim()),
      });
    }
    const model = resolveEnvVarsForEmbedding(remoteCfg.model.trim());
    if (texts.length === 0) {
      return [];
    }
    const params: { model: string; input: string[]; dimensions?: number } = {
      model,
      input: texts,
    };
    if (sendDimensions && vectorDim > 0) {
      params.dimensions = vectorDim;
    }
    const response = await client.embeddings.create(params);
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const row = response.data[i];
      if (!row?.embedding) {
        throw new Error(`embedding API: missing vector at index ${i}`);
      }
      out.push(row.embedding.map((x) => Number(x)));
    }
    return out;
  }

  return {
    vectorDim,
    maxToken,
    embedTexts,
    async encodeForStorage(fullText: string) {
      const chunks = splitTextIntoEmbeddingChunks(fullText, maxToken);
      if (chunks.length === 0) {
        return { chunks: [], vectors: [] };
      }
      const vectors = await embedTexts(chunks);
      return { chunks, vectors };
    },
  };
}

async function buildLocalNodeLlamaBackend(cfg: EmbeddingConfigLocal): Promise<EmbeddingBackend> {
  // 动态 import：node-llama-cpp 的 dist/config.js 含顶层 await；OpenClaw 用 jiti 加载插件时
  // 静态 import 会把它拉进 eval 上下文并触发 ReferenceError: await is not defined。
  const { getLlama } = await import("node-llama-cpp");
  const modelPath = resolveLocalModelAbsolutePath(cfg);
  const maxToken =
    typeof cfg.maxToken === "number" && Number.isFinite(cfg.maxToken) && cfg.maxToken > 0
      ? Math.floor(cfg.maxToken)
      : DEFAULT_LOCAL_MAX_TOKEN;

  const llama = await getLlama({ gpu: false });
  const model = await llama.loadModel({
    modelPath,
    gpuLayers: 0,
  });

  const vectorDim = model.embeddingVectorSize;
  if (
    typeof cfg.dimensions === "number" &&
    Number.isFinite(cfg.dimensions) &&
    cfg.dimensions > 0 &&
    cfg.dimensions !== vectorDim
  ) {
    console.warn(
      `[openclaw-memory-alibaba-local] embedding.dimensions=${cfg.dimensions} != model embeddingVectorSize=${vectorDim}; using ${vectorDim}. Wrong dimensions in config may confuse operators.`,
    );
  }

  const contextTokens = Math.min(
    model.trainContextSize,
    Math.max(256, Math.floor(maxToken * 3)),
  );
  const embeddingContext = await model.createEmbeddingContext({
    contextSize: contextTokens,
  });

  let serial: Promise<unknown> = Promise.resolve();
  function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = serial.then(fn, fn);
    serial = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async function embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    return runExclusive(async () => {
      const out: number[][] = [];
      for (const t of texts) {
        const emb = await embeddingContext.getEmbeddingFor(t);
        out.push([...emb.vector].map((x) => Number(x)));
      }
      return out;
    });
  }

  return {
    vectorDim,
    maxToken,
    embedTexts,
    async encodeForStorage(fullText: string) {
      const chunks = splitTextIntoEmbeddingChunks(fullText, maxToken);
      if (chunks.length === 0) {
        return { chunks: [], vectors: [] };
      }
      const vectors = await embedTexts(chunks);
      return { chunks, vectors };
    },
  };
}

export async function createEmbeddingBackend(cfg: EmbeddingConfig): Promise<EmbeddingBackend> {
  if (cfg.mode === "remote") {
    return buildRemoteBackend(cfg);
  }
  return buildLocalNodeLlamaBackend(cfg);
}
