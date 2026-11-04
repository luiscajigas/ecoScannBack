// @ts-check
const { parseResult } = require('./common');

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.8-flash';
// If a model is overloaded, the next one is tried; the lite model usually has less demand.
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const TIMEOUT_MS = 10000;
// Switching models does not fix these errors: the problem is the key or the request.
const FINAL_STATUSES = [400, 401, 403];

/**
 * @typedef {import('./common').ClassificationRequest} ClassificationRequest
 * @typedef {import('./common').AiProvider} AiProvider
 */

/**
 * @param {ClassificationRequest} request
 */
function buildBody({ image, instruction, keys }) {
  return {
    contents: [
      {
        parts: [
          { text: instruction },
          { inline_data: { mime_type: image.mimeType, data: image.data } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING', enum: keys },
          confidence: { type: 'NUMBER' }
        },
        required: ['category', 'confidence']
      }
    }
  };
}

/** @param {Response} response */
async function createResponseError(response) {
  const body = await response.json().catch(() => null);
  const detail = body?.error?.message || '';
  const error = new Error(`Gemini responded ${response.status}${detail ? `: ${detail.slice(0, 300)}` : '.'}`);
  return Object.assign(error, { isFinal: FINAL_STATUSES.includes(response.status) });
}

/**
 * @param {{ apiKey: string, model?: string }} options
 * @returns {AiProvider}
 */
function createGeminiProvider({ apiKey, model = DEFAULT_MODEL }) {
  const models = [...new Set([model, ...FALLBACK_MODELS])];

  /**
   * @param {string} modelName
   * @param {ClassificationRequest} request
   */
  async function query(modelName, request) {
    const response = await fetch(`${BASE_URL}/${encodeURIComponent(modelName)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(buildBody(request)),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) throw await createResponseError(response);

    const json = await response.json();
    return parseResult(json?.candidates?.[0]?.content?.parts?.[0]?.text, request.keys);
  }

  return {
    name: 'Gemini',
    async classify(request) {
      /** @type {unknown} */
      let lastError;
      for (const modelName of models) {
        try {
          return await query(modelName, request);
        } catch (err) {
          lastError = err;
          console.warn(`Gemini ${modelName} failed: ${/** @type {Error} */ (err).message}`);
          if (/** @type {{ isFinal?: boolean }} */ (err).isFinal) break;
        }
      }
      throw lastError;
    }
  };
}

module.exports = { createGeminiProvider };
