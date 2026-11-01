/**
 * SunoWave Studio - Convertidor de Audio & Video a MP3 Ultra HQ
 * Extrae y transcodifica pistas de audio y video localmente a MP3 de alta fidelidad (320kbps)
 * 100% privado en memoria mediante Web Audio API y LameJS
 */

(function initMp3ConverterModule() {
  'use strict';

  // Estado del convertidor
  const state = {
    items: [], // Array de { id, file, name, ext, size, isVideo, status, pct, statusMsg, audioBuffer, mp3Blob, duration }
    targetKbps: 320,
    isBatchConverting: false
  };

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatSecs(sec) {
    if (!sec || isNaN(sec)) return '--:--';
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }

  function getFileExtension(filename) {
    return (filename.split('.').pop() || '').toLowerCase();
  }

  function isVideoFile(file) {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    if (type.startsWith('video/')) return true;
    const ext = getFileExtension(file.name);
    return ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'flv', 'wmv', '3gp'].includes(ext);
  }

  function getFormatBadge(file) {
    const ext = getFileExtension(file.name).toUpperCase();
    const isVid = isVideoFile(file);
    if (isVid) {
      return { text: `🎬 ${ext || 'VIDEO'}`, color: '#e056fd', bg: 'rgba(224, 86, 253, 0.15)', border: 'rgba(224, 86, 253, 0.4)' };
    }
    return { text: `🎵 ${ext || 'AUDIO'}`, color: '#00cec9', bg: 'rgba(0, 206, 201, 0.15)', border: 'rgba(0, 206, 201, 0.4)' };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const dropZone        = document.getElementById('converter-drop-zone');
    const fileInput       = document.getElementById('converter-file-input');
    const itemsContainer  = document.getElementById('converter-items-container');
    const emptyState      = document.getElementById('converter-empty-state');
    const actionsBar      = document.getElementById('converter-actions-bar');
    const btnConvertAll   = document.getElementById('converter-btn-convert-all');
    const btnClearAll     = document.getElementById('converter-btn-clear-all');
    const itemsCountBadge = document.getElementById('converter-items-count');
    const bitrateBtns     = document.querySelectorAll('.converter-bitrate-btn');

    if (!dropZone || !fileInput) return;

    // Selector de Bitrate
    bitrateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        bitrateBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.targetKbps = parseInt(btn.getAttribute('data-kbps'), 10) || 320;
        showToast(`Calidad de conversión configurada a ${state.targetKbps} kbps`, 'info');
      });
    });

    // Manejo de Arrastrar y Soltar
    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = 'var(--neon-cyan)';
        dropZone.style.background = 'rgba(0, 206, 201, 0.1)';
        dropZone.style.transform = 'scale(1.008)';
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = 'rgba(108, 92, 231, 0.45)';
        dropZone.style.background = 'var(--bg-elevated)';
        dropZone.style.transform = 'scale(1)';
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFilesAdded(Array.from(dt.files));
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesAdded(Array.from(e.target.files));
        fileInput.value = '';
      }
    });

    function handleFilesAdded(files) {
      const validFiles = files.filter(f => {
        const isVid = isVideoFile(f);
        const isAud = (f.type || '').startsWith('audio/');
        const ext = getFileExtension(f.name);
        const commonExts = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'aiff', 'mp4', 'webm', 'mkv', 'mov', 'avi', 'wma'];
        return isVid || isAud || commonExts.includes(ext);
      });

      if (validFiles.length === 0) {
        showToast('Por favor selecciona archivos de audio o video válidos', 'warning');
        return;
      }

      validFiles.forEach(file => {
        const id = 'conv_' + Math.random().toString(36).substring(2, 10);
        state.items.push({
          id,
          file,
          name: file.name.replace(/\.[^.]+$/, ''),
          ext: getFileExtension(file.name),
          size: file.size,
          isVideo: isVideoFile(file),
          status: 'ready', // 'ready', 'converting', 'done', 'error'
          pct: 0,
          statusMsg: 'Listo para convertir',
          audioBuffer: null,
          mp3Blob: null,
          duration: null
        });
      });

      renderItems();
      showToast(`¡${validFiles.length} archivo(s) añadido(s) al convertidor!`, 'success');
    }

    function renderItems() {
      if (state.items.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (itemsContainer) itemsContainer.style.display = 'none';
        if (actionsBar) actionsBar.style.display = 'none';
        if (itemsCountBadge) itemsCountBadge.textContent = '0 archivos';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      if (itemsContainer) itemsContainer.style.display = 'flex';
      if (actionsBar) actionsBar.style.display = 'flex';
      if (itemsCountBadge) itemsCountBadge.textContent = `${state.items.length} archivo(s)`;

      itemsContainer.innerHTML = '';

      state.items.forEach(item => {
        const card = document.createElement('div');
        card.id = `item-card-${item.id}`;
        card.className = 'conv-item-card';
        card.style.cssText = `
          background: linear-gradient(135deg, rgba(26, 20, 56, 0.7), rgba(12, 14, 26, 0.85));
          border: 1px solid rgba(0, 206, 201, 0.25);
          border-radius: var(--radius-md);
          padding: 16px;
          margin-bottom: 12px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all .25s ease;
        `;

        const badge = getFormatBadge(item.file);

        card.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
              <div style="width:44px; height:44px; border-radius:10px; background:${badge.bg}; border:1px solid ${badge.border}; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
                ${item.isVideo ? '🎬' : '🎵'}
              </div>
              <div style="min-width:0; flex:1;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px; flex-wrap:wrap;">
                  <span style="font-size:10px; font-weight:800; padding:2px 7px; border-radius:10px; background:${badge.bg}; color:${badge.color}; border:1px solid ${badge.border}; text-transform:uppercase;">
                    ${badge.text}
                  </span>
                  <span style="font-size:11px; color:var(--text-muted); font-weight:600;">
                    ${formatBytes(item.size)}
                  </span>
                  <span id="dur-${item.id}" style="font-size:11px; color:var(--neon-cyan); font-weight:600;">
                    ${item.duration ? formatSecs(item.duration) : ''}
                  </span>
                </div>
                <h4 style="font-family:var(--font-title); font-size:14px; font-weight:700; color:#ffffff; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${item.name}.${item.ext}
                </h4>
              </div>
            </div>

            <!-- Botones de Acción -->
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
              ${item.status === 'done' ? `
                <button type="button" class="btn btn-primary btn-dl-conv" data-id="${item.id}" style="padding:8px 16px; font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px;">
                  <span>💾</span> Descargar MP3 (${state.targetKbps}k)
                </button>
              ` : `
                <button type="button" class="btn btn-primary btn-run-conv" data-id="${item.id}" ${item.status === 'converting' ? 'disabled' : ''} style="padding:8px 16px; font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px;">
                  <span>${item.status === 'converting' ? '⏳' : '⚡'}</span> ${item.status === 'converting' ? 'Convirtiendo...' : 'Convertir a MP3'}
                </button>
              `}
              <button type="button" class="btn-paste btn-del-conv" data-id="${item.id}" title="Eliminar de la lista" style="padding:8px 10px; font-size:13px; color:var(--text-muted); border-color:rgba(255,255,255,0.15);">
                ✕
              </button>
            </div>
          </div>

          <!-- Barra de Progreso del Item -->
          <div id="prog-wrap-${item.id}" style="display:${item.status === 'converting' ? 'block' : (item.status === 'done' ? 'none' : 'none')}; margin-top:2px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
              <span id="msg-${item.id}" style="color:var(--neon-cyan); font-weight:600;">${item.statusMsg}</span>
              <span id="pct-${item.id}" style="color:var(--text-muted); font-weight:700;">${item.pct}%</span>
            </div>
            <div style="height:5px; background:rgba(255,255,255,0.08); border-radius:10px; overflow:hidden;">
              <div id="bar-${item.id}" style="height:100%; width:${item.pct}%; background:linear-gradient(90deg, #6c5ce7, #00cec9); transition:width .2s ease; border-radius:10px;"></div>
            </div>
          </div>

          <!-- Notificación de Éxito o Error -->
          ${item.status === 'done' ? `
            <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:#2ed573; font-weight:600; padding:4px 0;">
              <span>✅</span> Conversión completada a 320 kbps MP3 sin pérdidas acústicas
            </div>
          ` : ''}
          ${item.status === 'error' ? `
            <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:#ff4757; font-weight:600; padding:4px 0;">
              <span>⚠️</span> ${item.statusMsg || 'Error al procesar el archivo'}
            </div>
          ` : ''}
        `;

        itemsContainer.appendChild(card);
      });

      // Asignar listeners individuales
      document.querySelectorAll('.btn-run-conv').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const item = state.items.find(x => x.id === id);
          if (item) convertItem(item);
        });
      });

      document.querySelectorAll('.btn-dl-conv').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const item = state.items.find(x => x.id === id);
          if (item && item.mp3Blob) {
            const filename = `${item.name} (${state.targetKbps}kbps).mp3`;
            window.AudioDownloader.triggerBrowserDownload(item.mp3Blob, filename);
            showToast(`¡Descargando "${filename}"!`, 'success');
          }
        });
      });

      document.querySelectorAll('.btn-del-conv').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          state.items = state.items.filter(x => x.id !== id);
          renderItems();
        });
      });
    }

    async function convertItem(item) {
      if (item.status === 'converting') return;
      item.status = 'converting';
      item.pct = 5;
      item.statusMsg = item.isVideo ? 'Extrayendo pista de audio del video...' : 'Leyendo archivo de audio...';
      renderItems();

      const updateProgress = (pct, msg) => {
        item.pct = Math.round(pct);
        item.statusMsg = msg || '';
        const barEl = document.getElementById(`bar-${item.id}`);
        const pctEl = document.getElementById(`pct-${item.id}`);
        const msgEl = document.getElementById(`msg-${item.id}`);
        if (barEl) barEl.style.width = `${pct}%`;
        if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
        if (msgEl) msgEl.textContent = msg || '';
      };

      try {
        updateProgress(15, 'Cargando datos binarios en memoria...');
        const arrayBuffer = await item.file.arrayBuffer();

        updateProgress(35, item.isVideo ? 'Decodificando stream del video con Web Audio API...' : 'Decodificando ondas espectrales...');
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const actx = new AudioContextClass();
        if (actx.state === 'suspended') {
          try { await actx.resume(); } catch (e) {}
        }

        let audioBuffer;
        try {
          audioBuffer = await actx.decodeAudioData(arrayBuffer.slice(0));
        } catch (decErr) {
          // Promise callback fallback
          audioBuffer = await new Promise((res, rej) => {
            actx.decodeAudioData(arrayBuffer.slice(0), res, rej);
          });
        }

        item.audioBuffer = audioBuffer;
        item.duration = audioBuffer.duration;

        updateProgress(50, `Codificando a MP3 de alta fidelidad (${state.targetKbps} kbps)...`);
        
        let mp3Blob;
        if (window.AudioDownloader && window.AudioDownloader.encodeMp3WithLame) {
          mp3Blob = await window.AudioDownloader.encodeMp3WithLame(
            audioBuffer,
            (pct, msg) => {
              updateProgress(pct, msg);
            },
            state.targetKbps
          );
        } else {
          throw new Error('El codificador LameJS no está disponible en este momento');
        }

        item.mp3Blob = mp3Blob;
        item.status = 'done';
        item.pct = 100;
        item.statusMsg = '¡Conversión exitosa!';
        renderItems();
        showToast(`¡"${item.name}" convertido a MP3 exitosamente!`, 'success');
      } catch (err) {
        console.error('Error convirtiendo archivo:', err);
        item.status = 'error';
        item.statusMsg = err.message || 'No se pudo decodificar el audio de este archivo';
        renderItems();
        showToast(`Error al convertir "${item.name}": ${err.message}`, 'error');
      }
    }

    // Convertir todos los archivos pendientes
    if (btnConvertAll) {
      btnConvertAll.addEventListener('click', async () => {
        if (state.isBatchConverting) return;
        const pending = state.items.filter(x => x.status !== 'done');
        if (pending.length === 0) {
          showToast('Todos los archivos ya han sido convertidos', 'info');
          return;
        }

        state.isBatchConverting = true;
        btnConvertAll.disabled = true;
        btnConvertAll.innerHTML = '<span>⏳</span> Convirtiendo lote...';

        for (let i = 0; i < pending.length; i++) {
          await convertItem(pending[i]);
        }

        state.isBatchConverting = false;
        btnConvertAll.disabled = false;
        btnConvertAll.innerHTML = '<span>⚡</span> Convertir Todos a MP3';
        showToast('¡Todos los archivos fueron convertidos a MP3!', 'success');
      });
    }

    // Limpiar toda la lista
    if (btnClearAll) {
      btnClearAll.addEventListener('click', () => {
        if (state.items.length === 0) return;
        state.items = [];
        renderItems();
        showToast('Lista del convertidor limpiada', 'info');
      });
    }

  }); // fin DOMContentLoaded
})();
