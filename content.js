// Este script se inyecta en mp4upload.com para iniciar la descarga desde el propio origen
// y proveer el Referer correcto a gestores externos como Free Download Manager (FDM).
// Usa un token efímero de un solo uso validado contra background.js para impedir abusos externos.

(function initAutoDownload() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('jk-dl-token=')) return;

  const params = new URLSearchParams(hash.substring(1));
  const token = params.get('jk-dl-token');
  if (!token) return;

  // Limpiar el hash de la barra de direcciones inmediatamente
  history.replaceState(null, '', window.location.pathname + window.location.search);

  function isValidMp4UploadDownloadUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const validProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
      const validHost =
        parsed.hostname === 'mp4upload.com' ||
        parsed.hostname.endsWith('.mp4upload.com');
      return validProtocol && validHost;
    } catch {
      return false;
    }
  }

  function sanitizeFileName(rawName) {
    const cleaned = String(rawName || 'episodio.mp4')
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
      .trim();
    return cleaned.endsWith('.mp4') ? cleaned : `${cleaned}.mp4`;
  }

  chrome.runtime.sendMessage({ action: 'consumeDownloadToken', token }, (response) => {
    if (chrome.runtime.lastError || !response || response.status !== 'ok') {
      return;
    }

    const { url, name } = response;
    if (!isValidMp4UploadDownloadUrl(url)) {
      console.warn('JK Downloader: URL de descarga rechazada por validación de dominio.');
      return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFileName(name);
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Cerrar la pestaña auxiliar tras iniciar la descarga
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'closeCurrentTab' }, () => {
        if (chrome.runtime.lastError) {
          window.close();
        }
      });
    }, 2000);
  });
})();
