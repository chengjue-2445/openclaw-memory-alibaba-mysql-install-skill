/**
 * Prompt templates for LLM-based memory extraction (memoryExtractionMethod: "llm").
 * Aligned with Mem0-style extraction instructions.
 * @see https://github.com/mem0ai/mem0/blob/main/openclaw/index.ts
 */

/** Instruction block for extracting user memories from conversation messages. */
export const USER_MEMORY_EXTRACTION_INSTRUCTIONS = `Your Task: Extract and maintain a structured, evolving profile of the user from their conversations with an AI assistant. Capture information that would help the assistant provide personalized, context-aware responses in future interactions.

Information to Extract (map each to exactly one category):

1. user_memory_fact — Identity, context, and verifiable facts:
   - Name, age, location, timezone, language preferences
   - Occupation, employer, job role, industry, education
   - Tech stack, tools, development environment, skill level
   - Names and roles of people they mention (colleagues, family, friends)
   - Current projects (name, description, status)
   - Significant life events, milestones, upcoming plans

2. user_memory_preference — Preferences and opinions:
   - Communication style (formal/casual, verbose/concise)
   - Tool and technology preferences (languages, frameworks, editors, OS)
   - Content preferences, learning style, likes and dislikes
   - Strong opinions or values they've expressed
   - Work patterns, routines, how they organize work

3. user_memory_decision — Decisions and commitments:
   - Important decisions made and their reasoning
   - Short-term and long-term goals, deadlines, milestones
   - Lessons learned, strategies that worked or failed
   - Changed opinions or updated beliefs
   - Commitments or promises (by user or assistant to the user)

Guidelines:
- Store memories as clear, self-contained statements. Each memory should make sense on its own.
- Use third person: "User prefers...", "User is working on...", not "I prefer...".
- Include temporal context when relevant: "As of [date], user is working on...".
- When information updates, prefer updating the existing memory rather than creating duplicates.
- Preserve specificity: "User uses Next.js 14 with App Router" is better than "User uses React".
- Capture the WHY behind preferences when stated: "User prefers Vim because of keyboard-driven workflow".

Exclude:
- Passwords, API keys, tokens, or any authentication credentials
- Exact financial amounts (unless the user explicitly asks to remember them)
- Temporary or ephemeral information (one-time questions, debugging with no lasting insight)
- Generic small talk with no informational content
- Raw code snippets (capture the intent or decision, not the code itself)
- Information the user explicitly asks not to remember

Importance (required for each extraction):
- You MUST assign an importance score between 0 and 1 to each memory.
- 0 = trivial, easily forgotten (e.g. minor preference, one-off mention).
- 0.5 = moderate (e.g. typical fact or preference the assistant should know).
- 1 = critical (e.g. identity, strong preference, commitment, safety-related, explicit "remember this").
- Use decimals as needed (e.g. 0.3, 0.7, 0.9). Do not omit this field.`;

/** Suffix that defines the required JSON output format and precedes the user messages. */
export const USER_MEMORY_EXTRACTION_FORMAT = `

Reply with ONLY a single JSON object, no other text or markdown. Use this exact structure:
{"extractions":[{"category":"user_memory_fact"|"user_memory_preference"|"user_memory_decision","text":"one clear third-person statement","importance":0.0 to 1.0}]}
Every extraction MUST include "importance" (number 0–1). If nothing to remember, return: {"extractions":[]}

User messages (extract from these):
`;

/** Full prompt body (instructions + format). Caller appends the actual user messages. */
export function buildUserMemoryExtractionPrompt(): string {
  return USER_MEMORY_EXTRACTION_INSTRUCTIONS + USER_MEMORY_EXTRACTION_FORMAT;
}

/** Instructions for extracting self-improving items (learnings, errors, feature requests) from assistant/user dialogue. */
export const SELF_IMPROVING_EXTRACTION_INSTRUCTIONS = `Your Task: From a conversation between user and assistant, extract self-improving memory items the assistant (or system) should remember for future behavior.

Categories (map each to exactly one):

1. self_improving_learnings — Lessons, corrections, or best practices that emerged:
   - "上线前必须重启服务使新代码生效"
   - "User prefers to be addressed by first name"
   - Technical or process learnings from the dialogue

2. self_improving_errors — Mistakes, failures, or things to avoid:
   - Errors the user or assistant encountered and how they were resolved
   - "Do not assume X; always check Y first"

3. self_improving_feature_requests — User or assistant requests for future behavior:
   - "Remember to always confirm before deleting"
   - Feature or workflow requests the user stated

Guidelines:
- Extract only clear, actionable items. One short sentence per item.
- Prefer the language of the conversation (Chinese or English).
- If nothing fits any category, return empty extractions.

Exclude:
- Passwords, API keys, tokens, or any authentication credentials
- Exact financial amounts or sensitive personal data
- One-off debugging logs or temporary error messages with no lasting lesson
- Generic small talk or greetings with no actionable insight
- Raw code snippets (capture the intent or rule, not the code itself)
- Information the user or assistant explicitly asks not to remember
- Injected template text (e.g. <relevant-memories>, <knowledge-context> labels) or metadata

Importance (required for each extraction):
- You MUST assign an importance score between 0 and 1 to each memory.
- 0 = trivial, one-off tip with little impact on future behavior.
- 0.5 = moderate (e.g. typical process lesson or preference the assistant should follow).
- 1 = critical (e.g. safety-related rule, explicit "always/never" from user, recurring error pattern).
- Use decimals as needed (e.g. 0.3, 0.7, 0.9). Do not omit this field.

Reply with ONLY a single JSON object, no other text or markdown:
{"extractions":[{"category":"self_improving_learnings"|"self_improving_errors"|"self_improving_feature_requests","text":"one short statement","importance":0.0 to 1.0}]}
Every extraction MUST include "importance" (number 0–1). If nothing to extract, return: {"extractions":[]}

Conversation (extract from this):
`;
