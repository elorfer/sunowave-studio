/**
 * SunoWave - Audio Visualizer Studio
 * Visualizador de espectro sonoro neón ultra-fluido y reactivo a la reproducción
 */

class AudioVisualizer {
  constructor(canvasId, audioElement) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.audio = audioElement;
    this.animationId = null;
    this.peaks = new Array(48).fill(0);
    this.tick = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.startLoop();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = 130 * (window.devicePixelRatio || 1);
    this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    this.width = rect.width;
    this.height = 130;
  }

  startLoop() {
    const render = () => {
      this.draw();
      this.animationId = requestAnimationFrame(render);
    };
    render();
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

    this.tick += isPlaying ? 0.08 : 0.025;

    // Generador armónico reactivo que responde al ritmo y volumen
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + spacing);
      
      let normalized = 0.08;
      if (isPlaying) {
        // Simulación de espectro por bandas de frecuencia (graves, medios, agudos)
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
        // Animación suave de reposo/ambient
        normalized = (Math.sin(i * 0.16 + this.tick) * 0.5 + 0.5) * 0.18 + 0.05;
      }

      const barHeight = Math.max(4, normalized * (height * 0.88));
      const y = height - barHeight;

      // Caída suave de los picos superiores
      if (barHeight > this.peaks[i]) {
        this.peaks[i] = barHeight;
      } else {
        this.peaks[i] = Math.max(0, this.peaks[i] - 1.4);
      }

      // Gradiente de color según energía y frecuencia
      const grad = ctx.createLinearGradient(0, y, 0, height);
      if (isPlaying && normalized > 0.7) {
        grad.addColorStop(0, '#FF7675'); // Resplandor en frecuencias altas
        grad.addColorStop(0.3, '#00CEC9');
        grad.addColorStop(1, '#6C5CE7');
      } else {
        grad.addColorStop(0, '#00CEC9'); // Cian neón
        grad.addColorStop(0.5, '#6C5CE7'); // Violeta neón
        grad.addColorStop(1, '#A29BFE');
      }

      ctx.fillStyle = grad;
      ctx.shadowBlur = isPlaying ? 12 : 5;
      ctx.shadowColor = isPlaying ? 'rgba(0, 206, 201, 0.6)' : 'rgba(108, 92, 231, 0.3)';
      this.drawRoundedBar(ctx, x, y, barWidth, barHeight, 3);

      // Indicador de pico blanco en la parte superior
      if (isPlaying && this.peaks[i] > 6) {
        const peakY = height - this.peaks[i] - 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#FFFFFF';
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
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

window.AudioVisualizer = AudioVisualizer;
