// =============================================
//   FaceID App - app.js
//   Reconocimiento facial con face-api.js
// =============================================

const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';

// -----------------------------------------------
// ESTADO GLOBAL
// -----------------------------------------------
let people = [];           // [{ name, photos: [ImageData], descriptor: Float32Array[] }]
let videoStream = null;
let currentCamera = 'user';
let detectionInterval = null;
let modelsLoaded = false;
let faceMatcher = null;

// -----------------------------------------------
// HISTORIAL: [{ name, timestamp, confidence, known }]
// -----------------------------------------------
let detectionHistory = [];
let lastLoggedName = '';
let lastLoggedTime = 0;
const LOG_COOLDOWN_MS = 4000; // evitar logs duplicados cada 4s

function loadHistory() {
  try {
    const raw = localStorage.getItem('faceapp_history');
    if (raw) detectionHistory = JSON.parse(raw);
  } catch (e) {
    detectionHistory = [];
  }
}

function saveHistory() {
  try {
    // Guardar solo los últimos 500 registros
    if (detectionHistory.length > 500) detectionHistory = detectionHistory.slice(-500);
    localStorage.setItem('faceapp_history', JSON.stringify(detectionHistory));
  } catch (e) {
    console.warn('No se pudo guardar historial:', e);
  }
}

function logDetection(name, confidence, known) {
  const now = Date.now();
  // Evitar registrar el mismo rostro repetidamente en poco tiempo
  if (name === lastLoggedName && (now - lastLoggedTime) < LOG_COOLDOWN_MS) return;

  lastLoggedName = name;
  lastLoggedTime = now;

  detectionHistory.push({
    name,
    timestamp: now,
    confidence,
    known
  });
  saveHistory();
}

// -----------------------------------------------
// PERSONAS
// -----------------------------------------------
function loadPeople() {
  try {
    const raw = localStorage.getItem('faceapp_people');
    if (raw) people = JSON.parse(raw);
  } catch (e) {
    people = [];
  }
}

function savePeople() {
  try {
    localStorage.setItem('faceapp_people', JSON.stringify(people));
  } catch (e) {
    console.warn('No se pudo guardar en localStorage:', e);
  }
}

// -----------------------------------------------
// NAVEGACIÓN
// -----------------------------------------------
function goTo(screenId) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const next = document.getElementById(screenId);
  next.style.display = 'flex';
  requestAnimationFrame(() => next.classList.add('active'));

  if (screenId === 'screen-people') renderPeople();
  if (screenId === 'screen-camera') startCamera();
  if (screenId === 'screen-history') renderHistory();
  if (screenId === 'screen-stats') renderStats();
}

// -----------------------------------------------
// MODAL: AGREGAR PERSONA
// -----------------------------------------------
let pendingFiles = [];

function openAddPerson() {
  pendingFiles = [];
  document.getElementById('person-name').value = '';
  document.getElementById('photo-thumbs').innerHTML = '';
  document.getElementById('photo-input').value = '';
  document.getElementById('modal-add').classList.add('open');
}

function closeModalDirect() {
  document.getElementById('modal-add').classList.remove('open');
  pendingFiles = [];
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-add')) closeModalDirect();
}

function previewPhotos(e) {
  pendingFiles = Array.from(e.target.files);
  const thumbs = document.getElementById('photo-thumbs');
  thumbs.innerHTML = '';
  pendingFiles.forEach(f => {
    const url = URL.createObjectURL(f);
    const img = document.createElement('img');
    img.src = url;
    img.className = 'thumb-img';
    thumbs.appendChild(img);
  });
}

