/**
 * Google Gemini API Client
 * Replaces Anthropic Claude client.
 * Uses @google/generative-ai SDK with gemini-1.5-flash model.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

// Default Gemini model — flash is fast and cheap; swap to gemini-1.5-pro for higher quality
const GEMINI_MODEL = 'gemini-2.0-flash';

export function createClient(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

/**
 * Call Gemini with a system prompt + user prompt.
 * Gemini doesn't have a native system role in generateContent,
 * so we prepend the system instructions to the user turn.
 */
export async function callGemini(model, systemPrompt, userPrompt, maxTokens = 2000) {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2,       // Low temperature for consistent JSON output
      topP: 0.8,
      topK: 40,
    }
  });

  const response = result.response;
  return response.text();
}

/**
 * Safely parse JSON from Gemini response.
 * Strips markdown fences, extracts first JSON object/array found.
 */
export function parseJSON(text) {
  // Strip markdown code fences
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // Extract first {...} block
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (_) {}
  }

  // Extract first [...] block
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch (_) {}
  }

  // Last resort: try to fix common Gemini JSON quirks (trailing commas)
  const fixed = cleaned
    .replace(/,\s*([}\]])/g, '$1')   // trailing commas
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":'); // unquoted keys
  try {
    return JSON.parse(fixed);
  } catch (e) {
    throw new Error(`Failed to parse Gemini JSON response: ${e.message}\nRaw: ${text.substring(0, 300)}`);
  }
}
