// Si un modelo está saturado se prueba el siguiente; el lite suele tener menos demanda.
const Anthropic = require('@anthropic-ai/sdk').default;

const MODELOS = [...new Set([
  process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest'
])];
const TIMEOUT_MS = 15000;
const MODELO_CLAUDE = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const TIMEOUT_CLAUDE_MS = 15000;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

function iaDisponible() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function extraerImagen(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const coincidencia = DATA_URL.exec(dataUrl);
  return coincidencia ? { mimeType: coincidencia[1], data: coincidencia[2] } : null;
}


async function clasificarConIA(dataUrl, categorias) {
  const imagen = extraerImagen(dataUrl);
  if (!imagen) throw new Error('Imagen inválida.');

  const claves = categorias.map((c) => c.clave);
  const descripcion = categorias.map((c) => `- ${c.clave}: ${c.nombre}`).join('\n');

  const instruccion =
    'Eres un experto en reciclaje. Identifica el residuo principal de la foto y clasifícalo ' +
    'en exactamente una de estas categorías:\n' +
    `${descripcion}\n` +
    'Si la imagen no muestra un residuo claro, usa no_reciclable con confianza baja. ' +
    'confianza es un número entre 0 y 1.';

  const cuerpo = {
    contents: [
      {
        parts: [
          { text: instruccion },
          { inline_data: { mime_type: imagen.mimeType, data: imagen.data } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          categoria: { type: 'STRING', enum: claves },
          confianza: { type: 'NUMBER' }
        },
        required: ['categoria', 'confianza']
      }
    }
  };

  let ultimoError;
  for (const modelo of MODELOS) {
    try {
      return await consultarModelo(modelo, cuerpo, claves);
    } catch (err) {
      ultimoError = err;
      console.warn(`Gemini ${modelo} falló: ${err.message}`);
      if (err.definitivo) break;
    }
  }
  throw ultimoError;
}

async function consultarModelo(modelo, cuerpo, claves) {
  const respuesta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    }
  );

  if (!respuesta.ok) {
    let mensaje = '';
    try {
      const error = await respuesta.json();
      mensaje = error?.error?.message || '';
    } catch {
      mensaje = '';
    }
    const error = new Error(`Gemini respondió ${respuesta.status}${mensaje ? `: ${mensaje.slice(0, 300)}` : '.'}`);
    error.definitivo = [400, 401, 403].includes(respuesta.status);
    throw error;
  }

  const json = await respuesta.json();
  const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return interpretarResultado(texto, claves);
}

async function consultarClaude(imagen, instruccion, claves) {
  const cliente = new Anthropic({ timeout: TIMEOUT_CLAUDE_MS, maxRetries: 1 });
  const respuesta = await cliente.messages.create({
    model: MODELO_CLAUDE,
    max_tokens: 1024,
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
          { type: 'image', source: { type: 'base64', media_type: imagen.mimeType, data: imagen.data } },
          { type: 'text', text: instruccion }
        ]
      }
    ]
  });

  if (respuesta.stop_reason === 'refusal') {
    throw new Error('Claude rechazó la solicitud.');
  }
  // La respuesta puede empezar con bloques de razonamiento: se busca el de texto.
  const texto = respuesta.content.find((bloque) => bloque.type === 'text')?.text;
  return interpretarResultado(texto, claves);
}

function interpretarResultado(texto, claves) {
  const resultado = JSON.parse(texto);

  if (!claves.includes(resultado.categoria)) {
    throw new Error('La IA devolvió una categoría desconocida.');
  }

  const confianza = Math.min(1, Math.max(0, Number(resultado.confianza) || 0));
  return { categoriaClave: resultado.categoria, confianza };
}

module.exports = { iaDisponible, clasificarConIA };
