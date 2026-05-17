const JKANIME_URL = 'https://jkanime.net/';
const CHECK_INTERVAL_MINUTES = 60;

// Configurar alarma al instalar o iniciar
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkJKAnime', {
    periodInMinutes: CHECK_INTERVAL_MINUTES
  });
  // Realizar la primera verificación al instalar
  checkNewEpisodes();
});

// Escuchar la alarma
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkJKAnime') {
    checkNewEpisodes();
  }
});

// Escuchar mensajes del popup para forzar verificación o limpiar badge
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'forceCheck') {
    checkNewEpisodes().then(() => sendResponse({ status: 'done' }));
    return true; // Asíncrono
  }
  if (request.action === 'clearBadge') {
    chrome.action.setBadgeText({ text: '' });
    chrome.storage.local.set({ badgeCount: 0 });
  }
  if (request.action === 'downloadEpisode') {
    handleDownload(request.url, request.name, request.epNumber).then(res => sendResponse(res));
    return true; // Asíncrono
  }
});

async function handleDownload(url, animeName, epNumber) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    
    const match = /var\s+servers\s*=\s*(\[.*?\]);/.exec(text);
    if (!match) return { status: 'error', message: 'No se encontraron servidores' };
    
    const servers = JSON.parse(match[1]);
    let targetLink = null;
    let isMediafire = false;
    
    for (const target of ['mediafire', 'mp4upload']) {
      for (const srv of servers) {
        if (srv.server.toLowerCase() === target) {
          targetLink = atob(srv.remote).trim();
          isMediafire = target === 'mediafire';
          break;
        }
      }
      if (targetLink) break;
    }
    
    if (!targetLink) return { status: 'error', message: 'Ni Mediafire ni Mp4upload encontrados' };
    
    if (isMediafire) {
      const mfRes = await fetch(targetLink);
      const mfText = await mfRes.text();
      const mfMatch = /(https?:\/\/download\d*\.mediafire\.com\/[^"'\s]+)/.exec(mfText);
      if (mfMatch) {
        chrome.tabs.create({ url: mfMatch[1] });
        return { status: 'success' };
      }
      // Si falla el enlace directo, abrimos la pagina de mediafire
      chrome.tabs.create({ url: targetLink });
      return { status: 'success' };
    } else {
      // Intentar extraer enlace directo de mp4upload
      try {
        const mp4Res = await fetch(targetLink);
        const mp4Text = await mp4Res.text();
        
        let directUrl = null;
        
        // El reproductor (videojs) asigna el src usando JS: player.src({ src: "https://...mp4" })
        const scriptMatch = /src:\s*["'](https?:\/\/[^"']+\.mp4)["']/i.exec(mp4Text);
        if (scriptMatch) {
          directUrl = scriptMatch[1];
        }

        if (directUrl) {
          if (animeName && epNumber) {
            let safeName = animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            let safeEp = epNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            let customFileName = `${safeName}-${safeEp}.mp4`;
            
            directUrl = directUrl.replace(/[^/]+\.mp4$/i, customFileName);
            
            // Para que funcione con gestores como Free Download Manager (FDM), 
            // el Referer tiene que ser la página de mp4upload. 
            // Abrimos la página en una nueva pestaña (oculta o secundaria) pasando los datos
            // por el hash, que será procesado por nuestro content script (content.js).
            const autoUrl = targetLink + '#auto-download=1&url=' + encodeURIComponent(directUrl) + '&name=' + encodeURIComponent(customFileName);
            chrome.tabs.create({ url: autoUrl, active: false });
            return { status: 'success' };
          }

          chrome.tabs.create({ url: directUrl });
          return { status: 'success' };
        }
      } catch (err) {
        console.error("Error al extraer mp4upload:", err);
      }
      
      // Si falla, abrimos la página de mp4upload normal
      chrome.tabs.create({ url: targetLink });
      return { status: 'success' };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

async function checkNewEpisodes() {
  try {
    const response = await fetch(JKANIME_URL);
    const html = await response.text();

    // Extraer los episodios, imagen (usamos data-animepic para la versión antispoiler) y su URL de la portada usando Regex
    const regex = /<a\s+href="([^"]+)"><div\s+class="d-thumb"><img[^>]+data-animepic="([^"]+)"[^>]*alt="([^"]+)"/g;
    let match;
    const currentEpisodes = [];

    while ((match = regex.exec(html)) !== null) {
      let url = match[1];
      let image = match[2];
      let fullTitle = match[3]; // Ej: "Digimon Beatbreak - 27"
      // Separar nombre y capítulo
      let lastDashIndex = fullTitle.lastIndexOf('-');
      
      let name = fullTitle;
      let epNumber = "";

      if (lastDashIndex !== -1) {
        name = fullTitle.substring(0, lastDashIndex).trim();
        epNumber = fullTitle.substring(lastDashIndex + 1).trim();
      }

      currentEpisodes.push({ name, epNumber, fullTitle, url, image });
    }

    if (currentEpisodes.length === 0) return; // Fallo al parsear o sitio cambiado

    // Leer historial y favoritos almacenados
    const storage = await chrome.storage.local.get(['episodeHistory', 'favorites', 'badgeCount']);
    const history = storage.episodeHistory || [];
    const favorites = storage.favorites || {};
    let badgeCount = storage.badgeCount || 0;

    // Detectar cuáles son realmente nuevos
    // (Asegurarnos de que no existan ya en el historial por 'fullTitle')
    const newEpisodes = currentEpisodes.filter(ep => !history.some(h => h.fullTitle === ep.fullTitle));

    if (newEpisodes.length > 0) {
      let favsNotified = 0;

      for (const ep of newEpisodes) {
        // ¿Es un anime favorito? (Comprobamos si el nombre exacto está marcado como true)
        if (favorites[ep.name]) {
          // Lanzar notificación
          chrome.notifications.create(`jk-${Date.now()}-${Math.random()}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '¡Nuevo episodio de tu Favorito!',
            message: `${ep.name} - Episodio ${ep.epNumber}`
          });
          favsNotified++;
        }
      }

      // Actualizar historial (guardamos solo los últimos 100 para no llenar la memoria)
      const newHistory = [...newEpisodes, ...history].slice(0, 100);
      
      let updates = { episodeHistory: newHistory };

      // Actualizar badge si hubo notificaciones
      if (favsNotified > 0) {
        badgeCount += favsNotified;
        updates.badgeCount = badgeCount;
        chrome.action.setBadgeText({ text: badgeCount.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
      }

      await chrome.storage.local.set(updates);
    } else {
      console.log('No hay episodios nuevos en esta comprobación.');
      // Update the first few items in history with currentEpisodes to keep URLs fresh,
      // but keep the rest of the history intact up to 100 items.
      const updatedHistory = [...currentEpisodes];
      
      // Add items from old history that are not in currentEpisodes
      for (const h of history) {
        if (!updatedHistory.some(ep => ep.fullTitle === h.fullTitle)) {
          updatedHistory.push(h);
        }
      }
      
      await chrome.storage.local.set({ episodeHistory: updatedHistory.slice(0, 100) });
    }

  } catch (error) {
    console.error("Error al comprobar episodios en JKAnime:", error);
  }
}
