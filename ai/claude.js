// @ts-check
const Anthropic = require('@anthropic-ai/sdk').default;
const { parseResult } = require('./common');

const DEFAULT_MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 15000;
const MAX_TOKENS = 1024;

/**
 * @typedef {import('./common').AiProvider} AiProvider
 */

/**
 * @param {{ apiKey: string, model?: string }} options
 * @returns {AiProvider}
 */
function createClaudeProvider({ apiKey, model = DEFAULT_MODEL }) {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  return {
    name: 'Claude',
    async classify({ image, instruction, keys }) {
      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                category: { type: 'string', enum: keys },
                confidence: { type: 'number' }
              },
              required: ['category', 'confidence'],
              additionalProperties: false
            }
          }
        },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: /** @type {'image/jpeg' | 'image/png' | 'image/webp'} */ (image.mimeType),
                  data: image.data
                }
              },
              { type: 'text', text: instruction }
            ]
          }
        ]
      });

      if (response.stop_reason === 'refusal') {
        throw new Error('Claude refused the request.');
      }
      // The response can start with reasoning blocks, so look for the text block.
      const block = response.content.find((b) => b.type === 'text');
      return parseResult(block?.type === 'text' ? block.text : undefined, keys);
    }
  };
}

module.exports = { createClaudeProvider };
