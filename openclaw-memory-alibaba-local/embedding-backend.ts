import { spawn } from "node:child_process";
import OpenAI from "openai";
import { splitTextIntoEmbeddingChunks } from "./embed-chunks.js";
import type { EmbeddingConfig, EmbeddingConfigRemote } from "./config.js";
import { modelSupportsFlexDimensions } from "./config.js";

export type EmbeddingBackend = {
  readonly vectorDim: number;
  readonly maxToken: number;
  /** One request / one subprocess per chunk batch item; splits text using maxToken. */
  embedTexts(texts: string[]): Promise<number[][]>;
  encodeForStorage(fullText: string): Promise<{ chunks: string[]; vectors: number[][] }>;
};

const DEFAULT_LOCAL_PREFIX =
  "llama-embedding -m ~/.openclaw/embedding_model/embeddinggemma-300M-Q8_0.gguf --embd-output-format json ";

function expandTildeInCommandPrefix(prefix: string): string {
  const home = process.env.HOME || "";
  return prefix
    .replace(/～/g, "~")
    .replace(/(^|\s)~\//g, `$1${home}/`);
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

function parseLlamaEmbeddingStdout(stdout: string): number[] {
  const trimmed = stdout.trim();
  let jsonRaw = trimmed;
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonRaw = trimmed.slice(firstBrace, lastBrace + 1);
  }
  const parsed = JSON.parse(jsonRaw) as {
    data?: Array<{ embedding?: number[] }>;
    embedding?: number[];
  };
  const emb = parsed.data?.[0]?.embedding ?? parsed.embedding;
  if (!Array.isArray(emb) || emb.length === 0) {
    throw new Error("llama-embedding: could not parse embedding from stdout");
  }
  return emb.map((x) => Number(x));
}

function runLocalEmbed(commandPrefix: string, text: string): Promise<number[]> {
  const cmd = expandTildeInCommandPrefix(commandPrefix.trimEnd());
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", ["-c", cmd], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      err += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`llama-embedding exited ${code}: ${err.slice(-2000) || out.slice(-2000)}`));
        return;
      }
      try {
        resolve(parseLlamaEmbeddingStdout(out));
      } catch (e) {
        reject(new Error(`llama-embedding parse failed: ${String(e)}`));
      }
    });
    child.stdin?.write(text, "utf8");
    child.stdin?.end();
  });
}

export function createEmbeddingBackend(cfg: EmbeddingConfig): EmbeddingBackend {
  if (cfg.mode === "remote") {
    const remoteCfg = cfg;
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

  const commandPrefix = (cfg.commandPrefix?.trim() || DEFAULT_LOCAL_PREFIX).trimEnd() + " ";
  const maxToken = cfg.maxToken ?? 2048;
  const vectorDim = cfg.dimensions ?? 768;

  async function embedTextsLocal(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const t of texts) {
      out.push(await runLocalEmbed(commandPrefix, t));
    }
    return out;
  }

  return {
    vectorDim,
    maxToken,
    embedTexts: embedTextsLocal,
    async encodeForStorage(fullText: string) {
      const chunks = splitTextIntoEmbeddingChunks(fullText, maxToken);
      if (chunks.length === 0) {
        return { chunks: [], vectors: [] };
      }
      const vectors = await embedTextsLocal(chunks);
      return { chunks, vectors };
    },
  };
}
