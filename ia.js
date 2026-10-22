const MODELO = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const TIMEOUT_MS = 20000;
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

  const cuerpo = {
    contents: [
      {
        parts: [
          {
            text:
              'Eres un experto en reciclaje. Identifica el residuo principal de la foto y clasifícalo ' +
              'en exactamente una de estas categorías:\n' +
              `${descripcion}\n` +
              'Si la imagen no muestra un residuo claro, usa no_reciclable con confianza baja. ' +
              'confianza es un número entre 0 y 1.'
          },
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

  const respuesta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODELO)}:generateContent`,
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
    throw new Error(`Gemini respondió ${respuesta.status}${mensaje ? `: ${mensaje.slice(0, 300)}` : '.'}`);
  }

  const json = await respuesta.json();
  const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  const resultado = JSON.parse(texto);

  if (!claves.includes(resultado.categoria)) {
    throw new Error('Gemini devolvió una categoría desconocida.');
  }

  const confianza = Math.min(1, Math.max(0, Number(resultado.confianza) || 0));
  return { categoriaClave: resultado.categoria, confianza };
}

module.exports = { iaDisponible, clasificarConIA };
