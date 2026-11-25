const JKANIME_URL = 'https://jkanime.net/';
const ALARM_NAME = 'checkJKAnime';
const DEFAULT_SETTINGS = {
  checkIntervalMinutes: 60,
  preferredServer: 'mediafire',
  notificationsEnabled: true
};
const FETCH_TIMEOUT_MS = 15000;
const DOWNLOAD_TOKEN_TTL_MS = 60000;

// Respaldo en memoria si chrome.storage.session no estuviera disponible
const memorySessionFallback = new Map();

const RESERVED_JK_PATHS = new Set([
  'directorio', 'horario', 'buscar', 'top', 'letra', 'genero',
  'tipo', 'estado', 'temporada', 'idioma', 'usuario', 'perfil',
  'login', 'registro', 'ajax', 'assets', 'cdn-cgi', 'terminos', 'historial'
]);

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  iexcl: '¡',
  iquest: '¿',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  uuml: 'ü',
  Uuml: 'Ü'
};

function decodeHtmlEntities(text) {
  if (typeof text !== 'string' || !text.includes('&')) return text || '';
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z0-9]+);/g, (fullMatch, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const codePoint = isHex
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      if (!Number.isNaN(codePoint) && codePoint > 0 && codePoint <= 0x10FFFF) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return fullMatch;
        }
      }
      return fullMatch;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, entity)
      ? NAMED_ENTITIES[entity]
      : fullMatch;
  });
}

function normalizeHttpUrl(rawUrl, baseUrl = JKANIME_URL) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(decodeHtmlEntities(rawUrl).trim(), baseUrl);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    // Ignorar URL inválida
  }
  return null;
}

function isAllowedHost(rawUrl, baseDomain) {
  try {
    const parsed = new URL(rawUrl);
    const validProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    const validHost =
      parsed.hostname === baseDomain ||
      parsed.hostname.endsWith(`.${baseDomain}`);
    return validProtocol && validHost;
  } catch {
    return false;
  }
}

