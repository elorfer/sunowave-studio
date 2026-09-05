/**
 * SunoWave - Audio Transcriber
 * Transcripcion de audio a texto usando Whisper via Transformers.js
 * Corre 100% en el navegador, sin API key, sin enviar datos a internet (tras descarga del modelo)
 */

const Transcriber = (() => {

  // Estado interno
  let pipeline = null;
  let isModelLoaded = false;
  let isTranscribing = false;
  const MODEL_NAME = 'Xenova/whisper-tiny';

  // Callbacks de UI (se inyectan desde el exterior)
  let _onStatus   = () => {};
  let _onProgress = () => {};
  let _onResult   = () => {};
  let _onError    = () => {};

  /**
   * Inicializa el pipeline de Whisper (descarga el modelo si es primera vez)
   */
  async function loadModel(onStatus, onProgress) {
    if (isModelLoaded && pipeline) return pipeline;

    _onStatus   = onStatus   || (() => {});
    _onProgress = onProgress || (() => {});

    try {
      _onStatus('Cargando motor de IA Whisper...', 5);

      // Importar Transformers.js dinamicamente desde CDN
      const { pipeline: createPipeline, env } = await import(
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js'
      );

      // Configurar para usar cache local del navegador
      env.allowLocalModels = false;
      env.useBrowserCache  = true;

      _onStatus('Descargando modelo Whisper Tiny (~40 MB, solo la primera vez)...', 15);

      pipeline = await createPipeline('automatic-speech-recognition', MODEL_NAME, {
        progress_callback: (info) => {
          if (info.status === 'downloading') {
            const pct = info.total ? Math.round((info.loaded / info.total) * 60) + 15 : 30;
            _onProgress(pct, `Descargando modelo: ${info.file || ''}...`);
          }
          if (info.status === 'loaded' || info.status === 'done') {
            _onProgress(80, 'Modelo cargado en memoria...');
          }
        }
      });

      isModelLoaded = true;
      _onStatus('Motor Whisper listo', 100);
      return pipeline;

    } catch (err) {
      console.error('Error cargando Whisper:', err);
      _onError('No se pudo cargar el modelo de IA. Verifica tu conexión a internet para la primera descarga.');
      throw err;
    }
  }

  /**
   * Transcribe un archivo de audio (File, Blob, o URL de audio)
   * @param {File|Blob|string} audioSource  - Archivo, Blob o URL de audio
   * @param {string}           language     - Idioma ('es', 'en', etc.) o 'auto'
   * @param {Object}           callbacks    - { onStatus, onProgress, onResult, onError }
   */
  async function transcribe(audioSource, language = 'auto', callbacks = {}) {
    if (isTranscribing) {
      (callbacks.onError || (() => {}))('Ya hay una transcripción en curso. Espera a que finalice.');
      return;
    }
    isTranscribing = true;

    const onStatus   = callbacks.onStatus   || (() => {});
    const onProgress = callbacks.onProgress || (() => {});
    const onResult   = callbacks.onResult   || (() => {});
    const onError    = callbacks.onError    || (() => {});

    try {
      // 1. Cargar modelo
      const whisper = await loadModel(onStatus, onProgress);

      // 2. Preparar el audio como Float32Array
      onStatus('Decodificando el audio...', 82);
      onProgress(82, 'Decodificando el audio...');

      let audioData;

      if (typeof audioSource === 'string') {
        // Es una URL -> fetch + decode
        const resp = await fetch(audioSource);
        if (!resp.ok) throw new Error('No se pudo obtener el audio desde la URL.');
        const arrBuf = await resp.arrayBuffer();
        audioData = await decodeAudioToFloat32(arrBuf, onProgress);
      } else {
        // Es un File o Blob
        const arrBuf = await audioSource.arrayBuffer();
        audioData = await decodeAudioToFloat32(arrBuf, onProgress);
      }

      // 3. Configurar opciones de Whisper
      onStatus('Iniciando transcripcion con IA...', 88);
      onProgress(88, 'Transcribiendo con Whisper...');

      const whisperOptions = {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
      };

      if (language !== 'auto') {
        whisperOptions.language = language;
        whisperOptions.task = 'transcribe';
      }

      // 4. Transcribir
      const result = await whisper(audioData, whisperOptions);

      onProgress(100, 'Transcripcion completada');
      onStatus('Transcripcion completada', 100);

      // Construir salida con timestamps si existen
      const text  = result.text ? result.text.trim() : '';
      const chunks = result.chunks || [];

      onResult({ text, chunks });

    } catch (err) {
      console.error('Error transcribiendo:', err);
      onError('Error durante la transcripcion: ' + (err.message || 'Error desconocido'));
    } finally {
      isTranscribing = false;
    }
  }

  /**
   * Decodifica un ArrayBuffer de audio a Float32Array (mono, 16kHz) usando Web Audio API
   */
  async function decodeAudioToFloat32(arrayBuffer, onProgress) {
    onProgress(84, 'Convirtiendo formato de audio...');

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const decoded  = await audioCtx.decodeAudioData(arrayBuffer);

    // Mezclar a mono si es estereo
    const numChannels = decoded.numberOfChannels;
    const length      = decoded.length;
    const mono        = new Float32Array(length);

    for (let ch = 0; ch < numChannels; ch++) {
      const chData = decoded.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += chData[i] / numChannels;
      }
    }

    onProgress(87, 'Audio procesado, enviando a Whisper...');
    audioCtx.close();
    return mono;
  }

  /**
   * Formatea un tiempo en segundos a MM:SS
   */
  function formatTime(sec) {
    if (sec == null || isNaN(sec)) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  return { loadModel, transcribe, formatTime, get isReady() { return isModelLoaded; } };
})();

window.Transcriber = Transcriber;
