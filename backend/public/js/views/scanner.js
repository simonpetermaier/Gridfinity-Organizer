'use strict';

// In-app QR scanner. Uses getUserMedia() to pull a back-camera stream,
// draws each frame to a hidden <canvas>, and runs jsQR on the pixel
// buffer. On a hit we parse the payload (URL or `gfbin:N`), navigate to
// the bin's detail page on the CURRENT origin, and tear down the stream.
//
// iOS Safari requirements (NOT bypassable from JS):
//   • page served via HTTPS (or localhost)
//   • triggered by a user gesture (the user clicking "Start" counts)
//   • iOS 11+
//
// Desktop browsers will use a built-in camera if any are attached.

const Scanner = {
  _stream:  null,
  _rafId:   null,
  _running: false,

  isSecure() {
    // window.isSecureContext is true for HTTPS, localhost, file:, etc.
    return typeof window !== 'undefined' && window.isSecureContext === true;
  },

  hasCamera() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },

  hasJsQR() {
    return typeof window.jsQR === 'function';
  },

  async start() {
    if (this._running) return;
    if (!this.isSecure()) {
      this._showError(
        'Camera requires HTTPS',
        `Your browser will only grant camera access over a secure origin.
         Open the app via <code>https://…</code> (or <code>localhost</code>) and try again.
         See the README's "Camera & HTTPS" section for a one-shot Caddy recipe.`
      );
      return;
    }
    if (!this.hasCamera()) {
      this._showError('Camera not available', 'This browser does not expose <code>getUserMedia</code>.');
      return;
    }
    if (!this.hasJsQR()) {
      this._showError('Decoder not loaded', 'The jsQR library failed to load. Check your network or self-host it.');
      return;
    }

    const video  = $('scanner-video');
    const status = $('scanner-status');
    if (!video || !status) return;
    status.textContent = 'Requesting camera…';

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (e) {
      this._showError('Camera permission denied', esc(e.message || 'Permission required to scan QR codes.'));
      return;
    }

    video.srcObject = this._stream;
    // Required for iOS; without it Safari opens fullscreen on play.
    video.setAttribute('playsinline', 'true');
    video.setAttribute('muted', 'true');
    await video.play().catch(() => {});

    status.textContent = 'Looking for a QR code…';
    this._running = true;
    $('scanner-start')?.setAttribute('hidden', '');
    $('scanner-stop')?.removeAttribute('hidden');
    this._scanLoop();
  },

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    if (this._stream) {
      for (const track of this._stream.getTracks()) track.stop();
      this._stream = null;
    }
    const video = $('scanner-video');
    if (video) video.srcObject = null;
    const status = $('scanner-status');
    if (status) status.textContent = 'Camera stopped.';
    $('scanner-start')?.removeAttribute('hidden');
    $('scanner-stop')?.setAttribute('hidden', '');
  },

  _scanLoop() {
    if (!this._running) return;
    const video  = $('scanner-video');
    const canvas = $('scanner-canvas');
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      this._rafId = requestAnimationFrame(() => this._scanLoop());
      return;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (hit && hit.data) {
      this._onDetected(hit.data);
      return;
    }
    this._rafId = requestAnimationFrame(() => this._scanLoop());
  },

  _onDetected(payload) {
    const id = parseScannedPayload(payload);
    this.stop();
    if (id == null) {
      toast('Scanned, but this isn\'t a Gridfinity bin code');
      const status = $('scanner-status');
      if (status) status.textContent = `Raw payload: ${payload.slice(0, 80)}`;
      return;
    }
    // Navigate to the public bin page on the CURRENT origin — that's the whole
    // point of `gfbin:N` payloads: they don't carry a host with them.
    window.location.href = `/bin/${id}`;
  },

  _showError(title, html) {
    const status = $('scanner-status');
    if (status) status.innerHTML = `<strong>${esc(title)}</strong><br><span class="mute">${html}</span>`;
  },
};

Object.assign(App, {

  renderScanner() {
    const secure  = Scanner.isSecure();
    const hasCam  = Scanner.hasCamera();
    const hasLib  = Scanner.hasJsQR();
    const blocker = !secure
      ? `<div class="card" style="margin-bottom:12px; border-color: var(--danger);">
           <strong>Camera blocked: HTTPS required.</strong>
           <p class="mute" style="margin:6px 0 0;">
             Modern browsers only grant camera access on secure origins. Visit the app via
             <code>https://…</code> or <code>localhost</code> to enable scanning. See the
             README section <em>"Camera & HTTPS"</em> for a quick Caddy recipe.
           </p>
         </div>`
      : (!hasCam ? `<div class="card" style="margin-bottom:12px; border-color: var(--danger);">
           <strong>No camera API.</strong>
           <p class="mute" style="margin:6px 0 0;">This browser does not expose <code>getUserMedia</code>.</p>
         </div>` : '');
    const modeUrl = S.qrPayloadMode === 'url';
    return `
      <div class="page-header">
        <h1 class="page-title">Scan</h1>
        <span class="count-chip mute">Accepts gfbin:N and full URLs</span>
        <span style="flex:1"></span>
        <span class="mute" style="font-size:var(--text-xs);">Print new QRs as</span>
        <button class="pill ${modeUrl ? 'active' : ''}" onclick="App.setQrMode('url')"
                title="QRs encode http(s)://host/bin/N — works in iOS Camera app, ties stickers to host">
          URL
        </button>
        <button class="pill ${!modeUrl ? 'active' : ''}" onclick="App.setQrMode('id')"
                title="QRs encode gfbin:N — host-portable, in-app scanner only">
          gfbin:N
        </button>
      </div>

      ${blocker}

      <div class="scanner-wrap">
        <video id="scanner-video" playsinline muted></video>
        <canvas id="scanner-canvas" hidden></canvas>
        <div class="scanner-overlay" aria-hidden="true">
          <div class="scanner-frame"></div>
        </div>
      </div>

      <div class="scanner-controls">
        <button id="scanner-start" class="btn btn-primary" onclick="Scanner.start()"
                ${secure && hasCam && hasLib ? '' : 'disabled'}>
          ${icon('qr', 14)} <span>Start camera</span>
        </button>
        <button id="scanner-stop"  class="btn btn-secondary" onclick="Scanner.stop()" hidden>
          Stop
        </button>
        <span id="scanner-status" class="mute" style="margin-left:8px;">
          ${secure && hasCam && hasLib ? 'Press Start, point at a bin\'s QR code.' : ''}
        </span>
      </div>

      <p class="mute" style="font-size: var(--text-xs); margin-top: 16px;">
        Tip: print stickers in <strong>gfbin:N</strong> mode (set <code>QR_PAYLOAD_MODE=id</code>
        on the backend) and your labels will survive a host migration — only the in-app scanner
        decodes them.
      </p>
    `;
  },
});
