// @ts-check
const { errors } = require('../errors');

/**
 * @typedef {import('../types/contract').components['schemas']['Category']} Category
 * @typedef {import('../types/contract').components['schemas']['ScanRequest']} ScanRequest
 * @typedef {import('../types/contract').components['schemas']['ScanResult']} ScanResult
 * @typedef {import('../types/contract').components['schemas']['ClassificationSource']} ClassificationSource
 * @typedef {import('../ai/classifier').Classifier} Classifier
 * @typedef {ReturnType<import('../repositories/categories').createCategoryRepository>} CategoryRepository
 * @typedef {ReturnType<import('../repositories/scans').createScanRepository>} ScanRepository
 */

/**
 * @param {object} dependencies
 * @param {CategoryRepository} dependencies.categories
 * @param {ScanRepository} dependencies.scans
 * @param {Classifier} dependencies.classifier
 */
function createScanService({ categories, scans, classifier }) {
  /**
   * AI decides when available; if it fails, the Worker's heuristic is used.
   * @param {ScanRequest} request
   * @param {Category[]} catalog
   * @returns {Promise<{ categoryKey: ScanRequest['categoryKey'], confidence: number, source: ClassificationSource }>}
   */
  async function classify({ categoryKey, confidence, imageBase64 }, catalog) {
    if (imageBase64 && classifier.isAvailable) {
      try {
        const result = await classifier.classify(imageBase64, catalog);
        return { ...result, source: 'ai' };
      } catch (err) {
        console.error('AI classification failed, using the heuristic:', /** @type {Error} */ (err).message);
      }
    }
    return { categoryKey, confidence, source: 'heuristic' };
  }

  return {
    /**
     * @param {number} userId
     * @param {ScanRequest} request
     * @returns {Promise<ScanResult>}
     */
    async create(userId, request) {
      const catalog = await categories.list();
      const { categoryKey, confidence, source } = await classify(request, catalog);

      const category = catalog.find((c) => c.key === categoryKey);
      if (!category) throw errors.unknownCategory();

      const { id, totalPoints } = await scans.create({
        userId,
        categoryKey,
        confidence,
        source,
        widthPx: request.widthPx,
        heightPx: request.heightPx,
        points: category.points
      });

      return {
        id,
        category: {
          key: category.key,
          name: category.name,
          instructions: category.instructions,
          binColor: category.binColor
        },
        source,
        confidence,
        pointsAwarded: category.points,
        totalPoints
      };
    }
  };
}

module.exports = { createScanService };
