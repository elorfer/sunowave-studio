/**
 * SunoWave Studio - App Controller
 * Gestión de interfaz, eventos, reproductor de audio, descargas e historial
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado de la Aplicación
  let currentSong = null;
  let visualizer = null;
  const historyKey = 'sunowave_history_v1';

  // Elementos del DOM
  const songInput = document.getElementById('song-url-input');
  const btnAnalyze = document.getElementById('btn-analyze');
  const btnPaste = document.getElementById('btn-paste');
  const btnSampleSong = document.getElementById('btn-sample-song');
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  const resultCard = document.getElementById('result-card');

  // Elementos de la Canción
  const resAlbumArt = document.getElementById('res-album-art');
  const resSongTitle = document.getElementById('res-song-title');
  const resCreatorName = document.getElementById('res-creator-name');
  const resDuration = document.getElementById('res-duration');
  const resModelBadge = document.getElementById('res-model-badge');
  const resTagsContainer = document.getElementById('res-tags-container');
  const resSourceBadge = document.getElementById('res-source-badge');

  // Reproductor
  const coreAudio = document.getElementById('core-audio-player');
  const btnPlayToggle = document.getElementById('btn-play-toggle');
  const seekBar = document.getElementById('seek-bar');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');
  const volumeBar = document.getElementById('volume-bar');
  const volIcon = document.getElementById('vol-icon');

  // Botones de Descarga
  const btnDlMp3 = document.getElementById('btn-dl-mp3');
  const btnDlM4a = document.getElementById('btn-dl-m4a');
  const btnDlMp4 = document.getElementById('btn-dl-mp4');
  const btnDlArt = document.getElementById('btn-dl-art');
  const btnViewLyrics = document.getElementById('btn-view-lyrics');

  // Barras de Progreso en Botones
  const progMp3 = document.getElementById('progress-mp3');
  const progM4a = document.getElementById('progress-m4a');
  const progMp4 = document.getElementById('progress-mp4');

  // Modal de Letras
  const lyricsModal = document.getElementById('lyrics-modal');
  const lyricsModalTitle = document.getElementById('lyrics-modal-title');
  const lyricsModalBody = document.getElementById('lyrics-modal-body');
  const btnCloseLyrics = document.getElementById('btn-close-lyrics');
  const btnCopyLyrics = document.getElementById('btn-copy-lyrics');
  const btnDownloadLyrics = document.getElementById('btn-download-lyrics');

  // Pestañas
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Lotes & Historial
  const batchUrlsInput = document.getElementById('batch-urls-input');
  const btnProcessBatch = document.getElementById('btn-process-batch');
  const btnClearBatch = document.getElementById('btn-clear-batch');
  const batchQueueContainer = document.getElementById('batch-queue-container');
  const historyContainer = document.getElementById('history-container');
  const historyEmpty = document.getElementById('history-empty');
  const btnClearHistory = document.getElementById('btn-clear-history');

  // Inicializar Visualizador Neón
  visualizer = new AudioVisualizer('audio-visualizer-canvas', coreAudio);

  // Cargar Historial inicial
  renderHistory();

  // ==========================================
  // Navegación entre Pestañas
  // ==========================================
  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navTabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const content = document.getElementById(targetTab);
      if (content) content.classList.add('active');

      if (targetTab === 'tab-history') {
        renderHistory();
      }
    });
  });

  const btnGotoTranscribe = document.getElementById('btn-goto-transcribe');
  if (btnGotoTranscribe) {
    btnGotoTranscribe.addEventListener('click', () => {
      const txrTabBtn = document.querySelector('.nav-tab-btn[data-tab="tab-transcribe"]');
      if (txrTabBtn) txrTabBtn.click();
    });
  }

  // ==========================================
  // Eventos de Búsqueda y Extracción
  // ==========================================
  btnAnalyze.addEventListener('click', () => processInputUrl());

  songInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      processInputUrl();
    }
  });

  // Botón Pegar del Portapapeles
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        songInput.value = text.trim();
        showToast('Enlace pegado del portapapeles', 'info');
        processInputUrl();
      }
    } catch (err) {
      songInput.focus();
      showToast('Presiona Ctrl+V para pegar tu enlace', 'info');
    }
  });

  // Botón Canción de Ejemplo
  btnSampleSong.addEventListener('click', () => {
    songInput.value = 'https://suno.com/song/7f7fbf55-1f6e-4515-a775-1ec04e2ec599';
    processInputUrl();
  });

  /**
   * Procesa la URL o UUID ingresado
   */
  async function processInputUrl() {
    const rawVal = songInput.value.trim();
    if (!rawVal) {
      showToast('Por favor ingresa o pega un enlace de Suno', 'error');
      songInput.focus();
      return;
    }

    if (!SunoService.isValidInput(rawVal)) {
      showToast('El texto no parece un enlace de Suno ni un UUID válido.', 'error');
      return;
    }

    loadingIndicator.style.display = 'block';
    resultCard.style.display = 'none';
    btnAnalyze.disabled = true;

    try {
      const songData = await SunoService.resolveSong(rawVal, (statusMsg) => {
        loadingText.textContent = statusMsg;
      });

      currentSong = songData;
      displaySongResult(songData);
      saveToHistory(songData);
      showToast(`¡Canción encontrada: "${songData.title}"!`, 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error al conectar con los servidores de Suno.', 'error');
    } finally {
      loadingIndicator.style.display = 'none';
      btnAnalyze.disabled = false;
    }
  }

  /**
   * Muestra la información de la canción en la tarjeta de resultado
   */
  function displaySongResult(song) {
    resSongTitle.textContent = song.title;
    resCreatorName.textContent = song.artist || 'Suno Creator';
    resDuration.textContent = formatDuration(song.duration);
    resModelBadge.textContent = song.modelVersion || 'v4';
    resSourceBadge.textContent = song.isFallback ? 'Enlace Directo' : 'Metadatos Verificados';

    // Portada
    resAlbumArt.src = song.imageUrl;
    resAlbumArt.onerror = () => {
      resAlbumArt.src = 'assets/logo.jpg';
    };

    // Tags
    resTagsContainer.innerHTML = '';
    if (song.tags) {
      const tagList = song.tags.split(',').map(t => t.trim()).filter(Boolean);
      tagList.slice(0, 6).forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag-pill';
        span.textContent = `#${tag}`;
        resTagsContainer.appendChild(span);
      });
    }

    // Configurar Reproductor
    coreAudio.pause();
    btnPlayToggle.textContent = '▶';
    seekBar.value = 0;
    timeCurrent.textContent = '0:00';
    timeTotal.textContent = formatDuration(song.duration);

    if (song.isMango || song.audioUrl?.includes('cloudfront.net')) {
      // Descifrar audio en segundo plano para el reproductor usando Web Crypto
      btnPlayToggle.disabled = true;
      btnPlayToggle.title = 'Descifrando stream de Suno...';
      const mediaUrl = (song.audioUrl && !song.audioUrl.includes('forbidden')) 
        ? song.audioUrl 
        : `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${song.id}.m4a`;

      SunoService.decryptMangoAudio(song.id, mediaUrl).then(decryptedBlob => {
        song.decryptedBlob = decryptedBlob;
        song.decryptedBlobUrl = URL.createObjectURL(decryptedBlob);
        coreAudio.src = song.decryptedBlobUrl;
        coreAudio.load();
        btnPlayToggle.disabled = false;
        btnPlayToggle.title = 'Reproducir / Pausar';
      }).catch(err => {
        console.warn('Error al descifrar para el reproductor:', err);
        btnPlayToggle.disabled = false;
        coreAudio.src = song.videoUrl || song.audioUrl;
      });
    } else {
      coreAudio.src = song.videoUrl || song.audioUrl;
      coreAudio.load();
      btnPlayToggle.disabled = false;
    }

    // Reiniciar barras de progreso
    progMp3.style.width = '0%';
    progM4a.style.width = '0%';
    progMp4.style.width = '0%';

    resultCard.style.display = 'block';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Notificar al transcriptor y cortador que hay una canción nueva
    if (window._txrNotifySong) window._txrNotifySong(song);
    if (window._trimmerNotifySong) window._trimmerNotifySong(song);
  }

  // ==========================================
  // Controles del Reproductor de Audio
  // ==========================================
  function togglePlayAudio() {
    if (!coreAudio.src) return;

    if (coreAudio.paused) {
      const playPromise = coreAudio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          btnPlayToggle.textContent = '⏸';
        }).catch(err => {
          console.warn('Error al reproducir audio:', err);
          showToast('Haz clic en Play para iniciar el audio', 'info');
        });
      }
    } else {
      coreAudio.pause();
      btnPlayToggle.textContent = '▶';
    }
  }

  btnPlayToggle.addEventListener('click', togglePlayAudio);

  // Clic en la carátula para reproducir/pausar
  resAlbumArt.parentElement.style.cursor = 'pointer';
  resAlbumArt.parentElement.addEventListener('click', togglePlayAudio);

  coreAudio.addEventListener('play', () => {
    btnPlayToggle.textContent = '⏸';
  });

  coreAudio.addEventListener('pause', () => {
    btnPlayToggle.textContent = '▶';
  });

  coreAudio.addEventListener('timeupdate', () => {
    if (!coreAudio.duration) return;
    const progress = (coreAudio.currentTime / coreAudio.duration) * 100;
    seekBar.value = progress;
    timeCurrent.textContent = formatDuration(coreAudio.currentTime);
  });

  coreAudio.addEventListener('loadedmetadata', () => {
    if (coreAudio.duration) {
      timeTotal.textContent = formatDuration(coreAudio.duration);
    }
  });

  coreAudio.addEventListener('ended', () => {
    btnPlayToggle.textContent = '▶';
    seekBar.value = 0;
  });

  seekBar.addEventListener('input', () => {
    if (!coreAudio.duration) return;
    const seekTime = (seekBar.value / 100) * coreAudio.duration;
    coreAudio.currentTime = seekTime;
  });

  volumeBar.addEventListener('input', () => {
    coreAudio.volume = volumeBar.value;
    volIcon.textContent = volumeBar.value == 0 ? '🔇' : (volumeBar.value < 0.5 ? '🔉' : '🔊');
  });

  volIcon.addEventListener('click', () => {
    if (coreAudio.volume > 0) {
      coreAudio.volume = 0;
      volumeBar.value = 0;
      volIcon.textContent = '🔇';
    } else {
      coreAudio.volume = 0.9;
      volumeBar.value = 0.9;
      volIcon.textContent = '🔊';
    }
  });

  // ==========================================
  // Acciones de Descarga
  // ==========================================

  function triggerFileDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }

  // 1. Descargar MP3 (Universal 320kbps - Compatible con Windows Media Player)
  btnDlMp3.addEventListener('click', async () => {
    if (!currentSong) return;
    showToast('Generando y descargando MP3 a 320 kbps...', 'info');
    progMp3.style.width = '15%';

    try {
      btnDlMp3.disabled = true;

      let audioSource = currentSong.decryptedBlob;
      if (!audioSource && (currentSong.isMango || currentSong.audioUrl?.includes('cloudfront.net'))) {
        progMp3.style.width = '30%';
        const mediaUrl = (currentSong.audioUrl && !currentSong.audioUrl.includes('forbidden')) 
          ? currentSong.audioUrl 
          : `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${currentSong.id}.m4a`;
        audioSource = await SunoService.decryptMangoAudio(currentSong.id, mediaUrl, (msg) => {
          showToast(msg, 'info');
        });
        currentSong.decryptedBlob = audioSource;
        currentSong.decryptedBlobUrl = URL.createObjectURL(audioSource);
      }

      const isLocal = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' || 
                      window.location.port === '8080';

      if (!audioSource && isLocal && currentSong.videoUrl) {
        const url = `/api/download?format=mp3&url=${encodeURIComponent(currentSong.videoUrl)}&title=${encodeURIComponent(currentSong.title)}`;
        triggerFileDownload(url, `${currentSong.title} - Suno (320kbps).mp3`);
        showToast('¡Descarga de MP3 iniciada!', 'success');
      } else {
        await AudioDownloader.convertAndDownload(
          audioSource || currentSong.videoUrl || currentSong.audioUrl,
          currentSong.title,
          'mp3',
          (pct) => { progMp3.style.width = `${pct}%`; }
        );
        showToast('¡Audio MP3 descargado en 320kbps!', 'success');
      }
    } catch (e) {
      showToast('Error al procesar MP3: ' + e.message, 'error');
    } finally {
      btnDlMp3.disabled = false;
      setTimeout(() => { progMp3.style.width = '0%'; }, 2000);
    }
  });

  // 1b. Descargar WAV Sin Pérdida (PCM 16-bit Lossless)
  const btnDlWav = document.getElementById('btn-dl-wav');
  const progWav  = document.getElementById('progress-wav');

  btnDlWav.addEventListener('click', async () => {
    if (!currentSong) return;
    showToast('Convirtiendo a WAV sin pérdida... (puede tardar unos segundos)', 'info');
    progWav.style.width = '15%';

    try {
      btnDlWav.disabled = true;

      let audioSource = currentSong.decryptedBlob;
      if (!audioSource && (currentSong.isMango || currentSong.audioUrl?.includes('cloudfront.net'))) {
        progWav.style.width = '30%';
        const mediaUrl = (currentSong.audioUrl && !currentSong.audioUrl.includes('forbidden')) 
          ? currentSong.audioUrl 
          : `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${currentSong.id}.m4a`;
        audioSource = await SunoService.decryptMangoAudio(currentSong.id, mediaUrl, (msg) => {
          showToast(msg, 'info');
        });
        currentSong.decryptedBlob = audioSource;
        currentSong.decryptedBlobUrl = URL.createObjectURL(audioSource);
      }

      await AudioDownloader.convertAndDownload(
        audioSource || currentSong.videoUrl || currentSong.audioUrl,
        currentSong.title,
        'wav',
        (pct, msg) => {
          progWav.style.width = `${pct}%`;
          if (msg) showToast(msg, 'info');
        }
      );
      showToast('¡WAV lossless descargado con éxito!', 'success');
    } catch (e) {
      showToast('Error al generar WAV: ' + e.message, 'error');
    } finally {
      btnDlWav.disabled = false;
      setTimeout(() => { progWav.style.width = '0%'; }, 2000);
    }
  });

  // 2. Descargar Audio AAC / M4A (100% compatible con cabecera ftyp)
  btnDlM4a.addEventListener('click', async () => {
    if (!currentSong) return;
    showToast('Descargando audio AAC/M4A de estudio...', 'info');
    progM4a.style.width = '20%';

    try {
      let audioBlob = currentSong.decryptedBlob;
      if (!audioBlob && (currentSong.isMango || currentSong.audioUrl?.includes('cloudfront.net'))) {
        progM4a.style.width = '40%';
        const mediaUrl = (currentSong.audioUrl && !currentSong.audioUrl.includes('forbidden')) 
          ? currentSong.audioUrl 
          : `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${currentSong.id}.m4a`;
        audioBlob = await SunoService.decryptMangoAudio(currentSong.id, mediaUrl, (msg) => {
          showToast(msg, 'info');
        });
        currentSong.decryptedBlob = audioBlob;
        currentSong.decryptedBlobUrl = URL.createObjectURL(audioBlob);
      }

      if (audioBlob) {
        const filename = AudioDownloader.sanitizeFilename(`${currentSong.title} - Suno (AAC)`, 'm4a');
        AudioDownloader.triggerBrowserDownload(audioBlob, filename);
        progM4a.style.width = '100%';
        showToast('¡Audio M4A descargado con éxito!', 'success');
      } else {
        const isLocal = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.port === '8080';
        if (isLocal && currentSong.videoUrl) {
          const url = `/api/download?format=m4a&url=${encodeURIComponent(currentSong.videoUrl)}&title=${encodeURIComponent(currentSong.title)}`;
          triggerFileDownload(url, `${currentSong.title} - Suno (AAC).m4a`);
        } else {
          const filename = AudioDownloader.sanitizeFilename(`${currentSong.title} - Suno`, 'm4a');
          AudioDownloader.downloadBlob(currentSong.audioUrl, filename, (pct) => {
            progM4a.style.width = `${pct}%`;
          });
        }
      }
    } catch (err) {
      showToast('Error al descargar audio: ' + err.message, 'error');
    } finally {
      setTimeout(() => { progM4a.style.width = '0%'; }, 2000);
    }
  });

  // 3. Descargar Video MP4 Oficial (Abre en cualquier reproductor con video y audio)
  btnDlMp4.addEventListener('click', async () => {
    if (!currentSong) return;
    if (!currentSong.videoUrl) {
      showToast('Esta pista no cuenta con video oficial (pista v5.5 de audio directo)', 'warning');
      return;
    }
    showToast('Descargando video oficial MP4...', 'info');
    progMp4.style.width = '100%';

    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.port === '8080';

    if (isLocal) {
      const url = `/api/download?format=mp4&url=${encodeURIComponent(currentSong.videoUrl)}&title=${encodeURIComponent(currentSong.title)}`;
      triggerFileDownload(url, `${currentSong.title} - Suno.mp4`);
      setTimeout(() => { progMp4.style.width = '0%'; }, 2000);
    } else {
      const filename = AudioDownloader.sanitizeFilename(`${currentSong.title} - Suno`, 'mp4');
      AudioDownloader.downloadBlob(currentSong.videoUrl, filename, (pct) => {
        progMp4.style.width = `${pct}%`;
      });
      setTimeout(() => { progMp4.style.width = '0%'; }, 2000);
    }
  });

  // 4. Descargar Portada HD
  btnDlArt.addEventListener('click', async () => {
    if (!currentSong || !currentSong.imageUrl) return;
    showToast('Descargando portada en alta resolución...', 'info');
    const filename = AudioDownloader.sanitizeFilename(`${currentSong.title} - Cover`, 'jpg');
    AudioDownloader.downloadBlob(currentSong.imageUrl, filename);
  });

  // 5. Ver y Descargar Letras
  btnViewLyrics.addEventListener('click', () => {
    if (!currentSong) return;
    lyricsModalTitle.textContent = `Letra: ${currentSong.title}`;
    lyricsModalBody.textContent = currentSong.lyrics || 'No hay letras disponibles.';
    lyricsModal.classList.add('active');
  });

  btnCloseLyrics.addEventListener('click', () => {
    lyricsModal.classList.remove('active');
  });

  lyricsModal.addEventListener('click', (e) => {
    if (e.target === lyricsModal) {
      lyricsModal.classList.remove('active');
    }
  });

  btnCopyLyrics.addEventListener('click', () => {
    if (!currentSong || !currentSong.lyrics) return;
    navigator.clipboard.writeText(currentSong.lyrics).then(() => {
      showToast('¡Letra copiada al portapapeles!', 'success');
    });
  });

  btnDownloadLyrics.addEventListener('click', () => {
    if (!currentSong || !currentSong.lyrics) return;
    const content = `TÍTULO: ${currentSong.title}\nARTISTA: ${currentSong.artist}\nESTILO: ${currentSong.tags}\nID: ${currentSong.id}\n\n=== LETRAS ===\n\n${currentSong.lyrics}`;
    const filename = AudioDownloader.sanitizeFilename(`${currentSong.title} - Letras`, 'txt');
    AudioDownloader.downloadText(content, filename);
    showToast('Archivo de letra descargado', 'success');
  });

  // ==========================================
  // Manejo de Cola de Descarga por Lotes
  // ==========================================
  btnProcessBatch.addEventListener('click', async () => {
    const rawText = batchUrlsInput.value.trim();
    if (!rawText) {
      showToast('Por favor, ingresa al menos una URL por línea.', 'error');
      return;
    }

    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const validUrls = lines.filter(l => SunoService.isValidInput(l));

    if (validUrls.length === 0) {
      showToast('No se encontraron enlaces válidos de Suno.', 'error');
      return;
    }

    batchQueueContainer.innerHTML = '';
    btnProcessBatch.disabled = true;

    for (let i = 0; i < validUrls.length; i++) {
      const url = validUrls[i];
      const row = document.createElement('div');
      row.className = 'batch-item-row';
      row.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 14px;">Canción #${i + 1}</div>
          <div style="font-size: 12px; color: var(--text-muted); font-family: monospace;">${url.substring(0, 48)}...</div>
        </div>
        <div id="batch-status-${i}" style="font-size: 13px; color: var(--neon-cyan);">
          Procesando...
        </div>
      `;
      batchQueueContainer.appendChild(row);

      try {
        const song = await SunoService.resolveSong(url);
        saveToHistory(song);
        const statusEl = document.getElementById(`batch-status-${i}`);
        if (statusEl) {
          statusEl.innerHTML = `
            <span style="color: var(--neon-green); font-weight: 600;">Listo: ${song.title.substring(0, 24)}</span>
            <button class="btn-small" style="display: inline-flex; margin-left: 8px;" onclick="window.downloadBatchSong('${song.videoUrl || song.audioUrl}', '${song.title.replace(/'/g, "\\'")}')">
              Descargar MP3
            </button>
          `;
        }
      } catch (err) {
        const statusEl = document.getElementById(`batch-status-${i}`);
        if (statusEl) {
          statusEl.innerHTML = `<span style="color: var(--neon-pink);">Error al obtener</span>`;
        }
      }
    }

    btnProcessBatch.disabled = false;
    showToast('¡Procesamiento por lotes finalizado!', 'success');
  });

  window.downloadBatchSong = (url, title) => {
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.port === '8080';
    if (isLocal) {
      const dlUrl = `/api/download?format=mp3&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
      triggerFileDownload(dlUrl, `${title} - Suno (320kbps).mp3`);
    } else {
      const filename = AudioDownloader.sanitizeFilename(`${title} - Suno`, 'mp4');
      AudioDownloader.downloadBlob(url, filename);
    }
  };

  btnClearBatch.addEventListener('click', () => {
    batchUrlsInput.value = '';
    batchQueueContainer.innerHTML = '';
  });

  // ==========================================
  // Historial Local
  // ==========================================
  function saveToHistory(song) {
    try {
      let history = JSON.parse(localStorage.getItem(historyKey) || '[]');
      history = history.filter(item => item.id !== song.id);
      history.unshift({
        id: song.id,
        title: song.title,
        artist: song.artist,
        imageUrl: song.imageUrl,
        audioUrl: song.audioUrl,
        videoUrl: song.videoUrl,
        duration: song.duration,
        timestamp: Date.now()
      });
      localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 30)));
    } catch (e) {
      console.warn('No se pudo guardar en localStorage:', e);
    }
  }

  function renderHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
      historyContainer.innerHTML = '';

      if (history.length === 0) {
        historyEmpty.style.display = 'block';
        return;
      }

      historyEmpty.style.display = 'none';
      history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
          <div class="history-img-wrap">
            <img class="history-img" src="${item.imageUrl || 'assets/logo.jpg'}" alt="${item.title}" onerror="this.src='assets/logo.jpg'">
          </div>
          <div class="history-body">
            <div class="history-title" title="${item.title}">${item.title}</div>
            <div class="history-meta">👤 ${item.artist} • ⏱️ ${formatDuration(item.duration)}</div>
            <div class="history-actions">
              <button class="btn-small btn-replay" data-id="${item.id}">
                ▶ Escuchar
              </button>
              <button class="btn-small btn-dl-hist" data-url="${item.videoUrl || item.audioUrl}" data-title="${item.title}">
                💾 Descargar MP3
              </button>
            </div>
          </div>
        `;
        historyContainer.appendChild(card);
      });

      document.querySelectorAll('.btn-replay').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          songInput.value = `https://suno.com/song/${id}`;
          navTabBtns[0].click();
          processInputUrl();
        });
      });

      document.querySelectorAll('.btn-dl-hist').forEach(btn => {
        btn.addEventListener('click', () => {
          const url = btn.getAttribute('data-url');
          const title = btn.getAttribute('data-title');
          window.downloadBatchSong(url, title);
          showToast('Iniciando descarga desde historial', 'info');
        });
      });
    } catch (e) {
      console.warn('Error al leer historial:', e);
    }
  }

  btnClearHistory.addEventListener('click', () => {
    localStorage.removeItem(historyKey);
    renderHistory();
    showToast('Historial borrado con éxito', 'info');
  });

  // ==========================================
  // Utilidades
  // ==========================================
  function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(60px)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ============================================================
  //  TRANSCRIPTOR DE AUDIO A TEXTO — Controlador de UI
  // ============================================================
  (function initTranscriber() {
    const btnUseSuno    = document.getElementById('txr-btn-use-suno');
    const txrSunoName   = document.getElementById('txr-suno-name');
    const fileInput     = document.getElementById('txr-file-input');
    const selectedSrc   = document.getElementById('txr-selected-source');
    const srcLabel      = document.getElementById('txr-source-label');
    const langBtns      = document.querySelectorAll('.txr-lang-btn');
    const btnStart      = document.getElementById('txr-btn-start');
    const btnLabel      = document.getElementById('txr-btn-label');
    const progressWrap  = document.getElementById('txr-progress-wrap');
    const progressMsg   = document.getElementById('txr-progress-msg');
    const progressPct   = document.getElementById('txr-progress-pct');
    const progressBar   = document.getElementById('txr-progress-bar');
    const resultSection = document.getElementById('txr-result-section');
    const plainView     = document.getElementById('txr-plain-view');
    const tsView        = document.getElementById('txr-ts-view');
    const statsEl       = document.getElementById('txr-stats');
    const btnCopy       = document.getElementById('txr-btn-copy');
    const btnDownTxt    = document.getElementById('txr-btn-download-txt');
    const btnToggleTs   = document.getElementById('txr-btn-toggle-ts');

    let txrSource = null;
    let txrLang   = 'auto';
    let txrResult = null;
    let tsVisible = false;

    // Exponer función para que displaySongResult actualice el nombre
    window._txrNotifySong = (song) => {
      if (song) {
        txrSunoName.textContent = `${song.title} — listo para transcribir`;
        btnUseSuno.style.borderColor = 'var(--neon-cyan)';
      }
    };

    // Selección: canción de Suno
    btnUseSuno.addEventListener('click', () => {
      if (!currentSong) {
        showToast('Primero carga una canción en la pestaña Individual', 'error');
        return;
      }
      txrSource = {
        type: 'suno',
        data: currentSong.videoUrl || currentSong.audioUrl,
        name: currentSong.title
      };
      setSourceSelected(`🎵 ${currentSong.title}`);
    });

    // Selección: archivo local
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      txrSource = { type: 'file', data: file, name: file.name };
      setSourceSelected(`📂 ${file.name}`);
    });

    // Soporte Drag & Drop
    const dropZone = document.getElementById('txr-drop-zone');
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.style.borderColor = 'var(--neon-cyan)';
          dropZone.style.background = 'rgba(0, 206, 201, 0.12)';
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.style.borderColor = 'rgba(0, 206, 201, 0.4)';
          dropZone.style.background = 'var(--bg-elevated)';
        });
      });
      dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          const file = dt.files[0];
          txrSource = { type: 'file', data: file, name: file.name };
          setSourceSelected(`📂 ${file.name}`);
        }
      });
    }

    function setSourceSelected(label) {
      srcLabel.textContent = label;
      selectedSrc.style.display = 'block';
      btnStart.disabled = false;
      selectedSrc.style.background = 'rgba(0,206,201,0.12)';
      setTimeout(() => { selectedSrc.style.background = 'var(--bg-elevated)'; }, 600);
    }

    // Idioma
    langBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        langBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        txrLang = btn.getAttribute('data-lang');
      });
    });

    function setProgress(pct, msg) {
      progressWrap.style.display = 'block';
      progressBar.style.width    = `${pct}%`;
      progressMsg.textContent    = msg || '';
      progressPct.textContent    = `${Math.round(pct)}%`;
    }

    // Botón transcribir
    btnStart.addEventListener('click', async () => {
      if (!txrSource) {
        showToast('Selecciona una fuente de audio primero', 'error');
        return;
      }
      btnStart.disabled    = true;
      btnLabel.textContent = '⏳ Transcribiendo...';
      resultSection.style.display = 'none';
      progressWrap.style.display  = 'block';
      setProgress(5, 'Preparando motor de IA Whisper...');

      const t0 = Date.now();

      await window.Transcriber.transcribe(
        txrSource.data,
        txrLang,
        {
          onStatus:   (msg, pct) => setProgress(pct || 10, msg),
          onProgress: (pct, msg) => setProgress(pct, msg),
          onResult: (res) => {
            txrResult = res;
            renderResult(res, txrSource.name, Date.now() - t0);
            btnStart.disabled    = false;
            btnLabel.textContent = '🎤 Transcribir Audio';
            showToast('¡Transcripción completada!', 'success');
          },
          onError: (errMsg) => {
            showToast(errMsg, 'error');
            progressWrap.style.display = 'none';
            btnStart.disabled    = false;
            btnLabel.textContent = '🎤 Transcribir Audio';
          }
        }
      );
    });

    function renderResult(res, sourceName, elapsedMs) {
      plainView.textContent = res.text || '(Sin texto detectado)';

      tsView.innerHTML = '';
      if (res.chunks && res.chunks.length > 0) {
        res.chunks.forEach(chunk => {
          const start = window.Transcriber.formatTime(chunk.timestamp && chunk.timestamp[0]);
          const end   = window.Transcriber.formatTime(chunk.timestamp && chunk.timestamp[1]);
          const row   = document.createElement('div');
          row.style.cssText = 'display:flex;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:14px;';
          row.innerHTML = `
            <span style="color:var(--neon-cyan);min-width:96px;font-family:monospace;font-size:12px;padding-top:2px;">${start} → ${end}</span>
            <span style="color:var(--text-main);line-height:1.6;">${chunk.text || ''}</span>
          `;
          tsView.appendChild(row);
        });
      } else {
        tsView.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:10px 0;">No hay timestamps disponibles para este audio.</p>';
      }

      const wordCount = (res.text || '').split(/\s+/).filter(Boolean).length;
      const elapsed   = (elapsedMs / 1000).toFixed(1);
      statsEl.innerHTML = `
        <span>📊 <strong>${wordCount}</strong> palabras</span>
        <span>📄 <strong>${(res.text || '').length}</strong> caracteres</span>
        <span>⏱️ Tardó <strong>${elapsed}s</strong></span>
        <span>🎙️ <strong>${sourceName.substring(0, 28)}</strong></span>
      `;

      resultSection.style.display = 'block';
      progressWrap.style.display  = 'none';
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    btnToggleTs.addEventListener('click', () => {
      tsVisible = !tsVisible;
      plainView.style.display = tsVisible ? 'none'  : 'block';
      tsView.style.display    = tsVisible ? 'block' : 'none';
      btnToggleTs.textContent = tsVisible ? '📝 Texto plano' : '🕐 Timestamps';
    });

    btnCopy.addEventListener('click', () => {
      if (!txrResult) return;
      navigator.clipboard.writeText(txrResult.text).then(() => {
        showToast('Transcripción copiada al portapapeles ✅', 'success');
      }).catch(() => {
        showToast('No se pudo copiar. Selecciona el texto manualmente.', 'error');
      });
    });

    btnDownTxt.addEventListener('click', () => {
      if (!txrResult) return;
      const name    = txrSource ? txrSource.name.replace(/\.[^.]+$/, '') : 'Transcripcion';
      const content = `TRANSCRIPCIÓN: ${name}\nFecha: ${new Date().toLocaleString()}\n\n${txrResult.text}`;
      const blob    = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url     = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      a.href = url; a.download = `${name} - Transcripcion.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Archivo .TXT descargado', 'success');
    });

  })(); // fin initTranscriber

  // Botón directo para ir a la pestaña Cortador desde la tarjeta de canción
  const btnGotoTrimmerSong = document.getElementById('btn-goto-trimmer-song');
  if (btnGotoTrimmerSong) {
    btnGotoTrimmerSong.addEventListener('click', () => {
      const trimmerTabBtn = document.querySelector('.nav-tab-btn[data-tab="tab-trimmer"]');
      if (trimmerTabBtn) trimmerTabBtn.click();
      if (window._trimmerLoadSuno) window._trimmerLoadSuno();
    });
  }

  // ============================================================
  //  CORTADOR DE AUDIO & GENERADOR DE MUESTRAS — Controlador UI
  // ============================================================
  (function initTrimmer() {
    const sunoUrlInput     = document.getElementById('trimmer-suno-url');
    const btnPasteClip     = document.getElementById('trimmer-btn-paste-clipboard');
    const btnFetchUrl      = document.getElementById('trimmer-btn-fetch-url');
    const btnUseSuno       = document.getElementById('trimmer-btn-use-suno');
    const sunoNameEl       = document.getElementById('trimmer-suno-name');
    const fileInput        = document.getElementById('trimmer-file-input');
    const dropZone         = document.getElementById('trimmer-drop-zone');
    const selectedSrc      = document.getElementById('trimmer-selected-source');
    const srcLabel         = document.getElementById('trimmer-source-label');
    const presetBtns       = document.querySelectorAll('.trimmer-preset-btn');
    const startSlider      = document.getElementById('trimmer-start-slider');
    const endSlider        = document.getElementById('trimmer-end-slider');
    const startValEl       = document.getElementById('trimmer-start-val');
    const endValEl         = document.getElementById('trimmer-end-val');
    const durValEl         = document.getElementById('trimmer-duration-val');
    const startLabel       = document.getElementById('trimmer-start-label');
    const endLabel         = document.getElementById('trimmer-end-label');
    const btnPreview       = document.getElementById('trimmer-btn-preview');
    const previewStatus    = document.getElementById('trimmer-preview-status');
    const chkWatermarkSound = document.getElementById('trimmer-chk-watermark-sound');
    const coverCanvas      = document.getElementById('trimmer-cover-canvas');
    const watermarkTextInp = document.getElementById('trimmer-watermark-text');
    const customWatermarkInp = document.getElementById('trimmer-custom-watermark-input');
    const btnResetWatermark = document.getElementById('trimmer-btn-reset-watermark');
    const btnDlMp3         = document.getElementById('trimmer-btn-download-mp3');
    const btnDlWav         = document.getElementById('trimmer-btn-download-wav');
    const btnDlCover       = document.getElementById('trimmer-btn-download-cover');
    const progressWrap     = document.getElementById('trimmer-progress-wrap');
    const progressMsg      = document.getElementById('trimmer-progress-msg');
    const progressPct      = document.getElementById('trimmer-progress-pct');
    const progressBar      = document.getElementById('trimmer-progress-bar');

    let currentAudioBuffer = null;
    let currentSourceInfo  = null;
    let previewAudioCtx    = null;
    let previewSourceNode  = null;
    let isPreviewPlaying   = false;
    let customWatermarkImg = null;
    let coverBaseUrl       = 'assets/logo.jpg';

    function formatSecs(sec) {
      const s = Math.max(0, Math.floor(sec || 0));
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${m}:${rem < 10 ? '0' : ''}${rem}`;
    }

    function setProgress(pct, msg) {
      progressWrap.style.display = 'block';
      progressBar.style.width    = `${pct}%`;
      progressMsg.textContent    = msg || '';
      progressPct.textContent    = `${Math.round(pct)}%`;
    }

    window._trimmerNotifySong = (song) => {
      if (song) {
        sunoNameEl.textContent = `${song.title} — listo para recortar`;
        btnUseSuno.style.borderColor = 'var(--neon-purple)';
      }
    };

    window._trimmerLoadSuno = () => {
      if (currentSong) loadSunoTrack();
    };

    async function loadSunoTrack() {
      if (!currentSong) {
        showToast('Primero busca o reproduce una canción en la pestaña Individual', 'error');
        return;
      }
      coverBaseUrl = currentSong.imageUrl || 'assets/logo.jpg';
      currentSourceInfo = {
        name: currentSong.title,
        coverUrl: coverBaseUrl
      };
      setSourceSelected(`🎵 ${currentSong.title}`);
      await decodeAndSetupAudio(currentSong.videoUrl || currentSong.audioUrl);
    }

    // Cargar directamente pegando enlace o ID de Suno
    async function loadSunoTrackFromUrl(rawInput) {
      const input = (rawInput || '').trim();
      if (!input) {
        showToast('Por favor escribe o pega un enlace de Suno', 'warning');
        return;
      }
      if (!SunoService.isValidInput(input)) {
        showToast('El enlace o ID ingresado no es válido para Suno', 'error');
        return;
      }

      if (btnFetchUrl) {
        btnFetchUrl.disabled = true;
        btnFetchUrl.innerHTML = '<span>⏳</span> Obteniendo...';
      }
      previewStatus.textContent = 'Consultando datos de la canción en Suno...';

      try {
        const songData = await SunoService.resolveSong(input, (msg) => {
          previewStatus.textContent = msg;
        });

        currentSong = songData;
        window._trimmerNotifySong?.(songData);

        coverBaseUrl = songData.imageUrl || 'assets/logo.jpg';
        currentSourceInfo = {
          name: songData.title,
          coverUrl: coverBaseUrl
        };
        setSourceSelected(`🎵 ${songData.title} (${songData.artist || 'Suno'})`);

        await decodeAndSetupAudio(songData.videoUrl || songData.audioUrl);
        showToast(`¡"${songData.title}" cargada y lista para recortar!`, 'success');
      } catch (err) {
        console.error('Error cargando enlace en cortador:', err);
        previewStatus.textContent = 'Error al cargar canción desde Suno.';
        showToast(err.message || 'No se pudo obtener el audio de Suno', 'error');
      } finally {
        if (btnFetchUrl) {
          btnFetchUrl.disabled = false;
          btnFetchUrl.innerHTML = '<span>⚡</span> Cargar Canción';
        }
      }
    }

    // Listeners para la entrada de enlace directo
    if (btnFetchUrl) {
      btnFetchUrl.addEventListener('click', () => {
        loadSunoTrackFromUrl(sunoUrlInput ? sunoUrlInput.value : '');
      });
    }

    if (sunoUrlInput) {
      sunoUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          loadSunoTrackFromUrl(sunoUrlInput.value);
        }
      });

      // Auto-cargar automáticamente al pegar el enlace
      sunoUrlInput.addEventListener('paste', (e) => {
        const pasted = (e.clipboardData || window.clipboardData)?.getData('text');
        if (pasted && SunoService.isValidInput(pasted.trim())) {
          setTimeout(() => {
            loadSunoTrackFromUrl(pasted.trim());
          }, 60);
        }
      });
    }

    // Botón portapapeles
    if (btnPasteClip) {
      btnPasteClip.addEventListener('click', async () => {
        try {
          const clipText = await navigator.clipboard.readText();
          if (clipText && clipText.trim()) {
            if (sunoUrlInput) sunoUrlInput.value = clipText.trim();
            showToast('Enlace pegado del portapapeles', 'info');
            if (SunoService.isValidInput(clipText.trim())) {
              loadSunoTrackFromUrl(clipText.trim());
            }
          } else {
            showToast('El portapapeles no tiene texto', 'warning');
          }
        } catch (err) {
          if (sunoUrlInput) sunoUrlInput.focus();
          showToast('Presiona Ctrl+V para pegar el enlace aquí', 'info');
        }
      });
    }

    btnUseSuno.addEventListener('click', loadSunoTrack);

    // Archivo local
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      currentSourceInfo = { name: file.name.replace(/\.[^.]+$/, ''), coverUrl: 'assets/logo.jpg' };
      setSourceSelected(`📂 ${file.name}`);
      const arrayBuffer = await file.arrayBuffer();
      await decodeAudioArrayBuffer(arrayBuffer, file.name);
    });

    // Drag & Drop
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(ev => {
        dropZone.addEventListener(ev, (e) => {
          e.preventDefault(); e.stopPropagation();
          dropZone.style.borderColor = 'var(--neon-purple)';
          dropZone.style.background = 'rgba(108,92,231,0.15)';
        });
      });
      ['dragleave', 'drop'].forEach(ev => {
        dropZone.addEventListener(ev, (e) => {
          e.preventDefault(); e.stopPropagation();
          dropZone.style.borderColor = 'rgba(108,92,231,0.4)';
          dropZone.style.background = 'var(--bg-elevated)';
        });
      });
      dropZone.addEventListener('drop', async (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          const file = dt.files[0];
          currentSourceInfo = { name: file.name.replace(/\.[^.]+$/, ''), coverUrl: 'assets/logo.jpg' };
          setSourceSelected(`📂 ${file.name}`);
          const arrayBuffer = await file.arrayBuffer();
          await decodeAudioArrayBuffer(arrayBuffer, file.name);
        }
      });
    }

    function setSourceSelected(label) {
      srcLabel.textContent = label;
      selectedSrc.style.display = 'block';
    }

    async function decodeAndSetupAudio(url) {
      previewStatus.textContent = 'Descargando y preparando audio para edición...';
      btnPreview.disabled = true;
      btnDlMp3.disabled   = true;
      btnDlWav.disabled   = true;
      try {
        let arrayBuf;
        const isMangoAudio = (currentSong && (currentSong.isMango || currentSong.audioUrl?.includes('cloudfront.net'))) || 
                             (url && (url.includes('cloudfront.net') || url.includes('forbidden')));

        if (isMangoAudio && currentSong && currentSong.id) {
          previewStatus.textContent = 'Descifrando stream seguro de Suno (DRM Mango)...';
          const mediaUrl = (currentSong.audioUrl && !currentSong.audioUrl.includes('forbidden')) 
            ? currentSong.audioUrl 
            : `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${currentSong.id}.m4a`;
          
          const decryptedBlob = await SunoService.decryptMangoAudio(currentSong.id, mediaUrl, (msg) => {
            previewStatus.textContent = msg;
          });
          currentSong.decryptedBlob = decryptedBlob;
          currentSong.decryptedBlobUrl = URL.createObjectURL(decryptedBlob);
          arrayBuf = await decryptedBlob.arrayBuffer();
        } else {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          arrayBuf = await res.arrayBuffer();
        }
        await decodeAudioArrayBuffer(arrayBuf, currentSourceInfo ? currentSourceInfo.name : 'Pista');
      } catch (err) {
        console.error('Error al decodificar audio de Suno:', err);
        previewStatus.textContent = `Error: ${err.message || 'No se pudo cargar el audio'}.`;
        showToast(err.message || 'Error al descargar el audio para edición', 'error');
      }
    }

    async function decodeAudioArrayBuffer(arrayBuf, name) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      try {
        previewStatus.textContent = 'Decodificando ondas de audio...';
        currentAudioBuffer = await ctx.decodeAudioData(arrayBuf);
        const total = currentAudioBuffer.duration;
        startSlider.max = total;
        endSlider.max = total;
        startSlider.value = 0;
        endSlider.value = Math.min(30, total);
        updateTimes();

        btnPreview.disabled = false;
        btnDlMp3.disabled   = false;
        btnDlWav.disabled   = false;
        previewStatus.textContent = `Listo para recortar (${formatSecs(total)} en total)`;
        showToast(`Audio "${name}" listo para recortar`, 'success');
        renderCoverPreview();
      } catch (err) {
        console.error('Error decodificando buffer:', err);
        previewStatus.textContent = 'Formato no soportado por el navegador.';
        showToast('No se pudo decodificar el archivo de audio', 'error');
      }
    }

    function updateTimes() {
      let st = parseFloat(startSlider.value) || 0;
      let en = parseFloat(endSlider.value) || 0;

      if (st >= en) {
        if (en < (parseFloat(startSlider.max) || 100)) {
          en = Math.min(parseFloat(startSlider.max), st + 1);
          endSlider.value = en;
        } else {
          st = Math.max(0, en - 1);
          startSlider.value = st;
        }
      }

      const dur = Math.max(0, en - st);
      startValEl.textContent   = formatSecs(st);
      endValEl.textContent     = formatSecs(en);
      durValEl.textContent     = `${dur.toFixed(1)}s`;
      startLabel.textContent   = formatSecs(st);
      endLabel.textContent     = formatSecs(en);
      btnPreview.textContent   = `▶️ Escuchar Muestra (${dur.toFixed(0)}s)`;
    }

    startSlider.addEventListener('input', updateTimes);
    endSlider.addEventListener('input', updateTimes);

    // Presets
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (!currentAudioBuffer) return;

        const dur = btn.getAttribute('data-duration');
        const total = currentAudioBuffer.duration;
        let st = parseFloat(startSlider.value) || 0;

        if (dur === 'all') {
          startSlider.value = 0;
          endSlider.value = total;
        } else {
          const addSec = parseFloat(dur);
          if (st + addSec > total) {
            st = Math.max(0, total - addSec);
            startSlider.value = st;
          }
          endSlider.value = Math.min(total, st + addSec);
        }
        updateTimes();
      });
    });

    // Preescucha
    btnPreview.addEventListener('click', () => {
      if (isPreviewPlaying) {
        stopPreview();
      } else {
        startPreview();
      }
    });

    function startPreview() {
      if (!currentAudioBuffer) return;
      stopPreview();

      const st = parseFloat(startSlider.value) || 0;
      const en = parseFloat(endSlider.value) || 0;
      const dur = Math.max(0.1, en - st);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      previewAudioCtx = new AudioContextClass();
      previewSourceNode = previewAudioCtx.createBufferSource();
      previewSourceNode.buffer = currentAudioBuffer;
      previewSourceNode.connect(previewAudioCtx.destination);

      previewSourceNode.start(0, st, dur);
      isPreviewPlaying = true;
      btnPreview.textContent = '⏸️ Detener Preescucha';
      btnPreview.style.background = 'rgba(255,107,107,0.2)';
      btnPreview.style.borderColor = '#ff6b6b';
      btnPreview.style.color = '#ff6b6b';
      previewStatus.textContent = `Reproduciendo de ${formatSecs(st)} a ${formatSecs(en)}...`;

      previewSourceNode.onended = () => {
        stopPreview();
      };
    }

    function stopPreview() {
      if (previewSourceNode) {
        try { previewSourceNode.stop(); } catch (e) {}
        previewSourceNode.disconnect();
        previewSourceNode = null;
      }
      if (previewAudioCtx) {
        try { previewAudioCtx.close(); } catch (e) {}
        previewAudioCtx = null;
      }
      isPreviewPlaying = false;
      btnPreview.style.background = '';
      btnPreview.style.borderColor = 'var(--neon-cyan)';
      btnPreview.style.color = 'var(--neon-cyan)';
      updateTimes();
      previewStatus.textContent = 'Preescucha detenida';
    }

    // Carátula de Muestra
    async function renderCoverPreview() {
      const text = watermarkTextInp.value.trim() || 'MUESTRA DEMO';
      try {
        const blob = await window.AudioTrimmer.generateWatermarkedCoverBlob(
          coverBaseUrl,
          customWatermarkImg,
          text
        );
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const ctx = coverCanvas.getContext('2d');
          ctx.clearRect(0, 0, coverCanvas.width, coverCanvas.height);
          ctx.drawImage(img, 0, 0, coverCanvas.width, coverCanvas.height);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      } catch (err) {
        console.error('Error al generar portada de muestra:', err);
      }
    }

    watermarkTextInp.addEventListener('input', () => {
      renderCoverPreview();
    });

    customWatermarkInp.addEventListener('change', () => {
      const file = customWatermarkInp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          customWatermarkImg = img;
          btnResetWatermark.style.display = 'inline-block';
          renderCoverPreview();
          showToast('Imagen de muestra personalizada cargada', 'success');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });

    btnResetWatermark.addEventListener('click', () => {
      customWatermarkImg = null;
      customWatermarkInp.value = '';
      btnResetWatermark.style.display = 'none';
      renderCoverPreview();
      showToast('Sello predeterminado restaurado', 'info');
    });

    // Descarga de Carátula Muestra
    btnDlCover.addEventListener('click', async () => {
      const text = watermarkTextInp.value.trim() || 'MUESTRA DEMO';
      try {
        const blob = await window.AudioTrimmer.generateWatermarkedCoverBlob(
          coverBaseUrl,
          customWatermarkImg,
          text
        );
        const base = currentSourceInfo ? currentSourceInfo.name : 'Suno';
        const filename = `${base} - Portada MUESTRA.jpg`;
        window.AudioDownloader.triggerBrowserDownload(blob, filename);
        showToast('Carátula con sello descargada ✅', 'success');
      } catch (err) {
        showToast('Error al descargar la carátula', 'error');
      }
    });

    // Descarga de Audio Muestra (MP3 o WAV)
    async function processAndDownloadAudio(format) {
      if (!currentAudioBuffer) {
        showToast('Carga un audio primero', 'error');
        return;
      }
      stopPreview();

      const st = parseFloat(startSlider.value) || 0;
      const en = parseFloat(endSlider.value) || 0;
      const dur = Math.max(0.1, en - st);

      btnDlMp3.disabled = true;
      btnDlWav.disabled = true;
      progressWrap.style.display = 'block';
      setProgress(10, `Recortando fragmento de ${dur.toFixed(1)} segundos...`);

      const base = currentSourceInfo ? currentSourceInfo.name : 'Pista';
      const applySoundWatermark = chkWatermarkSound.checked;

      setTimeout(async () => {
        try {
          // 1. Recortar buffer
          let sliced = window.AudioTrimmer.sliceAudioBuffer(currentAudioBuffer, st, en);

          // 2. Marca sonora opcional
          if (applySoundWatermark) {
            setProgress(30, 'Inyectando marcas de protección sonora...');
            sliced = window.AudioTrimmer.applyAudioWatermark(sliced, 10);
          }

          // 3. Codificar según formato
          if (format === 'mp3') {
            setProgress(50, 'Codificando MP3 a 320kbps...');
            const mp3Blob = await window.AudioDownloader.encodeMp3WithLame(sliced, (pct, msg) => {
              setProgress(pct, msg);
            });
            const filename = `${base} - MUESTRA DEMO (${dur.toFixed(0)}s).mp3`;
            window.AudioDownloader.triggerBrowserDownload(mp3Blob, filename);
          } else {
            setProgress(70, 'Generando archivo WAV sin pérdida...');
            const wavBlob = window.AudioDownloader.audioBufferToWav(sliced);
            const filename = `${base} - MUESTRA DEMO (${dur.toFixed(0)}s).wav`;
            window.AudioDownloader.triggerBrowserDownload(wavBlob, filename);
          }

          setProgress(100, '¡Muestra exportada con éxito!');
          setTimeout(() => { progressWrap.style.display = 'none'; }, 2500);
          showToast(`¡Muestra ${format.toUpperCase()} descargada para tu cliente!`, 'success');
        } catch (err) {
          console.error('Error al exportar muestra:', err);
          showToast('Error al exportar la muestra de audio', 'error');
          progressWrap.style.display = 'none';
        } finally {
          btnDlMp3.disabled = false;
          btnDlWav.disabled = false;
        }
      }, 50);
    }

    btnDlMp3.addEventListener('click', () => processAndDownloadAudio('mp3'));
    btnDlWav.addEventListener('click', () => processAndDownloadAudio('wav'));

    // Inicializar carátula por defecto
    renderCoverPreview();
  })(); // fin initTrimmer

});