function extractAnimeSlug(rawUrl) {
  try {
    const parsed = new URL(rawUrl, JKANIME_URL);
    if (!isAllowedHost(parsed.href, 'jkanime.net')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const candidate = parts[0].toLowerCase();
    if (RESERVED_JK_PATHS.has(candidate) || candidate.includes('.')) return null;
    return candidate;
  } catch {
    return null;
  }
}

async function getSettings() {
  const storage = await chrome.storage.local.get(['settings']);
  const saved = storage.settings && typeof storage.settings === 'object' ? storage.settings : {};
  const interval = [15, 30, 60, 120].includes(Number(saved.checkIntervalMinutes))
    ? Number(saved.checkIntervalMinutes)
    : DEFAULT_SETTINGS.checkIntervalMinutes;
  const preferredServer = saved.preferredServer === 'mp4upload' ? 'mp4upload' : 'mediafire';
  const notificationsEnabled =
    typeof saved.notificationsEnabled === 'boolean'
      ? saved.notificationsEnabled
      : DEFAULT_SETTINGS.notificationsEnabled;

  return {
    checkIntervalMinutes: interval,
    preferredServer,
    notificationsEnabled
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} en ${new URL(url).hostname}`);
    }
    return response;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado al conectar con ${new URL(url).hostname}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Gestión de datos efímeros en sesión (tokens de descarga y URLs de notificaciones)
async function setSessionValue(key, value) {
  if (chrome.storage && chrome.storage.session) {
    await chrome.storage.session.set({ [key]: value });
  } else {
    memorySessionFallback.set(key, value);
  }
}

async function consumeSessionValue(key) {
  if (chrome.storage && chrome.storage.session) {
    const result = await chrome.storage.session.get(key);
    const val = result[key];
    if (val !== undefined) {
      await chrome.storage.session.remove(key);
    }
    return val;
  }
  const val = memorySessionFallback.get(key);
  memorySessionFallback.delete(key);
  return val;
}

// Garantizar que la alarma periódica exista con el intervalo configurado
async function ensureAlarm(forceRecreate = false) {
  const settings = await getSettings();
  if (forceRecreate) {
    await chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: settings.checkIntervalMinutes
    });
    return;
  }
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing || existing.periodInMinutes !== settings.checkIntervalMinutes) {
    await chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: settings.checkIntervalMinutes
    });
  }
}

// Normalizar historial y favoritos previos (entidades HTML y metadatos de slug)
async function migrateStoredData() {
  const storage = await chrome.storage.local.get(['episodeHistory', 'favorites']);
  const updates = {};

  const historyList = Array.isArray(storage.episodeHistory) ? storage.episodeHistory : [];
  if (historyList.length > 0) {
    let historyChanged = false;
    const normalizedHistory = historyList.map((ep) => {
      if (!ep || typeof ep !== 'object') return ep;
      const decodedName = decodeHtmlEntities(ep.name || '');
      const decodedFullTitle = decodeHtmlEntities(ep.fullTitle || '');
      const decodedEpNumber = decodeHtmlEntities(ep.epNumber || '');
      const derivedSlug = ep.slug || extractAnimeSlug(ep.url);
      if (
        decodedName !== ep.name ||
        decodedFullTitle !== ep.fullTitle ||
        decodedEpNumber !== ep.epNumber ||
        derivedSlug !== ep.slug
      ) {
        historyChanged = true;
        return {
          ...ep,
          name: decodedName,
          fullTitle: decodedFullTitle,
          epNumber: decodedEpNumber,
          slug: derivedSlug
        };
      }
      return ep;
    });
    if (historyChanged) {
      updates.episodeHistory = normalizedHistory;
    }
  }

  const effectiveHistory = updates.episodeHistory || historyList;

  if (storage.favorites && typeof storage.favorites === 'object') {
    let favsChanged = false;
    const normalizedFavorites = {};

    for (const [rawKey, val] of Object.entries(storage.favorites)) {
      const cleanKey = decodeHtmlEntities(rawKey).trim();
      if (!cleanKey) continue;
      if (cleanKey !== rawKey) favsChanged = true;

      if (val && typeof val === 'object') {
        normalizedFavorites[cleanKey] = {
          image: normalizeHttpUrl(val.image) || null,
          slug: val.slug || extractAnimeSlug(val.seriesUrl) || null,
          seriesUrl: normalizeHttpUrl(val.seriesUrl) || null
        };
      } else {
        const matchedEp = effectiveHistory.find((h) => h && h.name === cleanKey);
        const slug = matchedEp ? (matchedEp.slug || extractAnimeSlug(matchedEp.url)) : null;
        const image =
          typeof val === 'string'
            ? normalizeHttpUrl(val)
            : (matchedEp && normalizeHttpUrl(matchedEp.image)) || null;
        normalizedFavorites[cleanKey] = {
          image: image || null,
          slug: slug || null,
          seriesUrl: slug ? `${JKANIME_URL}${slug}/` : null
        };
        favsChanged = true;
      }
    }

    if (favsChanged) {
      updates.favorites = normalizedFavorites;
    }
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

// Desempacador seguro (sin eval) para scripts p,a,c,k,e,d de Mp4Upload
function unpackPackedScript(html) {
  const packedMatch =
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\(\s*'((?:\\.|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'])*)'\.split\('\|'\)/i.exec(
      html
    );
  if (!packedMatch) return null;

  const payload = packedMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const radix = parseInt(packedMatch[2], 10);
  let count = parseInt(packedMatch[3], 10);
  const symtab = packedMatch[4].split('|');
  if (!radix || radix < 2 || radix > 62 || Number.isNaN(count) || symtab.length === 0) {
    return null;
  }

  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function encodeBase(num, base) {
    if (num < base) {
      return num < 36 ? num.toString(36) : alphabet[num] || '';
    }
    return encodeBase(Math.floor(num / base), base) + encodeBase(num % base, base);
  }

  const dictionary = new Map();
  while (count--) {
    const token = encodeBase(count, radix);
    dictionary.set(token, symtab[count] || token);
  }

  return payload.replace(/\b[0-9a-zA-Z]+\b/g, (word) =>
    dictionary.has(word) ? dictionary.get(word) : word
  );
}

function extractMp4UploadDirectUrl(mp4Html, baseUrl) {
  const directRegex = /(?:src\s*:\s*|<source[^>]+src=)["'](https?:\/\/[^"'\s<>]+\.mp4)["']/i;
  const plainMatch = directRegex.exec(mp4Html);
  if (plainMatch) {
    return normalizeHttpUrl(plainMatch[1], baseUrl);
  }

  const unpacked = unpackPackedScript(mp4Html);
  if (unpacked) {
    const unpackedMatch =
      directRegex.exec(unpacked) || /(https?:\/\/[^"'\s<>]+\.mp4)/i.exec(unpacked);
    if (unpackedMatch) {
      return normalizeHttpUrl(unpackedMatch[1], baseUrl);
    }
  }
  return null;
}

function collectDownloadCandidates(episodeHtml, episodeUrl) {
  const buckets = {
    mediafire: [],
    mp4upload: [],
    mega: [],
    '1fichier': []
  };

  function pushUnique(type, rawLink) {
    const normalized = normalizeHttpUrl(rawLink, episodeUrl);
    if (normalized && !buckets[type].includes(normalized)) {
      buckets[type].push(normalized);
    }
  }

  // 1. Extraer de var servers = [...]
  const serversMatch = /var\s+servers\s*=\s*(\[[\s\S]*?\]);/.exec(episodeHtml);
  if (serversMatch) {
    try {
      const servers = JSON.parse(serversMatch[1]);
      for (const srv of servers) {
        if (!srv || typeof srv.server !== 'string' || !srv.remote) continue;
        const serverKey = srv.server.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(buckets, serverKey)) {
          try {
            pushUnique(serverKey, atob(srv.remote).trim());
          } catch {
            // Ignorar base64 inválido
          }
        }
      }
    } catch {
      // Ignorar JSON malformado y continuar con enlaces HTML
    }
  }

  // 2. Extraer de la tabla/enlaces HTML de descarga directa en la página del episodio
  const anchorRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let aMatch;
  while ((aMatch = anchorRegex.exec(episodeHtml)) !== null) {
    const href = normalizeHttpUrl(aMatch[1], episodeUrl);
    if (!href) continue;
    if (isAllowedHost(href, 'mediafire.com')) {
      pushUnique('mediafire', href);
    } else if (isAllowedHost(href, 'mp4upload.com')) {
      pushUnique('mp4upload', href);
    } else if (isAllowedHost(href, 'mega.nz') || isAllowedHost(href, 'mega.co.nz')) {
      pushUnique('mega', href);
    } else if (isAllowedHost(href, '1fichier.com')) {
      pushUnique('1fichier', href);
    }
  }

  return buckets;
}

async function markEpisodeDownloaded(episodeUrl, fullTitle) {
  const storage = await chrome.storage.local.get(['downloadedEpisodes']);
  const current = Array.isArray(storage.downloadedEpisodes) ? storage.downloadedEpisodes : [];
  const identifiers = [episodeUrl, fullTitle].filter(Boolean);
  const next = [...identifiers, ...current.filter((item) => !identifiers.includes(item))].slice(
    0,
    250
  );
  await chrome.storage.local.set({ downloadedEpisodes: next });
}

// Configurar alarma al instalar o actualizar
chrome.runtime.onInstalled.addListener(async () => {
  await migrateStoredData();
  await ensureAlarm(true);
  await checkNewEpisodes();
});

// Revalidar alarma y revisar episodios al abrir el navegador
chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm(false);
  await checkNewEpisodes();
});

// Escuchar disparos periódicos de la alarma
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === ALARM_NAME) {
    checkNewEpisodes();
  }
});

// Salvaguarda adicional cuando despierta el Service Worker
ensureAlarm(false).catch((err) => console.error('Error verificando alarma:', err));

// Abrir el episodio cuando el usuario hace clic en una notificación
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const episodeUrl = await consumeSessionValue(`notif_${notificationId}`);
  if (episodeUrl && isAllowedHost(episodeUrl, 'jkanime.net')) {
    chrome.tabs.create({ url: episodeUrl });
  }
  chrome.notifications.clear(notificationId);
});

// Escuchar mensajes del popup y content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request.action !== 'string') return false;

  if (request.action === 'forceCheck') {
    checkNewEpisodes()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ status: 'error', message: err.message || String(err) }));
    return true;
  }

  if (request.action === 'clearBadge') {
    chrome.action.setBadgeText({ text: '' });
    chrome.storage.local.set({ badgeCount: 0 });
    sendResponse({ status: 'ok' });
    return false;
  }

  if (request.action === 'updateSettings') {
    (async () => {
      const incoming = request.settings && typeof request.settings === 'object' ? request.settings : {};
      const current = await getSettings();
      const updated = {
        checkIntervalMinutes: [15, 30, 60, 120].includes(Number(incoming.checkIntervalMinutes))
          ? Number(incoming.checkIntervalMinutes)
          : current.checkIntervalMinutes,
        preferredServer: incoming.preferredServer === 'mp4upload' ? 'mp4upload' : 'mediafire',
        notificationsEnabled:
          typeof incoming.notificationsEnabled === 'boolean'
            ? incoming.notificationsEnabled
            : current.notificationsEnabled
      };
      await chrome.storage.local.set({ settings: updated });
      await ensureAlarm(true);
      sendResponse({ status: 'ok', settings: updated });
    })().catch((err) => sendResponse({ status: 'error', message: err.message || String(err) }));
    return true;
  }

  if (request.action === 'fetchAnimeMetadata') {
    fetchAnimeMetadataBySlug(request.slug)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ status: 'error', message: err.message || String(err) }));
    return true;
  }

  if (request.action === 'downloadEpisode') {
    handleDownload(request.url, request.name, request.epNumber, request.fullTitle)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ status: 'error', message: err.message || String(err) }));
    return true;
  }

  if (request.action === 'consumeDownloadToken') {
    if (!sender.tab || typeof request.token !== 'string' || !request.token) {
      sendResponse({ status: 'error' });
      return false;
    }
    consumeSessionValue(`dl_${request.token}`)
      .then((payload) => {
        if (
          !payload ||
          Date.now() - payload.createdAt > DOWNLOAD_TOKEN_TTL_MS ||
          !isAllowedHost(payload.url, 'mp4upload.com')
        ) {
          sendResponse({ status: 'expired' });
          return;
        }
        sendResponse({ status: 'ok', url: payload.url, name: payload.name });
      })
      .catch(() => sendResponse({ status: 'error' }));
    return true;
  }

  if (request.action === 'closeCurrentTab') {
    if (sender.tab && typeof sender.tab.id === 'number') {
      chrome.tabs.remove(sender.tab.id, () => {
        void chrome.runtime.lastError;
        sendResponse({ status: 'ok' });
      });
      return true;
    }
    sendResponse({ status: 'ignored' });
    return false;
  }

  return false;
});

async function fetchAnimeMetadataBySlug(rawSlug) {
  const cleanSlug = String(rawSlug || '').toLowerCase().replace(/[^a-z0-9-_]/g, '');
  if (!cleanSlug || RESERVED_JK_PATHS.has(cleanSlug)) {
    return { status: 'error', message: 'Slug de anime inválido' };
  }

  const seriesUrl = `${JKANIME_URL}${cleanSlug}/`;
  const res = await fetchWithTimeout(seriesUrl);
  const html = await res.text();

  const h1Match = /<div\b[^>]*class=["'][^"']*anime__details__title[^"']*["'][^>]*>\s*<h3>([^<]+)<\/h3>/i.exec(html) ||
    /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  const ogTitleMatch = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const ogImageMatch = /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html) ||
    /<div\b[^>]*class=["'][^"']*anime__details__pic[^"']*["'][^>]*data-setbg=["']([^"']+)["']/i.exec(html);

  let name = '';
  if (h1Match) {
    name = decodeHtmlEntities(h1Match[1]).trim();
  } else if (ogTitleMatch) {
    name = decodeHtmlEntities(ogTitleMatch[1])
      .replace(/^Ver\s+/i, '')
      .replace(/\s+(?:Sub\s+Espa[ñn]ol|Online|HD).*$/i, '')
      .replace(/\s*[-|—]\s*JKAnime.*$/i, '')
      .trim();
  }

  if (!name) {
    name = cleanSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const image = ogImageMatch ? normalizeHttpUrl(ogImageMatch[1], seriesUrl) : null;
  return {
    status: 'ok',
    name,
    image,
    slug: cleanSlug,
    seriesUrl
  };
}

async function handleDownload(url, animeName, epNumber, fullTitle) {
  try {
    const episodeUrl = normalizeHttpUrl(url);
    if (!episodeUrl || !isAllowedHost(episodeUrl, 'jkanime.net')) {
      return { status: 'error', message: 'URL de episodio inválida' };
    }

    const settings = await getSettings();
    const res = await fetchWithTimeout(episodeUrl);
    const text = await res.text();

    const buckets = collectDownloadCandidates(text, episodeUrl);
    const priorityOrder =
      settings.preferredServer === 'mp4upload'
        ? ['mp4upload', 'mediafire', 'mega', '1fichier']
        : ['mediafire', 'mp4upload', 'mega', '1fichier'];

    let chosenServer = null;
    let targetLink = null;
    for (const serverType of priorityOrder) {
      if (buckets[serverType] && buckets[serverType].length > 0) {
        chosenServer = serverType;
        targetLink = buckets[serverType][0];
        break;
      }
    }

    if (!targetLink || !chosenServer) {
      return { status: 'error', message: 'No se encontraron servidores compatibles en el episodio' };
    }

    if (chosenServer === 'mediafire') {
      try {
        const mfRes = await fetchWithTimeout(targetLink);
        const mfText = await mfRes.text();
        const mfMatch = /(https?:\/\/download\d*\.mediafire\.com\/[^"'\s<>]+)/i.exec(mfText);
        if (mfMatch) {
          const directMfUrl = normalizeHttpUrl(mfMatch[1]);
          if (directMfUrl && isAllowedHost(directMfUrl, 'mediafire.com')) {
            await chrome.tabs.create({ url: directMfUrl });
            await markEpisodeDownloaded(episodeUrl, fullTitle);
            return { status: 'success', serverUsed: 'mediafire' };
          }
        }
      } catch (err) {
        console.warn('Fallo al extraer enlace directo de MediaFire, abriendo página:', err);
      }
      await chrome.tabs.create({ url: targetLink });
      await markEpisodeDownloaded(episodeUrl, fullTitle);
      return { status: 'success', serverUsed: 'mediafire' };
    }

    if (chosenServer === 'mp4upload') {
      try {
        const mp4Res = await fetchWithTimeout(targetLink);
        const mp4Text = await mp4Res.text();
        const rawDirectUrl = extractMp4UploadDirectUrl(mp4Text, targetLink);

        if (rawDirectUrl && isAllowedHost(rawDirectUrl, 'mp4upload.com')) {
          let directUrl = rawDirectUrl;

          if (animeName && epNumber) {
            const safeName = String(animeName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const safeEp = String(epNumber).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const customFileName = `${safeName || 'anime'}-${safeEp || 'ep'}.mp4`;

            directUrl = directUrl.replace(/[^/]+\.mp4$/i, customFileName);

            const token = crypto.randomUUID();
            await setSessionValue(`dl_${token}`, {
              url: directUrl,
              name: customFileName,
              createdAt: Date.now()
            });

            const baseTargetLink = targetLink.split('#')[0];
            const autoUrl = `${baseTargetLink}#jk-dl-token=${encodeURIComponent(token)}`;
            await chrome.tabs.create({ url: autoUrl, active: false });
            await markEpisodeDownloaded(episodeUrl, fullTitle);
            return { status: 'success', serverUsed: 'mp4upload' };
          }

          await chrome.tabs.create({ url: directUrl });
          await markEpisodeDownloaded(episodeUrl, fullTitle);
          return { status: 'success', serverUsed: 'mp4upload' };
        }
      } catch (err) {
        console.warn('Error al extraer enlace directo de Mp4Upload:', err);
      }

      await chrome.tabs.create({ url: targetLink });
      await markEpisodeDownloaded(episodeUrl, fullTitle);
      return { status: 'success', serverUsed: 'mp4upload' };
    }

    // Respaldo para Mega o 1Fichier cuando MediaFire/Mp4Upload no están en el episodio
    await chrome.tabs.create({ url: targetLink });
    await markEpisodeDownloaded(episodeUrl, fullTitle);
    return { status: 'success', serverUsed: chosenServer };
  } catch (err) {
    return { status: 'error', message: err.message || String(err) };
  }
}

