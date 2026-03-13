/**
 * geminiClient.js
 * Core Gemini 2.5 Flash API wrapper.
 * Used exclusively by the PCAM Task Aggregator — agents never call this directly.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = 'gemini-2.5-flash';

export function createClient(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: MODEL });
}

export async function callGemini(model, prompt, maxTokens = 8000) {
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.1,
      topP: 0.85,
      topK: 40,
    }
  });
  return result.response.text();
}

export function parseJSON(text) {
  let cleaned = text
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();

  try { return JSON.parse(cleaned); } catch (_) {}

  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const extracted = cleaned.substring(start, end + 1);
    try { return JSON.parse(extracted); } catch (_) {}
    try { return JSON.parse(fixTruncated(extracted)); } catch (_) {}
  }

  const patched = cleaned
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  try { return JSON.parse(patched); } catch (_) {}

  throw new Error(`JSON parse failed. Raw (first 400): ${text.substring(0, 400)}`);
}

function fixTruncated(str) {
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (esc)                   { esc = false; continue; }
    if (c === '\\' && inStr)   { esc = true;  continue; }
    if (c === '"')             { inStr = !inStr; continue; }
    if (inStr)                 continue;
    if      (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let out = str;
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, '');
  return out + stack.reverse().join('');
}