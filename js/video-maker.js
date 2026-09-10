/**
 * SunoWave Studio - Generador de Mini Videos (Video Maker / Reels / TikTok)
 * Combina canciones y carátulas con visualizador reactivo, efectos y exportación individual o por lotes.
 */

class SunoVideoMaker {
  constructor() {
    this.canvas = document.getElementById('vm-preview-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = 'anonymous';

    // Estado actual
    this.currentCoverImage = null;
    this.currentCoverUrl = null;
    this.currentAudioUrl = null;
    this.currentSongTitle = 'Mi Canción Suno';
    this.currentArtist = 'by ORFEX';

    // Ajustes de video
    this.aspectRatio = 'vertical'; // 'vertical' (9:16), 'square' (1:1), 'horizontal' (16:9)
    this.theme = 'neon-wave'; // 'neon-wave', 'circular-pulse', 'vinyl-spin', 'particles'
    this.clipDuration = 30; // 15, 30, 60, o 'full'
    this.watermarkEnabled = true;

    // Web Audio API
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
    this.audioSourceNode = null;
    this.destStream = null;

    // Render loop & grabador
    this.animationFrameId = null;
    this.rotationAngle = 0;
    this.isPlaying = false;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];

    // Cola por lotes
    this.batchQueue = [];
    this.isBatchProcessing = false;

    this.init();
  }

  init() {
    if (!this.canvas) return;

    this.setupEventListeners();
    this.updateCanvasDimensions();
    this.loadDefaultDemo();
  }

