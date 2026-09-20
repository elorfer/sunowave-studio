/**
 * SunoWave - Audio Visualizer Studio (Ultra-Performant Vintage VU Meter)
 * Visualizador de espectro analógico vintage optimizado para alto rendimiento (60fps sin carga GPU/CPU)
 */

class AudioVisualizer {
  constructor(canvasId, audioElement) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.audio = audioElement;
    this.animationId = null;
    this.running = false;
    this.peaks = new Array(48).fill(0);
    this.tick = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    if (this.audio) {
      this.audio.addEventListener('play', () => this.startLoop());
      this.audio.addEventListener('pause', () => this.pauseLoop());
      this.audio.addEventListener('ended', () => this.pauseLoop());
    }

    // Renderizar marco estático inicial de reposo
    this.draw();
  }

  resize() {
    if (!this.canvas || !this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = 130 * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = 130;
    if (!this.running) {
      this.draw();
    }
  }

  startLoop() {
    if (this.running) return;
    this.running = true;
    const render = () => {
      if (!this.running) return;
      this.draw();
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }

  pauseLoop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.draw();
  }

  draw() {
    const { ctx, width, height, audio } = this;
    if (!ctx || !width || !height) return;

    ctx.clearRect(0, 0, width, height);

    const isPlaying = audio && !audio.paused && audio.currentTime > 0;
    const barCount = 48;
    const spacing = 3;
    const totalSpacing = spacing * (barCount - 1);
    const barWidth = Math.max(3, (width - totalSpacing) / barCount);

    this.tick += isPlaying ? 0.08 : 0.02;

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + spacing);
      
      let normalized = 0.08;
      if (isPlaying) {
        const bassFactor = Math.exp(-i / 8) * 1.4;
        const midFactor = Math.sin((i / barCount) * Math.PI) * 0.9;
        const trebleFactor = (i / barCount) * 0.7;

        const beatPulse = Math.sin(this.tick * 3 + (i % 4)) > 0.6 ? 0.35 : 0.0;
        const wave = Math.sin(i * 0.28 + this.tick * 2.2) * 0.5 + 0.5;
        const jitter = (Math.sin(i * 13.7 + this.tick * 5) * 0.5 + 0.5) * 0.25;

        normalized = Math.min(
          0.96,
          Math.max(0.1, (wave * 0.5 + jitter + beatPulse) * (bassFactor + midFactor + trebleFactor * 0.5))
        );
      } else {
        // En reposo: líneas sutiles y elegantes sin consumo de recursos
        normalized = (Math.sin(i * 0.2 + this.tick) * 0.5 + 0.5) * 0.12 + 0.05;
      }

      const barHeight = Math.max(4, normalized * (height * 0.88));
      const y = height - barHeight;

      if (barHeight > this.peaks[i]) {
        this.peaks[i] = barHeight;
      } else {
        this.peaks[i] = Math.max(0, this.peaks[i] - 1.2);
      }

      // Gradiente cálido vintage analógico
      const grad = ctx.createLinearGradient(0, y, 0, height);
      if (isPlaying && normalized > 0.65) {
        grad.addColorStop(0, '#FFEAA7');
        grad.addColorStop(0.3, '#E59B3C');
        grad.addColorStop(0.7, '#B3541E');
        grad.addColorStop(1, '#4A220D');
      } else {
        grad.addColorStop(0, '#D4AF37');
        grad.addColorStop(0.5, '#9E5E26');
        grad.addColorStop(1, '#2A160D');
      }

      ctx.fillStyle = grad;
      this.drawRoundedBar(ctx, x, y, barWidth, barHeight, 3);

      // Pico analógico brillante (sin sombras blur pesadas)
      if (isPlaying && this.peaks[i] > 6) {
        const peakY = height - this.peaks[i] - 2;
        ctx.fillStyle = '#FFEAA7';
        ctx.fillRect(x, Math.max(0, peakY), barWidth, 2);
      }
    }
  }

  drawRoundedBar(ctx, x, y, width, height, radius) {
    if (height < radius * 2) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  destroy() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}

window.AudioVisualizer = AudioVisualizer;
