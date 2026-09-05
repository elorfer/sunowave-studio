/**
 * SunoWave - Audio Converter & Downloader
 * Manejo de descargas en alta velocidad, conversión a MP3/WAV y exportación de archivos
 */

const AudioDownloader = {
  /**
   * Sanitiza un nombre de archivo para evitar caracteres no permitidos en Windows/Mac/Linux
   */
  sanitizeFilename(title, ext) {
    if (!title) title = 'Suno_Track';
    let safe = title
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    if (safe.length > 80) safe = safe.substring(0, 80);
    return `${safe}.${ext}`;
  },

  /**
   * Descarga un archivo a través de Blob con nombre de archivo personalizado
   * @param {string} url - URL del recurso
   * @param {string} filename - Nombre del archivo final
   * @param {function} onProgress - Progreso en porcentaje (0-100)
   */
  async downloadBlob(url, filename, onProgress = () => {}) {
    onProgress(10, 'Iniciando conexión con el servidor...');
    try {
      const response = await fetch(url, {
        headers: { 'Accept': '*/*' },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Error de servidor (${response.status} ${response.statusText})`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body || !total) {
        onProgress(50, 'Descargando datos...');
        const blob = await response.blob();
        this.triggerBrowserDownload(blob, filename);
        onProgress(100, '¡Descarga completada!');
        return;
      }

      const reader = response.body.getReader();
      let receivedLength = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        const percent = Math.round((receivedLength / total) * 100);
        onProgress(percent, `Descargando... ${percent}%`);
      }

      const blob = new Blob(chunks);
      this.triggerBrowserDownload(blob, filename);
      onProgress(100, '¡Descarga completada!');
    } catch (err) {
      console.warn('Fallo descarga directa Blob, usando enlace alternativo:', err);
      // Fallback: abrir enlace directo para que el navegador lo guarde
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onProgress(100, 'Descarga enviada al navegador');
    }
  },

  /**
   * Dispara el diálogo de guardado del navegador con el Blob y nombre
   */
  triggerBrowserDownload(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    }, 2000);
  },

  /**
   * Descarga de texto simple (Letras)
   */
  downloadText(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    this.triggerBrowserDownload(blob, filename);
  },

  /**
   * Convierte un Audio Buffer a formato WAV estéreo de 16-bit
   */
  audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    const channels = [];
    let sampleRate = buffer.sampleRate;
    let offset = 0;
    let pos = 0;

    function setUint16(data) {
      out.setUint16(pos, data, true);
      pos += 2;
    }
    function setUint32(data) {
      out.setUint32(pos, data, true);
      pos += 4;
    }

    // Encabezado RIFF WAV
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // tamaño del archivo - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16);         // longitud del chunk = 16
    setUint16(1);          // Formato PCM
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2);              // block align
    setUint16(16);                         // bits por muestra

    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (offset < buffer.length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([out.buffer], { type: 'audio/wav' });
  },

  /**
   * Convierte la pista de audio a MP3 o WAV de alta resolución usando Web Audio API
   * @param {string} audioUrl - URL del audio original
   * @param {string} baseFilename - Nombre base
   * @param {function} onProgress - Callback de porcentaje
   */
  async convertAndDownload(audioSource, baseFilename, targetFormat = 'mp3', onProgress = () => {}) {
    onProgress(10, 'Preparando flujo de audio...');
    
    // Si se pasa un Blob directamente y el formato deseado es m4a
    if (targetFormat === 'm4a') {
      const filename = this.sanitizeFilename(`${baseFilename} - Suno`, 'm4a');
      if (audioSource instanceof Blob) {
        this.triggerBrowserDownload(audioSource, filename);
        onProgress(100, '¡Descarga completada!');
        return;
      } else if (typeof audioSource === 'string' && audioSource.startsWith('blob:')) {
        const resp = await fetch(audioSource);
        const blob = await resp.blob();
        this.triggerBrowserDownload(blob, filename);
        onProgress(100, '¡Descarga completada!');
        return;
      }
      return this.downloadBlob(audioSource, filename, onProgress);
    }

    try {
      let arrayBuffer;
      if (audioSource instanceof Blob) {
        onProgress(30, 'Extrayendo buffer de audio...');
        arrayBuffer = await audioSource.arrayBuffer();
      } else if (audioSource instanceof ArrayBuffer) {
        arrayBuffer = audioSource;
      } else {
        const resp = await fetch(audioSource);
        if (!resp.ok) throw new Error(`No se pudo obtener el audio para convertir (HTTP ${resp.status})`);
        onProgress(35, 'Cargando muestras en memoria...');
        arrayBuffer = await resp.arrayBuffer();
      }

      onProgress(50, 'Decodificando ondas sonoras con Web Audio API...');
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      onProgress(75, `Procesando codificación a ${targetFormat.toUpperCase()}...`);

      if (targetFormat === 'wav') {
        // WAV lossless PCM 16-bit
        onProgress(85, 'Generando archivo WAV sin pérdida (PCM 16-bit)...');
        const wavBlob = this.audioBufferToWav(audioBuffer);
        const filename = this.sanitizeFilename(`${baseFilename} - Suno (Lossless)`, 'wav');
        this.triggerBrowserDownload(wavBlob, filename);
      } else if (targetFormat === 'mp3' && window.lamejs) {
        // MP3 320 kbps con LameJS
        const mp3Blob = await this.encodeMp3WithLame(audioBuffer, onProgress);
        const filename = this.sanitizeFilename(`${baseFilename} - Suno (320kbps)`, 'mp3');
        this.triggerBrowserDownload(mp3Blob, filename);
      } else {
        // Fallback: WAV si no hay LameJS disponible
        onProgress(85, 'LameJS no disponible. Generando WAV como alternativa...');
        const wavBlob = this.audioBufferToWav(audioBuffer);
        const filename = this.sanitizeFilename(`${baseFilename} - Suno (HQ)`, 'wav');
        this.triggerBrowserDownload(wavBlob, filename);
      }

      onProgress(100, '¡Archivo convertido y descargado con éxito!');
    } catch (err) {
      console.error('Error en conversión de audio:', err);
      // Fallback a descarga directa de M4A original
      onProgress(90, 'Descargando audio original M4A...');
      const fallbackFilename = this.sanitizeFilename(`${baseFilename} - Suno`, 'm4a');
      await this.downloadBlob(audioUrl, fallbackFilename, onProgress);
    }
  },

  /**
   * Codifica un AudioBuffer a MP3 usando LameJS
   */
  async encodeMp3WithLame(audioBuffer, onProgress) {
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const mp3encoder = new window.lamejs.Mp3Encoder(channels, sampleRate, 320); // 320 kbps

    const samplesLeft = audioBuffer.getChannelData(0);
    const samplesRight = channels > 1 ? audioBuffer.getChannelData(1) : samplesLeft;

    // Convertir Float32 a Int16
    const len = samplesLeft.length;
    const leftInt16 = new Int16Array(len);
    const rightInt16 = new Int16Array(len);

    for (let i = 0; i < len; i++) {
      leftInt16[i] = Math.max(-32768, Math.min(32767, samplesLeft[i] * 32767.5));
      rightInt16[i] = Math.max(-32768, Math.min(32767, samplesRight[i] * 32767.5));
    }

    const mp3Data = [];
    const sampleBlockSize = 1152;

    for (let i = 0; i < len; i += sampleBlockSize) {
      const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
      const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
      if (i % (sampleBlockSize * 40) === 0) {
        const percent = Math.min(98, 75 + Math.round((i / len) * 23));
        onProgress(percent, `Codificando MP3 a 320kbps... ${percent}%`);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const mp3End = mp3encoder.flush();
    if (mp3End.length > 0) {
      mp3Data.push(mp3End);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
  }
};

window.AudioDownloader = AudioDownloader;
