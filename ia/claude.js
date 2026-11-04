// @ts-check
const Anthropic = require('@anthropic-ai/sdk').default;
const { interpretarResultado } = require('./comun');

const MODELO_PREDETERMINADO = 'claude-haiku-5-5';
const TIMEOUT_MS = 15000;
const TOKENS_MAXIMOS = 1024;

/**
 * @typedef {import('./comun').Imagen} Imagen
 * @typedef {import('./comun').ProveedorIA} ProveedorIA
 */

/**
 * @param {{ apiKey: string, modelo?: string }} opciones
 * @returns {ProveedorIA}
 */
function crearProveedorClaude({ apiKey, modelo = MODELO_PREDETERMINADO }) {
  const cliente = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  return {
    nombre: 'Claude',
    async clasificar({ imagen, instruccion, claves }) {
      const respuesta = await cliente.messages.create({
        model: modelo,
        max_tokens: TOKENS_MAXIMOS,
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                categoria: { type: 'string', enum: claves },
                confianza: { type: 'number' }
              },
              required: ['categoria', 'confianza'],
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
                  media_type: /** @type {'image/jpeg' | 'image/png' | 'image/webp'} */ (imagen.mimeType),
                  data: imagen.data
                }
              },
              { type: 'text', text: instruccion }
            ]
          }
        ]
      });

      if (respuesta.stop_reason === 'refusal') {
        throw new Error('Claude rechazó la solicitud.');
      }
      // La respuesta puede empezar con bloques de razonamiento: se busca el de texto.
      const bloque = respuesta.content.find((b) => b.type === 'text');
      return interpretarResultado(bloque?.type === 'text' ? bloque.text : undefined, claves);
    }
  };
}

module.exports = { crearProveedorClaude };