function parseFrontPageEpisodes(html) {
  const episodes = [];
  const cardRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>\s*<div\b[^>]*\bclass=["'][^"']*\bd-thumb\b[^"']*["'][^>]*>\s*<img\b([^>]*)>/gi;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const rawHref = match[1];
    const imgAttrs = match[2];

    const altMatch = /\balt=["']([^"']+)["']/i.exec(imgAttrs);
    if (!altMatch) continue;

    const picMatch =
      /\bdata-animepic=["']([^"']+)["']/i.exec(imgAttrs) ||
      /\bsrc=["']([^"']+)["']/i.exec(imgAttrs);

    const url = normalizeHttpUrl(rawHref, JKANIME_URL);
    if (!url) continue;

    const image = picMatch ? normalizeHttpUrl(picMatch[1], JKANIME_URL) : null;
    const fullTitle = decodeHtmlEntities(altMatch[1]).trim();
    if (!fullTitle) continue;

    const lastDashIndex = fullTitle.lastIndexOf('-');
    let name = fullTitle;
    let epNumber = '';

    if (lastDashIndex !== -1) {
      const candidateEp = fullTitle.substring(lastDashIndex + 1).trim();
      // Separar solo si lo que sigue al guion parece un número de episodio/OVA o texto corto de capítulo
      if (/^(\d+(\.\d+)?|ova\s*\d*|especial\s*\d*|final)$/i.test(candidateEp) || candidateEp.length <= 6) {
        name = fullTitle.substring(0, lastDashIndex).trim();
        epNumber = candidateEp;
      }
    }

    const slug = extractAnimeSlug(url);
    episodes.push({ name, epNumber, fullTitle, url, image, slug });
  }

  return episodes;
}