  setupEventListeners() {
    // 1. Selector de Aspect Ratio
    const aspectBtns = document.querySelectorAll('.aspect-btn');
    aspectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        aspectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.aspectRatio = btn.getAttribute('data-ratio');

        const container = document.getElementById('vm-canvas-container');
        if (container) {
          container.className = `vm-canvas-container ratio-${this.aspectRatio}`;
        }
        this.updateCanvasDimensions();
      });
    });

    // 2. Selector de Tema Visual
    const themeBtns = document.querySelectorAll('.vm-theme-btn');
    themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        themeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.theme = btn.getAttribute('data-theme');
      });
    });

    // 3. Duración del clip
    const durationBtns = document.querySelectorAll('.vm-dur-btn');
    durationBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        durationBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const d = btn.getAttribute('data-duration');
        this.clipDuration = d === 'full' ? 'full' : parseInt(d, 10);
      });
    });

    // 4. Subida individual de Carátula
    const coverInput = document.getElementById('vm-cover-input');
    if (coverInput) {
      coverInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            this.setCoverImage(ev.target.result);
            const label = document.getElementById('vm-cover-label');
            if (label) label.textContent = file.name;
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // 5. Subida individual de Audio
    const audioInput = document.getElementById('vm-audio-input');
    if (audioInput) {
      audioInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const url = URL.createObjectURL(file);
          const cleanName = file.name.replace(/\.[^/.]+$/, '');
          this.setAudioSource(url, cleanName);
          const label = document.getElementById('vm-audio-label');
          if (label) label.textContent = file.name;
          
          const titleInput = document.getElementById('vm-title-input');
          if (titleInput && (!titleInput.value || titleInput.value === 'Mi Canción Suno')) {
            titleInput.value = cleanName;
            this.currentSongTitle = cleanName;
          }
        }
      });
    }

    // 6. Botón: Usar canción actual de Suno
    const btnUseSuno = document.getElementById('vm-btn-use-suno');
    if (btnUseSuno) {
      btnUseSuno.addEventListener('click', () => {
        if (window.currentActiveSong) {
          const s = window.currentActiveSong;
          if (s.albumArt) this.setCoverImage(s.albumArt);
          if (s.audioUrl) {
            this.setAudioSource(s.audioUrl, s.title || 'Suno Track');
          }
          if (s.title) {
            this.currentSongTitle = s.title;
            const titleInput = document.getElementById('vm-title-input');
            if (titleInput) titleInput.value = s.title;
          }
          if (s.creator) {
            this.currentArtist = s.creator;
            const artistInput = document.getElementById('vm-artist-input');
            if (artistInput) artistInput.value = s.creator;
          }
          if (window.showToast) window.showToast('¡Canción y carátula de Suno importadas al Video Maker!', 'success');
        } else {
          if (window.showToast) window.showToast('Primero analiza una canción en la pestaña Individual.', 'info');
        }
      });
    }

    // 7. Inputs de texto dinámico
    const titleInput = document.getElementById('vm-title-input');
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        this.currentSongTitle = e.target.value || 'Mi Canción Suno';
      });
    }

    const artistInput = document.getElementById('vm-artist-input');
    if (artistInput) {
      artistInput.addEventListener('input', (e) => {
        this.currentArtist = e.target.value || 'by ORFEX';
      });
    }

    // 8. Botón Play / Previsualizar
    const btnPlay = document.getElementById('vm-btn-preview-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        this.togglePlay();
      });
    }

    // 9. Botón Exportar Video Individual
    const btnExport = document.getElementById('vm-btn-export-video');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        this.exportCurrentVideo();
      });
    }

    // 10. Lotes / Batch: Subida múltiple
    const batchAudiosInput = document.getElementById('vm-batch-audios-input');
    const batchCoversInput = document.getElementById('vm-batch-covers-input');
    const btnAddBatch = document.getElementById('vm-btn-add-batch');
    const btnStartBatch = document.getElementById('vm-btn-start-batch');
    const btnClearBatch = document.getElementById('vm-btn-clear-batch');

    if (btnAddBatch) {
      btnAddBatch.addEventListener('click', () => {
        this.addFilesToBatchQueue(
          batchAudiosInput ? batchAudiosInput.files : null,
          batchCoversInput ? batchCoversInput.files : null
        );
      });
    }

    if (btnStartBatch) {
      btnStartBatch.addEventListener('click', () => {
        this.startBatchProcessing();
      });
    }

    if (btnClearBatch) {
      btnClearBatch.addEventListener('click', () => {
        this.batchQueue = [];
        this.renderBatchTable();
      });
    }

    // Al terminar el audio nativo
    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      const btn = document.getElementById('vm-btn-preview-play');
      if (btn) btn.innerHTML = '<span>▶️</span> Previsualizar Video';
    });
  }

  updateCanvasDimensions() {
    if (!this.canvas) return;
    if (this.aspectRatio === 'vertical') {
      // 1080 x 1920 (9:16)
      this.canvas.width = 720;
      this.canvas.height = 1280;
    } else if (this.aspectRatio === 'square') {
      // 1080 x 1080 (1:1)
      this.canvas.width = 800;
      this.canvas.height = 800;
    } else {
      // 1920 x 1080 (16:9)
      this.canvas.width = 1280;
      this.canvas.height = 720;
    }
    this.drawFrame();
  }

  loadDefaultDemo() {
    // Carátula inicial por defecto
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'assets/logo.jpg';
    img.onload = () => {
      this.currentCoverImage = img;
      this.currentCoverUrl = 'assets/logo.jpg';
      this.drawFrame();
    };
  }

  setCoverImage(urlOrBase64) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = urlOrBase64;
    img.onload = () => {
      this.currentCoverImage = img;
      this.currentCoverUrl = urlOrBase64;
      this.drawFrame();
    };
  }

  setAudioSource(url, name = 'Suno Track') {
    this.currentAudioUrl = url;
    this.audioElement.src = url;
    this.initAudioContext();
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.audioSourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
      this.audioSourceNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }
  }

  togglePlay() {
    const btn = document.getElementById('vm-btn-preview-play');
    if (!this.currentAudioUrl) {
      if (window.showToast) window.showToast('Por favor sube un audio o importa una canción.', 'info');
      return;
    }

    if (this.isPlaying) {
      this.audioElement.pause();
      this.isPlaying = false;
      if (btn) btn.innerHTML = '<span>▶️</span> Previsualizar Video';
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      this.drawFrame();
    } else {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.audioElement.play().then(() => {
        this.isPlaying = true;
        if (btn) btn.innerHTML = '<span>⏸️</span> Pausar';
        this.startRenderLoop();
      }).catch(err => {
        console.warn('Play error:', err);
      });
    }
  }

  startRenderLoop() {
    const render = () => {
      if (!this.isPlaying && !this.isRecording) return;
      this.drawFrame();
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Renderiza un frame completo en el Canvas con estética premium
   */
  drawFrame() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Obtener datos de audio si está reproduciéndose
    let bassIntensity = 0;
    let freqData = null;

    if (this.analyser && this.dataArray && (this.isPlaying || this.isRecording)) {
      this.analyser.getByteFrequencyData(this.dataArray);
      freqData = this.dataArray;

      // Calcular intensidad de bajos (primeras 8 frecuencias)
      let sum = 0;
      for (let i = 0; i < 8; i++) {
        sum += this.dataArray[i];
      }
      bassIntensity = sum / (8 * 255); // 0 a 1
    }

    // 1. Fondo Oscuro Profundo
    ctx.fillStyle = '#090a14';
    ctx.fillRect(0, 0, W, H);

    // 2. Fondo Ambiental Desenfocado de la Carátula
    if (this.currentCoverImage && this.currentCoverImage.complete) {
      ctx.save();
      ctx.globalAlpha = 0.35 + (bassIntensity * 0.15);
      
      // Ligero zoom suave con el bajo
      const zoom = 1.05 + (bassIntensity * 0.06);
      const bgW = W * zoom;
      const bgH = H * zoom;
      const bgX = (W - bgW) / 2;
      const bgY = (H - bgH) / 2;

      ctx.filter = 'blur(35px)';
      ctx.drawImage(this.currentCoverImage, bgX, bgY, bgW, bgH);
      ctx.restore();
    }

    // Degradado radial oscuro superior e inferior
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(5, 7, 15, 0.7)');
    grad.addColorStop(0.5, 'rgba(5, 7, 15, 0.2)');
    grad.addColorStop(1, 'rgba(5, 7, 15, 0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 3. Renderizar según el Aspect Ratio y Posicionamiento
    const centerX = W / 2;
    let centerY = H / 2 - 40;
    let coverSize = Math.min(W * 0.68, H * 0.42);

    if (this.aspectRatio === 'square') {
      centerY = H / 2 - 30;
      coverSize = W * 0.58;
    } else if (this.aspectRatio === 'horizontal') {
      centerX = W * 0.32;
      centerY = H / 2;
      coverSize = H * 0.65;
    }

    // Efecto de pulso con el bajo en la carátula
    const pulseScale = 1 + (bassIntensity * 0.08);
    const renderSize = coverSize * pulseScale;

    // Resplandor Neón detrás de la carátula
    ctx.save();
    ctx.shadowColor = 'rgba(0, 206, 201, ' + (0.4 + bassIntensity * 0.5) + ')';
    ctx.shadowBlur = 30 + (bassIntensity * 40);

    if (this.theme === 'vinyl-spin') {
      // Modo Disco de Vinilo Giratorio
      this.rotationAngle += 0.015;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(this.rotationAngle);

      // Disco vinilo negro exterior
      const vinylRadius = (renderSize / 2) * 1.35;
      ctx.beginPath();
      ctx.arc(0, 0, vinylRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0c0d13';
      ctx.fill();
      ctx.strokeStyle = '#222638';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Surcos del vinilo
      for (let r = vinylRadius * 0.75; r < vinylRadius * 0.95; r += 12) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Carátula circular en el centro
      if (this.currentCoverImage && this.currentCoverImage.complete) {
        ctx.beginPath();
        ctx.arc(0, 0, renderSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(this.currentCoverImage, -renderSize / 2, -renderSize / 2, renderSize, renderSize);
        
        // Agujero central del vinilo
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#090a14';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Modo Carátula Flotante con esquinas redondeadas
      const x = centerX - renderSize / 2;
      const y = centerY - renderSize / 2;
      const radius = 24;

      ctx.beginPath();
      ctx.roundRect(x, y, renderSize, renderSize, radius);
      ctx.fillStyle = '#141726';
      ctx.fill();

      if (this.currentCoverImage && this.currentCoverImage.complete) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, renderSize, renderSize, radius);
        ctx.clip();
        ctx.drawImage(this.currentCoverImage, x, y, renderSize, renderSize);
        ctx.restore();
      }

      // Borde sutil brillante
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    // 4. Visualizador de Ondas Reactivas
    this.drawVisualizerSpectrum(ctx, W, H, centerX, centerY, renderSize, freqData, bassIntensity);

    // 5. Textos y Metadatos (Título, Artista, by ORFEX)
    this.drawVideoTypography(ctx, W, H, centerX, centerY, renderSize);
  }

  drawVisualizerSpectrum(ctx, W, H, centerX, centerY, renderSize, freqData, bassIntensity) {
    if (!freqData) return;

    ctx.save();
    const count = Math.min(freqData.length, 36);

    if (this.theme === 'circular-pulse') {
      // Espectro Circular alrededor de la carátula
      const baseRadius = (renderSize / 2) + 20;
      const angleStep = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const angle = i * angleStep;
        const val = (freqData[i] / 255) * 60;
        const x1 = centerX + Math.cos(angle) * baseRadius;
        const y1 = centerY + Math.sin(angle) * baseRadius;
        const x2 = centerX + Math.cos(angle) * (baseRadius + val);
        const y2 = centerY + Math.sin(angle) * (baseRadius + val);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = i % 2 === 0 ? '#00cec9' : '#6c5ce7';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    } else {
      // Espectro de Ondas Neón en la parte inferior
      let specY = H * 0.76;
      let specWidth = W * 0.82;
      let startX = (W - specWidth) / 2;

      if (this.aspectRatio === 'horizontal') {
        startX = W * 0.58;
        specWidth = W * 0.36;
        specY = H * 0.72;
      }

      const barW = (specWidth / count) * 0.65;
      const gap = (specWidth / count) * 0.35;

      for (let i = 0; i < count; i++) {
        const val = (freqData[i] / 255) * (H * 0.12);
        const bx = startX + i * (barW + gap);
        const by = specY - val / 2;

        const barGrad = ctx.createLinearGradient(0, by, 0, by + val);
        barGrad.addColorStop(0, '#00cec9');
        barGrad.addColorStop(1, '#6c5ce7');

        ctx.fillStyle = barGrad;
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, Math.max(val, 4), 3);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawVideoTypography(ctx, W, H, centerX, centerY, renderSize) {
    ctx.save();
    ctx.textAlign = 'center';

    let textY = centerY + (renderSize / 2) + 48;
    let alignLeft = false;

    if (this.aspectRatio === 'horizontal') {
      centerX = W * 0.76;
      textY = H * 0.38;
      alignLeft = true;
      ctx.textAlign = 'left';
    }

    // Título de la Canción
    ctx.font = '800 ' + Math.round(W * 0.048) + 'px "Outfit", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    
    // Truncar si es muy largo
    let title = this.currentSongTitle;
    if (title.length > 28) title = title.substring(0, 26) + '...';
    ctx.fillText(title, centerX, textY);

    // Artista / Creador
    ctx.font = '600 ' + Math.round(W * 0.032) + 'px "Inter", sans-serif';
    ctx.fillStyle = '#00cec9';
    ctx.fillText(this.currentArtist, centerX, textY + (W * 0.055));

    // Badge Slogan / Marca
    if (this.watermarkEnabled) {
      const tagY = this.aspectRatio === 'vertical' ? H - 60 : H - 36;
      ctx.textAlign = 'center';
      ctx.font = '700 ' + Math.round(W * 0.024) + 'px "Outfit", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.letterSpacing = '1px';
      ctx.fillText('⚡ SUNOWAVE STUDIO · BY ORFEX', W / 2, tagY);
    }

    ctx.restore();
  }

  /**
   * Exporta el video actual grabando el Canvas + Audio a MP4 / WebM
   */
  async exportCurrentVideo() {
    if (!this.currentAudioUrl) {
      if (window.showToast) window.showToast('Por favor sube o selecciona un audio primero.', 'info');
      return;
    }

    const btnExport = document.getElementById('vm-btn-export-video');
    const progWrap = document.getElementById('vm-record-progress-wrap');
    const progFill = document.getElementById('vm-record-progress-fill');
    const progMsg = document.getElementById('vm-record-progress-msg');

    if (btnExport) btnExport.disabled = true;
    if (progWrap) progWrap.style.display = 'block';

    try {
      const blob = await this.renderVideoBlob((progress, statusText) => {
        if (progFill) progFill.style.width = `${progress}%`;
        if (progMsg) progMsg.textContent = statusText;
      });

      // Descargar el archivo generado
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const cleanTitle = (this.currentSongTitle || 'Suno_Video').replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${cleanTitle} - Mini Video (by ORFEX).${ext}`;

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (window.showToast) {
        window.showToast(`¡Video exportado con éxito! (${filename})`, 'success');
      }
    } catch (err) {
      console.error('Error al exportar video:', err);
      if (window.showToast) {
        window.showToast('Error al exportar video: ' + err.message, 'error');
      }
    } finally {
      if (btnExport) btnExport.disabled = false;
      setTimeout(() => {
        if (progWrap) progWrap.style.display = 'none';
      }, 2000);
    }
  }

  /**
   * Genera el Blob de video grabando el canvas en tiempo de audio
   */
  renderVideoBlob(onProgress) {
    return new Promise((resolve, reject) => {
      this.initAudioContext();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      // Preparar audio
      this.audioElement.currentTime = 0;
      const targetDuration = this.clipDuration === 'full' 
        ? (this.audioElement.duration || 30) 
        : Math.min(this.clipDuration, this.audioElement.duration || this.clipDuration);

      // Crear streams
      const canvasStream = this.canvas.captureStream(30); // 30 fps
      const audioDest = this.audioCtx.createMediaStreamDestination();
      this.audioSourceNode.connect(audioDest);

      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks()
      ]);

      // Seleccionar formato de codificación compatible
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
        mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
        mimeType = 'video/webm;codecs=h264,opus';
      }

      this.recordedChunks = [];
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 3500000 // 3.5 Mbps HD
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        this.isRecording = false;
        this.audioElement.pause();
        this.drawFrame();

        const blob = new Blob(this.recordedChunks, { type: mimeType });
        resolve(blob);
      };

      recorder.onerror = (err) => {
        this.isRecording = false;
        reject(err);
      };

      // Iniciar grabación y reproducción
      this.isRecording = true;
      recorder.start(200);
      this.audioElement.play();
      this.startRenderLoop();

      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const pct = Math.min(Math.round((elapsed / targetDuration) * 100), 100);
        if (onProgress) {
          onProgress(pct, `Renderizando video: ${Math.round(elapsed)}s / ${Math.round(targetDuration)}s (${pct}%)`);
        }

        if (elapsed >= targetDuration || this.audioElement.ended) {
          clearInterval(progressInterval);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 200);
    });
  }

  /**
   * Agrega pares de audios y carátulas a la cola por lotes
   */
  addFilesToBatchQueue(audioFiles, coverFiles) {
    if (!audioFiles || audioFiles.length === 0) {
      if (window.showToast) window.showToast('Selecciona al menos un archivo de audio para la cola.', 'info');
      return;
    }

    const defaultCover = this.currentCoverUrl || 'assets/logo.jpg';
    const coversList = coverFiles && coverFiles.length > 0 ? Array.from(coverFiles) : [];

    Array.from(audioFiles).forEach((aFile, index) => {
      // Asignar carátula por orden o usar la primera/actual
      let assignedCoverFile = null;
      if (coversList.length > index) {
        assignedCoverFile = coversList[index];
      } else if (coversList.length === 1) {
        assignedCoverFile = coversList[0];
      }

      const songTitle = aFile.name.replace(/\.[^/.]+$/, '');
      const item = {
        id: 'vm-item-' + Date.now() + '-' + index,
        audioFile: aFile,
        coverFile: assignedCoverFile,
        title: songTitle,
        artist: this.currentArtist || 'by ORFEX',
        status: 'pending', // 'pending', 'rendering', 'done', 'error'
        progress: 0,
        videoBlob: null
      };

      this.batchQueue.push(item);
    });

    this.renderBatchTable();
    if (window.showToast) {
      window.showToast(`¡${audioFiles.length} videos añadidos a la cola de procesamiento!`, 'success');
    }
  }

  renderBatchTable() {
    const tbody = document.getElementById('vm-batch-tbody');
    const emptyMsg = document.getElementById('vm-batch-empty');
    const countBadge = document.getElementById('vm-batch-count');

    if (countBadge) countBadge.textContent = `${this.batchQueue.length} videos`;
    if (!tbody) return;

    if (this.batchQueue.length === 0) {
      tbody.innerHTML = '';
      if (emptyMsg) emptyMsg.style.display = 'block';
      return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';
    tbody.innerHTML = '';

    this.batchQueue.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const statusHtml = item.status === 'done' 
        ? '<span class="batch-status-badge batch-status-done">✓ Listo</span>'
        : item.status === 'rendering'
        ? `<span class="batch-status-badge batch-status-rendering">⏳ ${item.progress}%</span>`
        : '<span class="batch-status-badge batch-status-pending">En espera</span>';

      const downloadBtn = item.videoBlob
        ? `<button class="btn-paste" style="padding:6px 12px; font-size:12px;" onclick="window.videoMaker.downloadBatchItem('${item.id}')">💾 Descargar</button>`
        : `<button class="btn-paste" style="padding:6px 12px; font-size:12px; opacity:0.4;" disabled>⏳</button>`;

      tr.innerHTML = `
        <td style="width: 40px; text-align:center; color:var(--text-muted);">${idx + 1}</td>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="font-size:24px;">🎵</div>
            <div>
              <div style="font-weight:700; color:#fff;">${item.title}</div>
              <div style="font-size:11px; color:var(--text-muted);">${item.artist} · ${(item.audioFile.size / (1024*1024)).toFixed(1)} MB</div>
            </div>
          </div>
          ${item.status === 'rendering' ? `<div class="vm-progress-track"><div class="vm-progress-fill" style="width:${item.progress}%"></div></div>` : ''}
        </td>
        <td>${statusHtml}</td>
        <td style="text-align:right;">${downloadBtn}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async startBatchProcessing() {
    if (this.isBatchProcessing) return;
    if (this.batchQueue.length === 0) {
      if (window.showToast) window.showToast('No hay videos en la cola por lotes.', 'info');
      return;
    }

    this.isBatchProcessing = true;
    const btnStart = document.getElementById('vm-btn-start-batch');
    if (btnStart) {
      btnStart.disabled = true;
      btnStart.innerHTML = '<span>⏳</span> Procesando Lotes...';
    }

    for (const item of this.batchQueue) {
      if (item.status === 'done') continue;

      item.status = 'rendering';
      this.renderBatchTable();

      try {
        // Cargar audio y carátula del item
        const audioUrl = URL.createObjectURL(item.audioFile);
        this.setAudioSource(audioUrl, item.title);
        this.currentSongTitle = item.title;
        this.currentArtist = item.artist;

        if (item.coverFile) {
          await new Promise(resolve => {
            const r = new FileReader();
            r.onload = (e) => {
              this.setCoverImage(e.target.result);
              resolve();
            };
            r.readAsDataURL(item.coverFile);
          });
        }

        // Renderizar video
        const blob = await this.renderVideoBlob((pct) => {
          item.progress = pct;
          this.renderBatchTable();
        });

        item.videoBlob = blob;
        item.status = 'done';
        this.renderBatchTable();
      } catch (err) {
        console.error('Error procesando lote:', err);
        item.status = 'error';
        this.renderBatchTable();
      }
    }

    this.isBatchProcessing = false;
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.innerHTML = '<span>🚀</span> Procesar Todos los Lotes';
    }

    if (window.showToast) {
      window.showToast('¡Procesamiento de videos por lotes finalizado!', 'success');
    }
  }

  downloadBatchItem(id) {
    const item = this.batchQueue.find(i => i.id === id);
    if (!item || !item.videoBlob) return;

    const ext = item.videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const cleanTitle = (item.title || 'Video').replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${cleanTitle} - Mini Video (by ORFEX).${ext}`;

    const url = URL.createObjectURL(item.videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// Inicializar globalmente
document.addEventListener('DOMContentLoaded', () => {
  window.videoMaker = new SunoVideoMaker();
});