async function savePerson() {
  const name = document.getElementById('person-name').value.trim();
  if (!name) { alert('Escribe un nombre'); return; }
  if (pendingFiles.length === 0) { alert('Agrega al menos una foto'); return; }

  const photos = await Promise.all(pendingFiles.map(fileToBase64));
  const firstPhoto = photos[0];

  people.push({ name, photos, firstPhoto });
  savePeople();
  closeModalDirect();
  renderPeople();
  if (modelsLoaded) rebuildMatcher();
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function deletePerson(index) {
  if (!confirm(`¿Eliminar a "${people[index].name}"?`)) return;
  people.splice(index, 1);
  savePeople();
  renderPeople();
  if (modelsLoaded) rebuildMatcher();
}

// -----------------------------------------------
// RENDER LISTA DE PERSONAS
// -----------------------------------------------
function renderPeople() {
  const grid = document.getElementById('people-grid');
  const info = document.getElementById('people-info');
  const camWrap = document.getElementById('cam-btn-wrap');

  grid.innerHTML = '';

  if (people.length === 0) {
    info.classList.remove('hidden');
    camWrap.style.display = 'none';
    return;
  }

  info.classList.add('hidden');
  camWrap.style.display = 'flex';

  people.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'person-card';

    const photoCount = p.photos ? p.photos.length : 0;

    if (p.firstPhoto) {
      const img = document.createElement('img');
      img.src = p.firstPhoto;
      img.alt = p.name;
      card.appendChild(img);
    } else {
      const noImg = document.createElement('div');
      noImg.className = 'person-card-no-img';
      noImg.textContent = p.name[0].toUpperCase();
      card.appendChild(noImg);
    }

    const infoRow = document.createElement('div');
    infoRow.className = 'person-info';
    infoRow.innerHTML = `
      <span class="person-name">${p.name}</span>
      <span class="person-count">${photoCount} foto${photoCount !== 1 ? 's' : ''}</span>
    `;
    card.appendChild(infoRow);

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.innerHTML = '✕';
    delBtn.onclick = () => deletePerson(i);
    card.appendChild(delBtn);

    grid.appendChild(card);
  });
}

// -----------------------------------------------
// CÁMARA
// -----------------------------------------------
async function startCamera() {
  const statusEl = document.getElementById('model-status');
  const statusText = document.getElementById('model-status-text');
  const video = document.getElementById('video');

  statusEl.classList.remove('hidden');
  statusText.textContent = 'Iniciando cámara...';

  try {
    if (videoStream) stopStream();
    const constraints = {
      video: {
        facingMode: currentCamera,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = videoStream;
    await new Promise(r => video.onloadedmetadata = r);
    await video.play();
  } catch (err) {
    statusText.textContent = '❌ No se pudo acceder a la cámara';
    console.error(err);
    return;
  }

  if (!modelsLoaded) {
    statusText.textContent = 'Cargando modelos de IA...';
    try {
      await loadModels();
    } catch (err) {
      statusText.textContent = '❌ Error cargando modelos. Revisa tu conexión.';
      console.error(err);
      return;
    }
  }

  if (people.length > 0 && !faceMatcher) {
    statusText.textContent = 'Procesando rostros registrados...';
    await rebuildMatcher();
  }

  statusEl.classList.add('hidden');
  document.getElementById('scan-line').classList.add('active');
  startDetection();
}

async function loadModels() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
  modelsLoaded = true;
}

async function rebuildMatcher() {
  if (people.length === 0) { faceMatcher = null; return; }

  const labeledDescriptors = [];

  for (const person of people) {
    const descriptors = [];
    for (const photoBase64 of person.photos) {
      try {
        const img = await loadImage(photoBase64);
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks(true)
          .withFaceDescriptor();
        if (detection) {
          descriptors.push(detection.descriptor);
        }
      } catch (e) {
        console.warn(`Error procesando foto de ${person.name}:`, e);
      }
    }
    if (descriptors.length > 0) {
      labeledDescriptors.push(
        new faceapi.LabeledFaceDescriptors(person.name, descriptors)
      );
    }
  }

  if (labeledDescriptors.length > 0) {
    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
  } else {
    faceMatcher = null;
  }
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
    img.crossOrigin = 'anonymous';
  });
}

// -----------------------------------------------
// DETECCIÓN EN TIEMPO REAL
// -----------------------------------------------
function startDetection() {
  if (detectionInterval) clearInterval(detectionInterval);
  detectionInterval = setInterval(detectFaces, 700);
}