function isEpisodeFavorite(ep, favorites) {
  if (!ep || !favorites || typeof favorites !== 'object') return false;
  if (favorites[ep.name] !== undefined) return true;

  const epNameLower = (ep.name || '').toLowerCase();
  const epSlug = ep.slug || extractAnimeSlug(ep.url);

  for (const [favName, meta] of Object.entries(favorites)) {
    if (favName.toLowerCase() === epNameLower) return true;
    if (epSlug && meta && typeof meta === 'object' && meta.slug && meta.slug === epSlug) {
      return true;
    }
  }
  return false;
}

let checkInFlightPromise = null;

function checkNewEpisodes() {
  if (checkInFlightPromise) return checkInFlightPromise;
  checkInFlightPromise = runCheckNewEpisodes().finally(() => {
    checkInFlightPromise = null;
  });
  return checkInFlightPromise;
}

async function runCheckNewEpisodes() {
  try {
    const settings = await getSettings();
    const response = await fetchWithTimeout(JKANIME_URL);
    const html = await response.text();
    const currentEpisodes = parseFrontPageEpisodes(html);

    if (currentEpisodes.length === 0) {
      const msg = 'No se encontraron episodios en la portada de JKAnime.';
      console.warn(msg);
      await chrome.storage.local.set({ lastCheckError: msg });
      return { status: 'error', message: msg };
    }

    const storage = await chrome.storage.local.get([
      'episodeHistory',
      'favorites',
      'badgeCount',
      'unseenEpisodes'
    ]);
    const history = Array.isArray(storage.episodeHistory) ? storage.episodeHistory : [];
    const favorites = storage.favorites && typeof storage.favorites === 'object' ? storage.favorites : {};
    const unseenEpisodes = Array.isArray(storage.unseenEpisodes) ? storage.unseenEpisodes : [];
    let badgeCount = Number(storage.badgeCount) || 0;

    const isFirstPopulate = history.length === 0;
    const newEpisodes = currentEpisodes.filter(
      (ep) => !history.some((h) => h && (h.fullTitle === ep.fullTitle || h.url === ep.url))
    );

    const updates = {
      lastCheckAt: Date.now(),
      lastCheckError: null
    };

    if (newEpisodes.length > 0) {
      let favsDetected = 0;
      const newlyUnseen = [...unseenEpisodes];

      // Evitar inundar de notificaciones viejas en la primera carga inicial
      if (!isFirstPopulate) {
        for (const ep of newEpisodes) {
          if (isEpisodeFavorite(ep, favorites)) {
            favsDetected++;
            if (!newlyUnseen.includes(ep.fullTitle)) {
              newlyUnseen.unshift(ep.fullTitle);
            }

            if (settings.notificationsEnabled) {
              const notifId = `jk-${crypto.randomUUID()}`;
              await setSessionValue(`notif_${notifId}`, ep.url);
              chrome.notifications.create(notifId, {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: '¡Nuevo episodio de tu Favorito!',
                message: ep.epNumber ? `${ep.name} - Episodio ${ep.epNumber}` : ep.name
              });
            }
          }
        }
      }

      updates.episodeHistory = [...newEpisodes, ...history].slice(0, 100);
      updates.unseenEpisodes = newlyUnseen.slice(0, 50);

      if (favsDetected > 0) {
        badgeCount += favsDetected;
        updates.badgeCount = badgeCount;
        chrome.action.setBadgeText({ text: badgeCount.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
      }
    } else {
      const updatedHistory = [...currentEpisodes];
      for (const h of history) {
        if (h && !updatedHistory.some((ep) => ep.fullTitle === h.fullTitle || ep.url === h.url)) {
          updatedHistory.push(h);
        }
      }
      updates.episodeHistory = updatedHistory.slice(0, 100);
    }

    await chrome.storage.local.set(updates);
    return { status: 'ok', count: currentEpisodes.length, newCount: newEpisodes.length };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error('Error al comprobar episodios en JKAnime:', error);
    await chrome.storage.local.set({ lastCheckError: message });
    return { status: 'error', message };
  }
}
