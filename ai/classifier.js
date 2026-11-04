// @ts-check
const { buildInstruction, extractImage } = require('./common');

/**
 * @typedef {import('./common').Category} Category
 * @typedef {import('./common').Classification} Classification
 * @typedef {import('./common').AiProvider} AiProvider
 *
 * @typedef {object} Classifier
 * @property {boolean} isAvailable
 * @property {(dataUrl: unknown, categories: Category[]) => Promise<Classification>} classify
 */

/**
 * Chain of responsibility: each provider is tried in order and the first one
 * that responds wins. Adding a provider does not require changing this file.
 * @param {AiProvider[]} providers
 * @returns {Classifier}
 */
function createClassifier(providers) {
  return {
    isAvailable: providers.length > 0,
    async classify(dataUrl, categories) {
      const image = extractImage(dataUrl);
      if (!image) throw new Error('Invalid image.');

      const request = {
        image,
        instruction: buildInstruction(categories),
        keys: categories.map((c) => c.key)
      };

      /** @type {unknown} */
      let lastError = new Error('No AI providers are configured.');
      for (const [index, provider] of providers.entries()) {
        try {
          const result = await provider.classify(request);
          if (index > 0) console.log(`Classified with ${provider.name} as a fallback.`);
          return result;
        } catch (err) {
          lastError = err;
          console.warn(`${provider.name} failed: ${/** @type {Error} */ (err).message}`);
        }
      }
      throw lastError;
    }
  };
}

module.exports = { createClassifier };
