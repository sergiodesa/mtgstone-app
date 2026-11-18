// QR reading from the camera or from a photo. Uses the native BarcodeDetector
// where it exists (Android Chrome) and jsQR otherwise (iPhone Safari).

let jsQRPromise = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  jsQRPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jsQR.js';
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => { jsQRPromise = null; reject(new Error('Não foi possível carregar o leitor de QR')); };
    document.head.appendChild(s);
  });
  return jsQRPromise;
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    return formats.includes('qr_code') ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function decodeWithJsQR(jsQR, source, w, h, maxSide = 720) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

// Starts the camera in `video`; calls onResult(text) once. Returns stop().
export async function startCamera(video, onResult) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este browser não dá acesso à câmara. Usa "Escolher foto".');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  const detector = await nativeDetector();
  const jsQR = detector ? null : await loadJsQR();
  let running = true;
  let busy = false;

  const stop = () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  const tick = async () => {
    if (!running) return;
    if (!busy && video.readyState >= 2 && video.videoWidth) {
      busy = true;
      try {
        let text = null;
        if (detector) {
          const codes = await detector.detect(video);
          text = codes[0]?.rawValue ?? null;
        } else {
          text = decodeWithJsQR(jsQR, video, video.videoWidth, video.videoHeight);
        }
        if (text && running) {
          stop();
          onResult(text);
          return;
        }
      } catch { /* keep trying */ }
      busy = false;
    }
    setTimeout(() => requestAnimationFrame(tick), 120);
  };
  tick();
  return stop;
}

// Reads a QR code from an image file (photo or screenshot)
export async function scanFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const detector = await nativeDetector();
    if (detector) {
      const codes = await detector.detect(bitmap);
      if (codes[0]) return codes[0].rawValue;
    }
    const jsQR = await loadJsQR();
    // Try a couple of sizes: big photos decode better scaled down
    for (const side of [1000, 1600, 600]) {
      const text = decodeWithJsQR(jsQR, bitmap, bitmap.width, bitmap.height, side);
      if (text) return text;
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}
