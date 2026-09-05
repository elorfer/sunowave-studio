/**
 * SunoWave - Suno Service
 * Extracción inteligente y resolución de metadatos de canciones de Suno AI
 * Soporta UUIDs estándar, URLs completas (/song/...) y enlaces compartidos cortos (/s/...)
 */

const SunoService = {
  // Expresión regular para UUID v4 estándar de Suno
  UUID_REGEX: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,

  // Expresión regular para enlaces cortos de Suno (/s/...)
  SHORT_LINK_REGEX: /suno\.(com|ai)\/s\/([a-zA-Z0-9_-]+)/i,

  // Expresión regular para enlaces generales de Suno
  SUNO_URL_REGEX: /suno\.(com|ai)\/(song|s|track|create)?\/?[a-zA-Z0-9_.-]+/i,

  // Lista de proxies CORS públicos con rotación y tolerancia a fallos
  CORS_PROXIES: [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ],

  /**
   * Extrae el UUID si ya está presente en el texto
   */
  extractUUID(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim();
    const match = clean.match(this.UUID_REGEX);
    return match ? match[0].toLowerCase() : null;
  },

  /**
   * Determina si el texto es un enlace corto de Suno (/s/...)
   */
  isShortLink(input) {
    if (!input || typeof input !== 'string') return false;
    return this.SHORT_LINK_REGEX.test(input.trim());
  },

  /**
   * Determina si el texto ingresado es una entrada válida (UUID, enlace corto o enlace estándar)
   */
  isValidInput(input) {
    if (!input || typeof input !== 'string') return false;
    const clean = input.trim();
    return Boolean(
      this.extractUUID(clean) || 
      this.SHORT_LINK_REGEX.test(clean) || 
      this.SUNO_URL_REGEX.test(clean)
    );
  },

  /**
   * Normaliza la URL canónica de la canción a partir de un UUID
   */
  getCanonicalUrl(uuid) {
    return `https://suno.com/song/${uuid}`;
  },

  // Caché en memoria para evitar descargas o descifrados duplicados
  _decryptedBlobs: new Map(),

  /**
   * Descifra el flujo de audio con DRM Mango de Suno (v5 / v5.5) usando Web Crypto API nativa
   * @param {string} uuid - ID de la canción
   * @param {string} mediaUrl - URL de CloudFront (.m4a cifrado)
   * @param {Function} onProgress - Callback de progreso
   * @returns {Promise<Blob>} - Blob de audio descifrado listo para reproducir o recortar
   */
  async decryptMangoAudio(uuid, mediaUrl, onProgress = () => {}) {
    if (this._decryptedBlobs.has(uuid)) {
      onProgress('Audio recuperado de la memoria caché.');
      return this._decryptedBlobs.get(uuid);
    }

    onProgress('Solicitando credenciales seguras a Suno (DRM Mango)...');
    
    // 1. Obtener derechos de licencia
    let rights;
    try {
      const rightsRes = await fetch("https://studio-api.prod.suno.com/api/mango/rights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_params: { content_id: uuid, content_type: "clip" }
        })
      });
      if (!rightsRes.ok) throw new Error(`HTTP ${rightsRes.status}`);
      rights = await rightsRes.json();
    } catch (e) {
      // Fallback a través del proxy local o Vercel
      const proxyUrl = `/api/proxy?url=${encodeURIComponent("https://studio-api.prod.suno.com/api/mango/rights")}`;
      const proxyRes = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_params: { content_id: uuid, content_type: "clip" }
        })
      });
      if (!proxyRes.ok) throw new Error(`No se pudo obtener licencia de descifrado: ${e.message}`);
      rights = await proxyRes.json();
    }

    if (!rights || !rights.key || !rights.iv || !rights.glt) {
      throw new Error("Respuesta inválida del servidor de licencias de Suno");
    }

    onProgress('Derivando claves criptográficas de alta fidelidad...');

    const toWrappedKey = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    // A. glt -> User Key (SHA-256 -> AES-GCM)
    const enc = new TextEncoder().encode(rights.glt);
    const userKeyHash = await crypto.subtle.digest("SHA-256", enc);
    const userKey = await crypto.subtle.importKey("raw", userKeyHash, { name: "AES-GCM" }, false, ["decrypt"]);

    // B. Desempaquetar Content Key (AES-GCM -> AES-CTR)
    const wrappedKey = toWrappedKey(rights.key);
    const keyIv = wrappedKey.slice(0, 12);
    const keyCiphertext = wrappedKey.slice(12);
    const contentIdBytes = new TextEncoder().encode(uuid);
    const rawKey = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: keyIv, additionalData: contentIdBytes },
      userKey,
      keyCiphertext
    );
    const contentKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-CTR" }, false, ["decrypt"]);

    // C. Desempaquetar Initial IV (AES-GCM)
    const wrappedIv = toWrappedKey(rights.iv);
    const ivIv = wrappedIv.slice(0, 12);
    const ivCiphertext = wrappedIv.slice(12);
    const rawIv = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivIv, additionalData: contentIdBytes },
      userKey,
      ivCiphertext
    );
    const initialCounter = new Uint8Array(rawIv);

    // D. Descargar flujo cifrado desde CloudFront
    const targetUrl = mediaUrl || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${uuid}.m4a`;
    onProgress('Descargando flujo cifrado desde CloudFront...');
    const mediaRes = await fetch(targetUrl);
    if (!mediaRes.ok) {
      throw new Error(`Error descargando audio de CloudFront: HTTP ${mediaRes.status}`);
    }
    const encryptedBuf = await mediaRes.arrayBuffer();

    // E. Descifrar con aceleración por hardware (AES-CTR)
    onProgress('Descifrando audio con aceleración por hardware...');
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-CTR", counter: initialCounter, length: 128 },
      contentKey,
      encryptedBuf
    );

    const decryptedBlob = new Blob([decryptedBuf], { type: "audio/mp4" });
    this._decryptedBlobs.set(uuid, decryptedBlob);
    onProgress('¡Audio descifrado exitosamente!');
    return decryptedBlob;
  },

  /**
   * Genera los enlaces CDN directos basados en el UUID
   */
  getDirectCDNLinks(uuid) {
    return {
      audioM4a: `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${uuid}.m4a`,
      audioMp3Fallback: `https://cdn1.suno.ai/${uuid}.mp3`,
      videoMp4: `https://cdn1.suno.ai/${uuid}.mp4`,
      imagePng: `https://cdn1.suno.ai/image_${uuid}.png`,
      imageJpegFallback: `https://cdn2.suno.ai/${uuid}.jpeg`
    };
  },

  /**
   * Resuelve los datos completos de la canción a partir de la URL o UUID
   * @param {string} input - URL (/song/ o /s/) o UUID directo
   * @param {function} onProgress - Callback de estado
   * @returns {Promise<Object>} Datos estructurados de la canción
   */
  async resolveSong(input, onProgress = () => {}) {
    let clean = input ? input.trim() : '';
    if (!clean) {
      throw new Error('Por favor ingresa un enlace o identificador de Suno.');
    }

    // Asegurar protocolo si falta
    if (clean.startsWith('suno.com') || clean.startsWith('app.suno.ai')) {
      clean = 'https://' + clean;
    }

    let uuid = this.extractUUID(clean);
    let targetUrl = clean;

    // Si ya tenemos el UUID, usamos la URL canónica
    if (uuid) {
      targetUrl = this.getCanonicalUrl(uuid);
    }

    onProgress('Conectando con Suno...');
    let html = null;
    let finalUrl = targetUrl;
    let fetchMethod = 'none';

    // 1. Intentar a través del endpoint de proxy (funciona en localhost y en Vercel)
    try {
      const localProxy = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
      const localResp = await fetch(localProxy, { signal: AbortSignal.timeout(5000) });
      if (localResp.ok) {
        html = await localResp.text();
        const headerFinalUrl = localResp.headers.get('X-Final-Url');
        if (headerFinalUrl) finalUrl = headerFinalUrl;
        fetchMethod = 'proxy-api';
      }
    } catch (e) {
      // Continuar a proxies públicos si falla
    }

    // 2. Intentar proxies CORS públicos con rotación si el servidor local no respondió
    if (!html) {
      for (let i = 0; i < this.CORS_PROXIES.length; i++) {
        const proxyGen = this.CORS_PROXIES[i];
        const proxyUrl = proxyGen(targetUrl);
        try {
          onProgress(`Analizando enlace (canal ${i + 1}/${this.CORS_PROXIES.length})...`);
          const resp = await fetch(proxyUrl, {
            headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml' },
            signal: AbortSignal.timeout(7500)
          });
          if (resp.ok) {
            const text = await resp.text();
            if (text && text.length > 500) {
              html = text;
              fetchMethod = `proxy-${i + 1}`;
              break;
            }
          }
        } catch (err) {
          console.warn(`Proxy ${i + 1} no disponible:`, err);
        }
      }
    }

    // Si no obtuvimos HTML y no tenemos UUID, no podemos continuar
    if (!html && !uuid) {
      throw new Error('No se pudo conectar con Suno para resolver este enlace. Comprueba tu conexión a internet.');
    }

    // Si no teníamos UUID al inicio (por ejemplo, venía de /s/...), buscarlo en el HTML y en la URL final
    if (!uuid && html) {
      // Buscar en la URL final si hubo redirección a /song/<UUID>
      const uuidFromFinal = this.extractUUID(finalUrl);
      if (uuidFromFinal) {
        uuid = uuidFromFinal;
      } else {
        // Buscar cualquier UUID en el HTML (og:image, media_urls, etc.)
        const match = html.match(this.UUID_REGEX);
        if (match) {
          uuid = match[0].toLowerCase();
        }
      }
    }

    // Detectar si Suno redirigió a la página principal o no encontró la canción
    if (html && (finalUrl === 'https://suno.com/' || finalUrl === 'https://suno.com') && !uuid) {
      throw new Error(
        'El enlace corto ingresado no apunta a ninguna canción activa en Suno (la canción pudo ser eliminada o el enlace es privado). Si tienes el enlace completo (suno.com/song/...), pégalo directamente.'
      );
    }

    // Si todavía no hay UUID pero tenemos enlace corto
    if (!uuid) {
      throw new Error(
        'No se pudo encontrar el identificador de la canción. Por favor abre la canción en Suno y copia el enlace completo de la barra de direcciones (ej: https://suno.com/song/...)'
      );
    }

    const directLinks = this.getDirectCDNLinks(uuid);

    // 3. Procesar resultados o fallback a CDN
    if (html && html.length > 200) {
      onProgress('Extrayendo metadatos y letras...');
      const parsed = this.parseHtmlMetadata(html, uuid, directLinks);
      return {
        ...parsed,
        sourceMethod: fetchMethod
      };
    } else {
      // Fallback directo tolerante a fallos
      onProgress('Conectando directamente con la CDN de Suno...');
      return {
        id: uuid,
        title: `Canción Suno (${uuid.substring(0, 8)})`,
        artist: 'Suno Creator',
        artistHandle: 'suno_ai',
        tags: 'AI Music, Suno v4',
        duration: 120,
        lyrics: 'Letra no disponible directamente. El audio y video se pueden reproducir y descargar con total normalidad.',
        audioUrl: directLinks.audioM4a,
        videoUrl: directLinks.videoMp4,
        imageUrl: directLinks.imagePng,
        isFallback: true,
        sourceMethod: 'direct-cdn'
      };
    }
  },

  /**
   * Extrae metadatos precisos del HTML de la página de Suno
   */
  parseHtmlMetadata(html, uuid, directLinks) {
    let title = '';
    let artist = 'Suno Creator';
    let artistHandle = '';
    let tags = '';
    let duration = 0;
    let lyrics = '';
    let imageUrl = '';
    let audioUrl = directLinks.audioM4a;
    let videoUrl = directLinks.videoMp4;
    let modelVersion = 'v4';

    // 1. Extraer título de etiquetas meta
    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/ \| Suno$/i, '').replace(/ - Suno$/i, '').trim();
    }

    // 2. Extraer imagen de etiquetas meta
    const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
    if (imageMatch) {
      imageUrl = imageMatch[1];
    } else {
      imageUrl = directLinks.imagePng;
    }

    // 3. Extraer URL de audio de alta calidad (.m4a o .mp3)
    const m4aMatch = html.match(/https:\/\/[^\s"'\\]+?\/1\/clip\/[a-f0-9\-]+?\.m4a/i);
    let isMango = html.includes('m4a-opus') || 
                  html.includes('api/forbidden') || 
                  html.includes('d2lwuy8qc234o3.cloudfront.net') || 
                  !!m4aMatch;

    if (m4aMatch) {
      audioUrl = m4aMatch[0];
    } else if (isMango) {
      audioUrl = directLinks.audioM4a;
    }

    // 4. Extraer URL de video
    const videoMatch = html.match(/https:\/\/cdn1\.suno\.ai\/[a-f0-9\-]+?\.mp4/i);
    if (videoMatch && !html.includes('"video_url":""') && !html.includes('"video_url": ""') && !isMango) {
      videoUrl = videoMatch[0];
    } else {
      videoUrl = '';
    }

    // 5. Extraer datos JSON de Next.js / React Server Components
    const tagsMatch = html.match(/tags\\*":\s*\\*"([^\\"]+)/i);
    if (tagsMatch) {
      tags = tagsMatch[1].replace(/\\n/g, ' ').trim();
    }

    const durationMatch = html.match(/duration\\*":\s*([0-9\.]+)/i);
    if (durationMatch) {
      duration = parseFloat(durationMatch[1]);
    }

    const artistMatch = html.match(/display_name\\*":\s*\\*"([^\\"]+)/i);
    if (artistMatch) {
      artist = artistMatch[1].trim();
    }

    const handleMatch = html.match(/handle\\*":\s*\\*"([^\\"]+)/i);
    if (handleMatch) {
      artistHandle = handleMatch[1].trim();
    }

    const modelMatch = html.match(/major_model_version\\*":\s*\\*"([^\\"]+)/i);
    if (modelMatch) {
      modelVersion = modelMatch[1].trim();
    }

    // 6. Extracción de letras
    const promptMatch = html.match(/prompt\\*":\s*\\*"([^\\"]{15,})/i);
    if (promptMatch) {
      lyrics = promptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    }

    if (!lyrics || lyrics.startsWith('$')) {
      const lyricBlockMatch = html.match(/\[Verse[^\]]*\]|\[Chorus[^\]]*\]|\[Intro[^\]]*\]/i);
      if (lyricBlockMatch) {
        const idx = html.indexOf(lyricBlockMatch[0]);
        if (idx !== -1) {
          const chunk = html.substring(Math.max(0, idx - 50), Math.min(html.length, idx + 2500));
          const cleanedText = chunk
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/<[^>]+>/g, '')
            .replace(/[{}\]\["40-9:]/g, ' ')
            .trim();
          if (cleanedText.length > 30) {
            lyrics = cleanedText;
          }
        }
      }
    }

    if (!lyrics) {
      lyrics = 'No se encontraron letras explícitas para esta pista o es un tema instrumental.';
    }

    if (!title) {
      title = `Suno Track (${uuid.substring(0, 8)})`;
    }

    return {
      id: uuid,
      title,
      artist,
      artistHandle,
      tags: tags || 'AI Generated Music',
      duration: duration || 120,
      lyrics,
      audioUrl,
      videoUrl,
      imageUrl,
      modelVersion,
      isMango: isMango || audioUrl.includes('cloudfront.net'),
      isFallback: false
    };
  }
};

window.SunoService = SunoService;