async function detectFaces() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('overlay-canvas');

  if (!video || !video.videoWidth) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  try {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    if (detections.length === 0) {
      updateResult('idle', 'Buscando rostro...', 'Apunta la cámara al rostro');
      return;
    }

    for (const det of detections) {
      const box = det.detection.box;

      if (faceMatcher) {
        const match = faceMatcher.findBestMatch(det.descriptor);
        const isKnown = match.label !== 'unknown';
        const name = isKnown ? match.label : 'Desconocido';
        const color = isKnown ? '#00ff88' : '#ff3b5c';
        const conf = Math.round((1 - match.distance) * 100);

        drawBox(ctx, box, color, name, conf);

        // *** GUARDAR EN HISTORIAL ***
        logDetection(name, conf, isKnown);

        if (detections.length === 1) {
          if (isKnown) {
            updateResult('found', `✓ ${name}`, `Confianza: ${conf}%`);
          } else {
            updateResult('unknown', '✗ Desconocido', 'Persona no registrada');
          }
        }
      } else {
        drawBox(ctx, box, '#00e5ff', '?', null);
        updateResult('scanning', 'Rostro detectado', 'No hay personas registradas');
      }
    }

    if (detections.length > 1) {
      const known = detections.filter(det => {
        if (!faceMatcher) return false;
        const m = faceMatcher.findBestMatch(det.descriptor);
        return m.label !== 'unknown';
      });
      updateResult('scanning', `${detections.length} rostros`, `${known.length} reconocido(s)`);
    }

  } catch (e) {
    console.error('Error en detección:', e);
  }
}

function drawBox(ctx, box, color, label, conf) {
  const { x, y, width, height } = box;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 12;
  ctx.shadowColor = color;
  ctx.strokeRect(x, y, width, height);
  ctx.shadowBlur = 0;

  const text = conf !== null ? `${label}  ${conf}%` : label;
  ctx.font = 'bold 14px -apple-system, sans-serif';
  const textW = ctx.measureText(text).width;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.88;
  ctx.fillRect(x - 1, y - 26, textW + 16, 26);
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 7, y - 8);
}

function updateResult(state, text, sub) {
  const icon = document.getElementById('result-icon');
  const textEl = document.getElementById('result-text');
  const subEl = document.getElementById('result-sub');

  icon.className = 'result-icon';

  if (state === 'found') {
    icon.classList.add('found');
    icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (state === 'unknown') {
    icon.classList.add('unknown');
    icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  } else if (state === 'scanning') {
    icon.classList.add('scanning');
    icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
  } else {
    icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
  }

  textEl.textContent = text;
  subEl.textContent = sub;
}

// -----------------------------------------------
// CONTROLES DE CÁMARA
// -----------------------------------------------
async function flipCamera() {
  currentCamera = currentCamera === 'user' ? 'environment' : 'user';
  stopStream();
  await startCamera();
}

function stopStream() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
}

