// @ts-check

/**
 * @typedef {import('../types/contract').components['schemas']['Category']} Category
 * @typedef {import('../types/contract').components['schemas']['CategoryKey']} CategoryKey
 */

/**
 * @typedef {object} Image
 * @property {string} mimeType
 * @property {string} data
 *
 * @typedef {object} ClassificationRequest
 * @property {Image} image
 * @property {string} instruction
 * @property {CategoryKey[]} keys
 *
 * @typedef {object} Classification
 * @property {CategoryKey} categoryKey
 * @property {number} confidence
 *
 * @typedef {object} AiProvider
 * @property {string} name
 * @property {(request: ClassificationRequest) => Promise<Classification>} classify
 */

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/**
 * @param {unknown} dataUrl
 * @returns {Image | null}
 */
function extractImage(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = DATA_URL.exec(dataUrl);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

/** @param {Category[]} categories */
function buildInstruction(categories) {
  const description = categories.map((c) => `- ${c.key}: ${c.name}`).join('\n');
  return (
    'You are a recycling expert. Identify the main waste item in the photo and classify it ' +
    'into exactly one of these categories:\n' +
    `${description}\n` +
    'If the image does not clearly show a waste item, use non_recyclable with low confidence. ' +
    'confidence is a number between 0 and 1.'
  );
}

/**
 * Validates the model's response: even when a schema is requested, it is external data.
 * @param {string | undefined} text
 * @param {CategoryKey[]} keys
 * @returns {Classification}
 */
function parseResult(text, keys) {
  if (!text) throw new Error('The AI returned no response.');
  const result = JSON.parse(text);

  if (!keys.includes(result.category)) {
    throw new Error('The AI returned an unknown category.');
  }

  const confidence = Math.min(1, Math.max(0, Number(result.confidence) || 0));
  return { categoryKey: result.category, confidence };
}

module.exports = { extractImage, buildInstruction, parseResult };
