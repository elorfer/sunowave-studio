/**
 * SunoWave Studio - Audio Trimmer & Demo Maker
 * Recorta audio sin pérdida, genera muestras comerciales y estampa sellos de agua visuales y sonoros
 */

const AudioTrimmer = {
  /**
   * Recorta un AudioBuffer entre startTime y endTime (en segundos)
   * @param {AudioBuffer} buffer
   * @param {number} startTime
   * @param {number} endTime
   * @returns {AudioBuffer}
   */
  sliceAudioBuffer(buffer, startTime, endTime) {
    const sampleRate = buffer.sampleRate;
    const startSample = Math.max(0, Math.floor(startTime * sampleRate));
    const endSample = Math.min(buffer.length, Math.floor(endTime * sampleRate));
    const frameCount = Math.max(0, endSample - startSample);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const sliced = ctx.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const channelData = buffer.getChannelData(i);
      const sub = channelData.subarray(startSample, endSample);
      sliced.copyToChannel(sub, i);
    }
    return sliced;
  },

  /**
   * Aplica una marca de agua sonora sutil (doble beep suave con fade) cada intervalo de segundos
   * @param {AudioBuffer} buffer
   * @param {number} intervalSec
   * @returns {AudioBuffer}
   */
  applyAudioWatermark(buffer, intervalSec = 10) {
    const sampleRate = buffer.sampleRate;
    const channels = buffer.numberOfChannels;
    const length = buffer.length;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const watermarked = ctx.createBuffer(channels, length, sampleRate);

    for (let c = 0; c < channels; c++) {
      const srcData = buffer.getChannelData(c);
      const dstData = watermarked.getChannelData(c);
      dstData.set(srcData);

      const intervalSamples = intervalSec * sampleRate;
      const beepDurationSamples = Math.floor(0.18 * sampleRate); // 180ms beep
      const freq = 880; // 880 Hz

      for (let offset = intervalSamples; offset + beepDurationSamples < length; offset += intervalSamples) {
        for (let i = 0; i < beepDurationSamples; i++) {
          const t = i / sampleRate;
          const envelope = Math.sin((Math.PI * i) / beepDurationSamples) * 0.16;
          const tone = Math.sin(2 * Math.PI * freq * t) * envelope;
          dstData[offset + i] = Math.max(-1, Math.min(1, dstData[offset + i] * 0.55 + tone));
        }
      }
    }
    return watermarked;
  },

  /**
   * Genera una carátula con sello de agua diagonal o imagen personalizada
   * @param {string|HTMLImageElement} baseCover
   * @param {HTMLImageElement|null} customWatermarkImg
   * @param {string} customText
   * @returns {Promise<Blob>}
   */
  async generateWatermarkedCoverBlob(baseCover, customWatermarkImg = null, customText = 'MUESTRA DEMO') {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const size = 1000;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      const drawWatermark = () => {
        if (customWatermarkImg && customWatermarkImg.complete && customWatermarkImg.naturalWidth > 0) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
          ctx.shadowBlur = 24;
          const aspect = customWatermarkImg.naturalWidth / customWatermarkImg.naturalHeight;
          let drawW = size * 0.75;
          let drawH = drawW / aspect;
          if (drawH > size * 0.75) {
            drawH = size * 0.75;
            drawW = drawH * aspect;
          }
          const x = (size - drawW) / 2;
          const y = (size - drawH) / 2;
          ctx.drawImage(customWatermarkImg, x, y, drawW, drawH);
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(size / 2, size / 2);
          ctx.rotate((-35 * Math.PI) / 180);

          ctx.fillStyle = 'rgba(10, 15, 29, 0.84)';
          ctx.fillRect(-size, -75, size * 2, 150);

          ctx.lineWidth = 4;
          ctx.strokeStyle = '#00cec9';
          ctx.beginPath();
          ctx.moveTo(-size, -75);
          ctx.lineTo(size, -75);
          ctx.moveTo(-size, 75);
          ctx.lineTo(size, 75);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '900 52px "Montserrat", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = '#6c5ce7';
          ctx.shadowBlur = 18;
          ctx.fillText(customText.toUpperCase(), 0, -12);

          ctx.fillStyle = '#00cec9';
          ctx.font = '700 20px "Inter", sans-serif';
          ctx.shadowBlur = 10;
          ctx.fillText('SOLO USO DE EVALUACIÓN · PROPIEDAD PRIVADA', 0, 32);

          ctx.restore();
        }

        ctx.strokeStyle = 'rgba(0, 206, 201, 0.4)';
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, size - 14, size - 14);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('No se pudo generar el Blob de la portada'));
        }, 'image/jpeg', 0.92);
      };

      if (typeof baseCover === 'string') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(img, 0, 0, size, size);
          drawWatermark();
        };
        img.onerror = () => {
          const grad = ctx.createLinearGradient(0, 0, size, size);
          grad.addColorStop(0, '#1a1438');
          grad.addColorStop(1, '#0c0e1a');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, size, size);
          drawWatermark();
        };
        img.src = baseCover;
      } else if (baseCover instanceof HTMLImageElement) {
        ctx.drawImage(baseCover, 0, 0, size, size);
        drawWatermark();
      } else {
        const grad = ctx.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, '#1a1438');
        grad.addColorStop(1, '#0c0e1a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        drawWatermark();
      }
    });
  }
};

window.AudioTrimmer = AudioTrimmer;