function stopCamera() {
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
  stopStream();
  const canvas = document.getElementById('overlay-canvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('scan-line').classList.remove('active');
  updateResult('idle', 'Buscando rostro...', 'Apunta la cámara al rostro');
  goTo('screen-people');
}

// -----------------------------------------------
// PANTALLA: HISTORIAL (NUEVA)
// -----------------------------------------------
function renderHistory() {
  const list = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');

  countEl.textContent = `${detectionHistory.length} registros`;

  if (detectionHistory.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(0,229,255,0.3)" stroke-width="1.2"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
        <p>Aún no hay detecciones registradas</p>
        <small>Abre la cámara para comenzar</small>
      </div>`;
    return;
  }

  // Mostrar en orden más reciente primero
  const sorted = [...detectionHistory].reverse();

  list.innerHTML = sorted.map(entry => {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const iconColor = entry.known ? 'var(--green)' : 'var(--red)';
    const tagClass = entry.known ? 'tag-known' : 'tag-unknown';
    const tagText = entry.known ? 'Reconocido' : 'Desconocido';

    return `
      <div class="history-item">
        <div class="history-dot" style="background:${iconColor}; box-shadow: 0 0 8px ${iconColor}"></div>
        <div class="history-info">
          <div class="history-name">${entry.name}</div>
          <div class="history-time">${dateStr} · ${timeStr}</div>
        </div>
        <div class="history-right">
          <span class="history-tag ${tagClass}">${tagText}</span>
          ${entry.known ? `<span class="history-conf">${entry.confidence}%</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function confirmClearHistory() {
  if (detectionHistory.length === 0) return;
  if (confirm('¿Borrar todo el historial de detecciones?')) {
    detectionHistory = [];
    saveHistory();
    renderHistory();
  }
}

// -----------------------------------------------
// EXPORTAR HISTORIAL (.txt) (NUEVA)
// -----------------------------------------------
function exportHistory() {
  if (detectionHistory.length === 0) {
    alert('No hay registros para exportar.');
    return;
  }

  const lines = [
    '========================================',
    '   FACEID APP - HISTORIAL DE DETECCIONES',
    '========================================',
    `Exportado: ${new Date().toLocaleString('es-MX')}`,
    `Total de registros: ${detectionHistory.length}`,
    '',
    ...detectionHistory.map((entry, i) => {
      const date = new Date(entry.timestamp);
      const dateStr = date.toLocaleString('es-MX');
      const estado = entry.known ? `RECONOCIDO (${entry.confidence}% confianza)` : 'DESCONOCIDO';
      return `[${i + 1}] ${dateStr} | ${entry.name} | ${estado}`;
    }),
    '',
    '========================================'
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `faceid_historial_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------
// PANTALLA: ESTADÍSTICAS (NUEVA)
// -----------------------------------------------
function renderStats() {
  const total = detectionHistory.length;
  const known = detectionHistory.filter(e => e.known).length;
  const unknown = detectionHistory.filter(e => !e.known).length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-known').textContent = known;
  document.getElementById('stat-unknown').textContent = unknown;
  document.getElementById('stat-people').textContent = people.length;

  // Barras por persona
  const barsEl = document.getElementById('stats-bars');
  const counts = {};
  detectionHistory.forEach(e => {
    counts[e.name] = (counts[e.name] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

  if (sorted.length === 0) {
    barsEl.innerHTML = '<div class="empty-state" style="padding:24px 0"><p>Sin datos aún</p></div>';
  } else {
    barsEl.innerHTML = sorted.map(([name, count]) => {
      const pct = Math.round((count / maxCount) * 100);
      const isUnknown = name === 'Desconocido';
      const barColor = isUnknown ? 'var(--red)' : 'var(--cyan)';
      return `
        <div class="stat-bar-row">
          <div class="stat-bar-name">${name}</div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width:${pct}%; background:${barColor}"></div>
          </div>
          <div class="stat-bar-val">${count}</div>
        </div>`;
    }).join('');
  }

  // Gráfica por hora
  const hourEl = document.getElementById('hour-chart');
  const hourCounts = new Array(24).fill(0);
  detectionHistory.forEach(e => {
    const h = new Date(e.timestamp).getHours();
    hourCounts[h]++;
  });
  const maxHour = Math.max(...hourCounts, 1);

  hourEl.innerHTML = hourCounts.map((c, h) => {
    const pct = Math.round((c / maxHour) * 100);
    const label = h % 6 === 0 ? `${h}h` : '';
    return `
      <div class="hour-col">
        <div class="hour-bar-wrap">
          <div class="hour-bar" style="height:${pct}%"></div>
        </div>
        <div class="hour-label">${label}</div>
      </div>`;
  }).join('');
}

// -----------------------------------------------
// INIT
// -----------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  loadPeople();
  loadHistory();
  goTo('screen-home');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.log('SW:', e));
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
  } else {
    const cameraScreen = document.getElementById('screen-camera');
    if (cameraScreen && cameraScreen.classList.contains('active')) {
      startDetection();
    }
  }
});
