(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let installPrompt = null;
  let activeStream = null;

  function setCapability(id, text, ready) {
    const node = $(id);
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('ready', ready === true);
    node.classList.toggle('pending', ready !== true);
  }

  function updateConnection() {
    const online = navigator.onLine;
    $('connectionDot')?.classList.toggle('online', online);
    if ($('connectionStatus')) $('connectionStatus').textContent = online ? 'Internet available' : 'Offline — app shell only';
    if (!online && $('terminalMessage')) {
      $('terminalMessage').textContent = 'You are offline. This app can open, but attendance events cannot be recorded until the Main System confirms them online.';
    }
  }

  async function detectPlatformAuthenticator() {
    try {
      const available = !!(window.PublicKeyCredential &&
        typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
      setCapability('biometricCapability',
        available ? 'Platform authenticator available — account verification still requires secure pairing' :
          'No supported platform authenticator detected on this browser',
        available);
    } catch (_) {
      setCapability('biometricCapability','Platform authenticator could not be checked',false);
    }
  }

  function detectQr() {
    const available = window.isSecureContext && 'BarcodeDetector' in window &&
      typeof navigator.mediaDevices?.getUserMedia === 'function';
    setCapability('qrCapability',available ? 'QR scanner API available on this device' :
      'Use a supported camera browser or an external QR reader',available);
  }

  function detectNfc() {
    const available = window.isSecureContext && 'NDEFReader' in window;
    setCapability('nfcCapability',available ? 'Web NFC available — requires a compatible Android browser and NFC hardware' :
      'Web NFC unavailable here — a compatible reader or another method is required',available);
  }

  async function scanQrCapabilityDemo() {
    if (!window.isSecureContext || !('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      $('terminalMessage').textContent = 'QR scanning is not available in this browser. No attendance event was created.';
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'notice';
    overlay.textContent = 'Camera permission is needed to test QR scanning. This unpaired app will not send or save scanned badge contents.';
    $('terminalMessage').replaceChildren(overlay);
    try {
      activeStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.cssText = 'width:100%;max-height:280px;border-radius:10px;margin-top:10px';
      video.srcObject = activeStream;
      $('terminalMessage').appendChild(video);
      await video.play();
      const detector = new BarcodeDetector({formats:['qr_code']});
      let stopped = false;
      const stop = () => {
        stopped = true;
        activeStream?.getTracks().forEach(track=>track.stop());
        activeStream = null;
      };
      const close = document.createElement('button');
      close.type='button'; close.textContent='Close camera'; close.style.marginTop='10px';
      close.addEventListener('click',()=>{stop();$('terminalMessage').textContent='QR scanner closed. No attendance event was created.';});
      $('terminalMessage').appendChild(close);
      const scan = async () => {
        if (stopped) return;
        try {
          const found = await detector.detect(video);
          if (found.length) {
            stop();
            $('terminalMessage').textContent='QR badge detected. This device is not paired, so the badge was not read into a staff record and no attendance event was sent.';
            return;
          }
        } catch (_) {}
        if (!stopped) requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    } catch (_) {
      activeStream?.getTracks().forEach(track=>track.stop());
      activeStream=null;
      $('terminalMessage').textContent='Camera access was not granted or is unavailable. No attendance event was created.';
    }
  }

  async function scanNfcCapabilityDemo() {
    if (!window.isSecureContext || !('NDEFReader' in window)) {
      $('terminalMessage').textContent='NFC is not available in this browser/device. A supported NFC reader or another authorised method is required.';
      return;
    }
    try {
      const reader = new NDEFReader();
      await reader.scan();
      $('terminalMessage').textContent='NFC reader is listening. This unpaired app will not process or save a card identity.';
      reader.addEventListener('reading', () => {
        $('terminalMessage').textContent='NFC card/tag detected. The app is not paired, so no staff identity was loaded and no attendance event was sent.';
      }, {once:true});
      reader.addEventListener('readingerror', () => {
        $('terminalMessage').textContent='The NFC card/tag could not be read. No attendance event was created.';
      }, {once:true});
    } catch (_) {
      $('terminalMessage').textContent='NFC scan could not start. Check browser permission and NFC settings. No attendance event was created.';
    }
  }

  function installPromptSetup() {
    const button = $('installButton');
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
      if (button) button.hidden = false;
    });
    button?.addEventListener('click',async()=>{
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice.catch(()=>null);
      installPrompt=null;
      button.hidden=true;
    });
    window.addEventListener('appinstalled',()=>{
      if (button) button.hidden=true;
      if ($('terminalMessage')) $('terminalMessage').textContent='Attendance Terminal installed. Pair it from the Director account before recording any attendance.';
    });
  }

  function registerOfflineShell() {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{
        if ($('terminalMessage')) $('terminalMessage').textContent='The app shell opened, but offline installation support could not be registered in this browser.';
      });
    }
  }

  function cleanUpCamera() {
    activeStream?.getTracks().forEach(track=>track.stop());
    activeStream=null;
  }

  document.addEventListener('DOMContentLoaded',()=>{
    updateConnection();
    detectQr();
    detectNfc();
    detectPlatformAuthenticator();
    installPromptSetup();
    registerOfflineShell();
    $('qrCapability')?.addEventListener('click',scanQrCapabilityDemo);
    $('nfcCapability')?.addEventListener('click',scanNfcCapabilityDemo);
    window.addEventListener('online',updateConnection);
    window.addEventListener('offline',updateConnection);
    window.addEventListener('pagehide',cleanUpCamera);
  });
})();