// Aplicar tema en caché de forma síncrona para evitar parpadeo blanco (FOUC)
(function applyCachedTheme() {
  const cachedTheme = localStorage.getItem('jk_theme');
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (cachedTheme === 'dark' || (!cachedTheme && prefersDark)) {
    document.body.classList.add('dark');
  }
})();

const SVG_NS = 'http://www.w3.org/2000/svg';
const JKANIME_BASE = 'https://jkanime.net/';
const RESERVED_JK_PATHS = new Set([
  'directorio', 'horario', 'buscar', 'top', 'letra', 'genero',
  'tipo', 'estado', 'temporada', 'idioma', 'usuario', 'perfil',
  'login', 'registro', 'ajax', 'assets', 'cdn-cgi', 'terminos', 'historial'
]);

const ICON_DEFINITIONS = {
  download: {
    size: 16,
    strokeWidth: '2.5',
    elements: [
      ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
      ['polyline', { points: '7 10 12 15 17 10' }],
      ['line', { x1: '12', x2: '12', y1: '15', y2: '3' }]
    ]
  },
  link: {
    size: 16,
    strokeWidth: '2.5',
    elements: [
      ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
      ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }]
    ]
  },
  star: {
    size: 18,
    strokeWidth: '2',
    className: 'star-icon',
    elements: [
      ['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }]
    ]
  },
  check: {
    size: 16,
    strokeWidth: '3',
    elements: [
      ['polyline', { points: '20 6 9 17 4 12' }]
    ]
  },
  error: {
    size: 16,
    strokeWidth: '2.5',
    elements: [
      ['line', { x1: '18', y1: '6', x2: '6', y2: '18' }],
      ['line', { x1: '6', y1: '6', x2: '18', y2: '18' }]
    ]
  },
  spinner: {
    size: 16,
    strokeWidth: '2.5',
    className: 'spin-icon',
    elements: [
      ['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }]
    ]
  }
};

function createSvgIcon(name) {
  const def = ICON_DEFINITIONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(def.size));
  svg.setAttribute('height', String(def.size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', def.strokeWidth);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (def.className) {
    svg.setAttribute('class', def.className);
  }

  for (const [tag, attrs] of def.elements) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [attrName, attrVal] of Object.entries(attrs)) {
      child.setAttribute(attrName, attrVal);
    }
    svg.appendChild(child);
  }
  return svg;
}

function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeSearchText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extractAnimeSlug(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const validHost =
      parsed.hostname === 'jkanime.net' || parsed.hostname.endsWith('.jkanime.net');
    if (!validHost) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const slug = parts[0].toLowerCase();
    if (RESERVED_JK_PATHS.has(slug) || slug.includes('.')) return null;
    return slug;
  } catch {
    return null;
  }
}

function cleanTabTitle(rawTitle, fallbackSlug) {
  if (typeof rawTitle === 'string' && rawTitle.trim()) {
    const cleaned = rawTitle
      .replace(/^Ver\s+/i, '')
      .replace(/\s+(?:Episodio|Cap[íi]tulo)\s+\d+.*$/i, '')
      .replace(/\s+(?:Sub\s+Espa[ñn]ol|Online|HD|Latino).*$/i, '')
      .replace(/\s*[-|—]\s*JKAnime.*$/i, '')
      .trim();
    if (cleaned) return cleaned;
  }
  return String(fallbackSlug || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function setListMessage(container, text, className = 'empty-msg') {
  const msgEl = document.createElement('div');
  msgEl.className = className;
  msgEl.textContent = text;
  container.replaceChildren(msgEl);
}

function createBadgePill(text, variantClass) {
  const badge = document.createElement('span');
  badge.className = `badge-pill ${variantClass}`;
  badge.textContent = text;
  return badge;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Elementos UI principales
  const btnForceCheck = document.getElementById('btn-force-check');
  const forceCheckIcon = btnForceCheck.querySelector('svg');
  const forceCheckLabel = btnForceCheck.querySelector('span');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');
  const btnSettingsToggle = document.getElementById('btn-settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const selectInterval = document.getElementById('select-interval');
  const selectServer = document.getElementById('select-server');
  const chkNotifications = document.getElementById('chk-notifications');
  const btnExportFavs = document.getElementById('btn-export-favs');
  const btnImportFavs = document.getElementById('btn-import-favs');
  const inputImportFavs = document.getElementById('input-import-favs');

  const statusBanner = document.getElementById('status-banner');
  const activeAnimeBar = document.getElementById('active-anime-bar');
  const activeAnimeNameEl = document.getElementById('active-anime-name');
  const btnAddActiveFav = document.getElementById('btn-add-active-fav');

  const searchInput = document.getElementById('search-input');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabBtnFavorites = document.getElementById('tab-btn-favorites');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabIndicator = document.getElementById('tab-indicator');
  const recentList = document.getElementById('recent-list');
  const favoritesList = document.getElementById('favorites-list');

  // Estado en memoria durante esta sesión del popup
  let history = [];
  let favorites = {};
  let downloadedSet = new Set();
  const sessionUnseenSet = new Set();
  let initialUnseenCaptured = false;
  let searchQuery = '';
  let activeTabCandidate = null;
  let bannerTimer = null;

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark', isDark);
    sunIcon.style.display = isDark ? 'block' : 'none';
    moonIcon.style.display = isDark ? 'none' : 'block';
    localStorage.setItem('jk_theme', isDark ? 'dark' : 'light');
  }

  function showStatusBanner(message, type = 'error', autoHideMs = 0) {
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
    if (!message) {
      statusBanner.hidden = true;
      statusBanner.textContent = '';
      statusBanner.classList.remove('info');
      return;
    }
    statusBanner.textContent = message;
    statusBanner.classList.toggle('info', type === 'info');
    statusBanner.hidden = false;

    if (autoHideMs > 0) {
      bannerTimer = setTimeout(() => {
        statusBanner.hidden = true;
      }, autoHideMs);
    }
  }

  function normalizeFavoriteEntry(rawVal, fallbackEp) {
    const epSlug = fallbackEp ? (fallbackEp.slug || extractAnimeSlug(fallbackEp.url)) : null;
    if (rawVal && typeof rawVal === 'object') {
      const slug = rawVal.slug || extractAnimeSlug(rawVal.seriesUrl) || epSlug || null;
      const image = isSafeHttpUrl(rawVal.image)
        ? rawVal.image
        : fallbackEp && isSafeHttpUrl(fallbackEp.image)
        ? fallbackEp.image
        : null;
      const seriesUrl = isSafeHttpUrl(rawVal.seriesUrl)
        ? rawVal.seriesUrl
        : slug
        ? `${JKANIME_BASE}${slug}/`
        : null;
      return { image, slug, seriesUrl };
    }

    const image = isSafeHttpUrl(rawVal)
      ? rawVal
      : fallbackEp && isSafeHttpUrl(fallbackEp.image)
      ? fallbackEp.image
      : null;
    return {
      image,
      slug: epSlug || null,
      seriesUrl: epSlug ? `${JKANIME_BASE}${epSlug}/` : null
    };
  }

  function findFavoriteKey(name, slug) {
    if (name && Object.prototype.hasOwnProperty.call(favorites, name)) {
      return name;
    }
    const targetLower = String(name || '').toLowerCase();
    for (const [favKey, meta] of Object.entries(favorites)) {
      if (targetLower && favKey.toLowerCase() === targetLower) return favKey;
      if (slug && meta && typeof meta === 'object' && meta.slug === slug) return favKey;
    }
    return null;
  }

  function findLatestEpisodeForFavorite(favName, favMeta) {
    const targetLower = favName.toLowerCase();
    const targetSlug = favMeta && typeof favMeta === 'object' ? favMeta.slug : null;
    return (
      history.find((ep) => {
        if (!ep) return false;
        if (ep.name && ep.name.toLowerCase() === targetLower) return true;
        const epSlug = ep.slug || extractAnimeSlug(ep.url);
        return Boolean(targetSlug && epSlug && epSlug === targetSlug);
      }) || null
    );
  }

  function isEpisodeDownloaded(ep) {
    if (!ep) return false;
    return Boolean(
      (ep.url && downloadedSet.has(ep.url)) ||
        (ep.fullTitle && downloadedSet.has(ep.fullTitle))
    );
  }

  async function detectActiveJKAnimeTab() {
    if (!chrome.tabs || !chrome.tabs.query) return;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || !tab.url) {
        activeAnimeBar.hidden = true;
        return;
      }

      const slug = extractAnimeSlug(tab.url);
      if (!slug) {
        activeAnimeBar.hidden = true;
        return;
      }

      const matchingHistoryEp = history.find(
        (h) => h && (h.slug === slug || extractAnimeSlug(h.url) === slug)
      );
      const displayName = matchingHistoryEp
        ? matchingHistoryEp.name
        : cleanTabTitle(tab.title, slug);

      if (findFavoriteKey(displayName, slug)) {
        activeAnimeBar.hidden = true;
        return;
      }

      activeTabCandidate = {
        slug,
        name: displayName,
        image: matchingHistoryEp && isSafeHttpUrl(matchingHistoryEp.image) ? matchingHistoryEp.image : null,
        seriesUrl: `${JKANIME_BASE}${slug}/`
      };
      activeAnimeNameEl.textContent = displayName;
      activeAnimeNameEl.title = displayName;
      activeAnimeBar.hidden = false;
    } catch {
      activeAnimeBar.hidden = true;
    }
  }

  async function loadData() {
    const storage = await chrome.storage.local.get([
      'episodeHistory',
      'favorites',
      'theme',
      'lastCheckError',
      'unseenEpisodes',
      'downloadedEpisodes',
      'settings'
    ]);

    history = Array.isArray(storage.episodeHistory) ? storage.episodeHistory : [];
    favorites = storage.favorites && typeof storage.favorites === 'object' ? storage.favorites : {};
    downloadedSet = new Set(
      Array.isArray(storage.downloadedEpisodes) ? storage.downloadedEpisodes : []
    );

    // Capturar episodios nuevos al abrir el popup y limpiar el contador global
    if (!initialUnseenCaptured) {
      initialUnseenCaptured = true;
      if (Array.isArray(storage.unseenEpisodes)) {
        storage.unseenEpisodes.forEach((title) => sessionUnseenSet.add(title));
      }
      chrome.action.setBadgeText({ text: '' });
      chrome.storage.local.set({ badgeCount: 0, unseenEpisodes: [] });
    }

    const defaultDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(storage.theme || (defaultDark ? 'dark' : 'light'));

    const settings = storage.settings && typeof storage.settings === 'object' ? storage.settings : {};
    selectInterval.value = String([15, 30, 60, 120].includes(Number(settings.checkIntervalMinutes)) ? settings.checkIntervalMinutes : 60);
    selectServer.value = settings.preferredServer === 'mp4upload' ? 'mp4upload' : 'mediafire';
    chkNotifications.checked =
      typeof settings.notificationsEnabled === 'boolean' ? settings.notificationsEnabled : true;

    if (storage.lastCheckError) {
      showStatusBanner(storage.lastCheckError, 'error');
    }

    renderLists();
    await detectActiveJKAnimeTab();
  }

  function updateFavoritesTabCounter() {
    const count = Object.keys(favorites).length;
    tabBtnFavorites.textContent = count > 0 ? `Mis Favoritos (${count})` : 'Mis Favoritos';
  }

  function renderLists() {
    recentList.replaceChildren();
    favoritesList.replaceChildren();
    updateFavoritesTabCounter();

    const normalizedFilter = normalizeSearchText(searchQuery);

    // 1. Renderizar pestaña Últimos Episodios
    if (history.length === 0) {
      setListMessage(recentList, 'No hay episodios recientes. Haz clic en "Revisar".');
    } else {
      const baseRecent = normalizedFilter ? history : history.slice(0, 32);
      const filteredRecent = normalizedFilter
        ? baseRecent.filter(
            (ep) =>
              ep &&
              (normalizeSearchText(ep.name).includes(normalizedFilter) ||
                normalizeSearchText(ep.fullTitle).includes(normalizedFilter))
          )
        : baseRecent;

      if (filteredRecent.length === 0) {
        setListMessage(recentList, `Sin resultados para "${searchQuery.trim()}".`);
      } else {
        const fragment = document.createDocumentFragment();
        filteredRecent.forEach((ep) => {
          if (ep && typeof ep.name === 'string') {
            fragment.appendChild(createAnimeElement(ep, { mode: 'recent' }));
          }
        });
        recentList.appendChild(fragment);
      }
    }

    // 2. Renderizar pestaña Mis Favoritos
    const favNames = Object.keys(favorites);
    if (favNames.length === 0) {
      setListMessage(
        favoritesList,
        'No tienes animes favoritos guardados. Da clic a la ⭐ en recientes o abre un anime en JKAnime.'
      );
    } else {
      let needsSave = false;
      const sortedNames = favNames
        .slice()
        .sort((a, b) => a.localeCompare(b, 'es'))
        .filter((name) => !normalizedFilter || normalizeSearchText(name).includes(normalizedFilter));

      if (sortedNames.length === 0) {
        setListMessage(favoritesList, `Ningún favorito coincide con "${searchQuery.trim()}".`);
      } else {
        const fragment = document.createDocumentFragment();

        sortedNames.forEach((favName) => {
          const rawVal = favorites[favName];
          const latestEp = findLatestEpisodeForFavorite(
            favName,
            rawVal && typeof rawVal === 'object' ? rawVal : null
          );
          const normalizedMeta = normalizeFavoriteEntry(rawVal, latestEp);

          if (
            !rawVal ||
            typeof rawVal !== 'object' ||
            (!rawVal.image && normalizedMeta.image) ||
            (!rawVal.slug && normalizedMeta.slug)
          ) {
            favorites[favName] = normalizedMeta;
            needsSave = true;
          }

          const cardData = {
            name: favName,
            epNumber: latestEp ? latestEp.epNumber : '',
            fullTitle: latestEp ? latestEp.fullTitle : '',
            url: latestEp ? latestEp.url : null,
            openUrl: normalizedMeta.seriesUrl || (latestEp ? latestEp.url : null),
            image: normalizedMeta.image,
            slug: normalizedMeta.slug
          };

          fragment.appendChild(createAnimeElement(cardData, { mode: 'favorite' }));
        });

        favoritesList.appendChild(fragment);
      }

      if (needsSave) {
        chrome.storage.local.set({ favorites });
      }
    }
  }

  function openExternalUrl(targetUrl) {
    if (!isSafeHttpUrl(targetUrl)) return;
    chrome.tabs.create({ url: targetUrl });
  }

  // Construcción segura con APIs del DOM (cero innerHTML)
  function createAnimeElement(ep, { mode = 'recent' } = {}) {
    const isFavoriteTab = mode === 'favorite';
    const isUnseen = Boolean(ep.fullTitle && sessionUnseenSet.has(ep.fullTitle));
    const isDownloaded = isEpisodeDownloaded(ep);
    const clickTargetUrl = isFavoriteTab ? ep.openUrl || ep.url : ep.url;

    const div = document.createElement('div');
    div.className = `anime-item${isUnseen ? ' is-unseen' : ''}`;

    const imgContainer = document.createElement('div');
    imgContainer.className = 'anime-img-container';

    if (isSafeHttpUrl(ep.image)) {
      const img = document.createElement('img');
      img.className = 'anime-img';
      img.src = ep.image;
      img.alt = ep.name;
      img.loading = 'lazy';
      imgContainer.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'anime-img-placeholder';
      imgContainer.appendChild(placeholder);
    }

    if (isSafeHttpUrl(clickTargetUrl)) {
      imgContainer.classList.add('is-clickable');
      imgContainer.title = isFavoriteTab ? 'Abrir ficha del anime en JKAnime' : 'Abrir episodio en JKAnime';
      imgContainer.addEventListener('click', () => openExternalUrl(clickTargetUrl));
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'anime-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'anime-name';
    nameDiv.textContent = ep.name;
    nameDiv.title = ep.name;

    if (isSafeHttpUrl(clickTargetUrl)) {
      nameDiv.classList.add('is-clickable');
      nameDiv.addEventListener('click', () => openExternalUrl(clickTargetUrl));
    }
    infoDiv.appendChild(nameDiv);

    const metaRow = document.createElement('div');
    metaRow.className = 'anime-meta';

    const epDiv = document.createElement('span');
    if (isFavoriteTab) {
      if (ep.epNumber) {
        epDiv.className = 'anime-ep';
        epDiv.textContent = `Último: Ep. ${ep.epNumber}`;
      } else {
        epDiv.className = 'anime-ep muted';
        epDiv.textContent = isSafeHttpUrl(clickTargetUrl) ? 'Ver serie en JKAnime' : 'En seguimiento';
      }
    } else {
      epDiv.className = 'anime-ep';
      epDiv.textContent = ep.epNumber ? `Episodio ${ep.epNumber}` : 'Especial / Película';
    }
    metaRow.appendChild(epDiv);

    if (isUnseen) {
      metaRow.appendChild(createBadgePill('Nuevo', 'badge-new'));
    }
    if (isDownloaded) {
      metaRow.appendChild(createBadgePill('✓ Descargado', 'badge-downloaded'));
    }

    infoDiv.appendChild(metaRow);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'anime-actions';

    if (isSafeHttpUrl(ep.url)) {
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'download-btn';
      downloadBtn.type = 'button';
      downloadBtn.title = isFavoriteTab
        ? `Descargar último episodio (${ep.epNumber || 'reciente'})`
        : 'Descargar episodio';
      downloadBtn.appendChild(createSvgIcon('download'));

      downloadBtn.addEventListener('click', () => {
        downloadBtn.replaceChildren(createSvgIcon('spinner'));
        downloadBtn.disabled = true;

        chrome.runtime.sendMessage(
          {
            action: 'downloadEpisode',
            url: ep.url,
            name: ep.name,
            epNumber: ep.epNumber,
            fullTitle: ep.fullTitle
          },
          (response) => {
            const runtimeErr = chrome.runtime.lastError;
            if (!runtimeErr && response && response.status === 'success') {
              if (ep.url) downloadedSet.add(ep.url);
              if (ep.fullTitle) downloadedSet.add(ep.fullTitle);
              downloadBtn.replaceChildren(createSvgIcon('check'));
              downloadBtn.classList.add('success-state');
            } else {
              downloadBtn.replaceChildren(createSvgIcon('error'));
              downloadBtn.classList.add('error-state');
              downloadBtn.title = response?.message || 'Error al iniciar descarga';
              console.error('Error descargando:', runtimeErr || response?.message);
            }

            setTimeout(() => {
              downloadBtn.replaceChildren(createSvgIcon('download'));
              downloadBtn.disabled = false;
              downloadBtn.classList.remove('success-state', 'error-state');
              renderLists();
            }, 1500);
          }
        );
      });

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.type = 'button';
      copyBtn.title = 'Copiar enlace del episodio';
      copyBtn.appendChild(createSvgIcon('link'));

      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(ep.url);
          copyBtn.replaceChildren(createSvgIcon('check'));
          copyBtn.classList.add('success-state');
          setTimeout(() => {
            copyBtn.replaceChildren(createSvgIcon('link'));
            copyBtn.classList.remove('success-state');
          }, 1400);
        } catch (err) {
          console.error('Error al copiar:', err);
        }
      });

      actionsDiv.appendChild(downloadBtn);
      actionsDiv.appendChild(copyBtn);
    }

    const existingFavKey = findFavoriteKey(ep.name, ep.slug || extractAnimeSlug(ep.url));
    const isFav = Boolean(existingFavKey);
    const favBtn = document.createElement('button');
    favBtn.className = `fav-btn${isFav ? ' is-fav' : ''}`;
    favBtn.type = 'button';
    favBtn.title = isFav ? 'Quitar de Favoritos' : 'Agregar a Favoritos';
    favBtn.appendChild(createSvgIcon('star'));

    favBtn.addEventListener('click', async () => {
      const keyToDelete = findFavoriteKey(ep.name, ep.slug || extractAnimeSlug(ep.url));
      if (keyToDelete) {
        delete favorites[keyToDelete];
      } else {
        favorites[ep.name] = normalizeFavoriteEntry(null, ep);
      }

      await chrome.storage.local.set({ favorites });
      renderLists();
      await detectActiveJKAnimeTab();
    });

    actionsDiv.appendChild(favBtn);

    div.appendChild(imgContainer);
    div.appendChild(infoDiv);
    div.appendChild(actionsDiv);

    return div;
  }

  // Agregar anime de la pestaña activa de JKAnime a favoritos
  btnAddActiveFav.addEventListener('click', () => {
    if (!activeTabCandidate) return;
    const candidate = activeTabCandidate;
    btnAddActiveFav.disabled = true;
    btnAddActiveFav.textContent = 'Guardando...';

    chrome.runtime.sendMessage(
      { action: 'fetchAnimeMetadata', slug: candidate.slug },
      async (response) => {
        void chrome.runtime.lastError;
        const resolvedName =
          response && response.status === 'ok' && response.name ? response.name : candidate.name;
        const resolvedImage =
          response && response.status === 'ok' && isSafeHttpUrl(response.image)
            ? response.image
            : candidate.image;

        favorites[resolvedName] = {
          image: resolvedImage || null,
          slug: candidate.slug,
          seriesUrl: `${JKANIME_BASE}${candidate.slug}/`
        };

        await chrome.storage.local.set({ favorites });
        btnAddActiveFav.disabled = false;
        btnAddActiveFav.textContent = '+ Favorito';
        activeAnimeBar.hidden = true;
        renderLists();
        showStatusBanner(`"${resolvedName}" añadido a tus favoritos.`, 'info', 2800);
      }
    );
  });

  // Buscador en tiempo real
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    btnClearSearch.hidden = searchQuery.length === 0;
    renderLists();
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    btnClearSearch.hidden = true;
    searchInput.focus();
    renderLists();
  });

  // Cambio de tema
  btnThemeToggle.addEventListener('click', async () => {
    const nextTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(nextTheme);
    await chrome.storage.local.set({ theme: nextTheme });
  });

  // Panel de ajustes
  btnSettingsToggle.addEventListener('click', () => {
    const willOpen = settingsPanel.hidden;
    settingsPanel.hidden = !willOpen;
    btnSettingsToggle.classList.toggle('is-active', willOpen);
  });

  function pushSettingsUpdate() {
    const nextSettings = {
      checkIntervalMinutes: Number(selectInterval.value) || 60,
      preferredServer: selectServer.value === 'mp4upload' ? 'mp4upload' : 'mediafire',
      notificationsEnabled: Boolean(chkNotifications.checked)
    };
    chrome.runtime.sendMessage({ action: 'updateSettings', settings: nextSettings }, (res) => {
      if (!chrome.runtime.lastError && res && res.status === 'ok') {
        showStatusBanner('Ajustes guardados.', 'info', 1800);
      }
    });
  }

  selectInterval.addEventListener('change', pushSettingsUpdate);
  selectServer.addEventListener('change', pushSettingsUpdate);
  chkNotifications.addEventListener('change', pushSettingsUpdate);

  // Exportar favoritos a JSON
  btnExportFavs.addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: '2.1.0',
      favorites
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'jk-downloader-favoritos.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  });

  // Importar favoritos desde JSON
  btnImportFavs.addEventListener('click', () => {
    inputImportFavs.value = '';
    inputImportFavs.click();
  });

  inputImportFavs.addEventListener('change', async () => {
    const file = inputImportFavs.files && inputImportFavs.files[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const sourceObj =
        parsed && typeof parsed === 'object' && parsed.favorites && typeof parsed.favorites === 'object'
          ? parsed.favorites
          : parsed;

      let importedCount = 0;
      if (Array.isArray(sourceObj)) {
        for (const item of sourceObj) {
          if (typeof item === 'string' && item.trim()) {
            const name = item.trim();
            favorites[name] = normalizeFavoriteEntry(favorites[name] || true, findLatestEpisodeForFavorite(name, null));
            importedCount++;
          }
        }
      } else if (sourceObj && typeof sourceObj === 'object') {
        for (const [rawName, val] of Object.entries(sourceObj)) {
          const name = String(rawName || '').trim();
          if (!name) continue;
          favorites[name] = normalizeFavoriteEntry(val, findLatestEpisodeForFavorite(name, val));
          importedCount++;
        }
      } else {
        throw new Error('Formato no reconocido');
      }

      await chrome.storage.local.set({ favorites });
      renderLists();
      await detectActiveJKAnimeTab();
      showStatusBanner(`Se importaron ${importedCount} favoritos.`, 'info', 3000);
    } catch {
      showStatusBanner('El archivo JSON de favoritos no es válido.', 'error', 3500);
    }
  });

  // Manejo de pestañas
  tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');

      tabIndicator.style.transform = index === 0 ? 'translateX(0)' : 'translateX(100%)';
    });
  });

  // Forzar revisión manual
  btnForceCheck.addEventListener('click', () => {
    btnForceCheck.disabled = true;
    if (forceCheckIcon) forceCheckIcon.classList.add('spin-icon');
    if (forceCheckLabel) forceCheckLabel.textContent = 'Buscando...';
    showStatusBanner('');
    setListMessage(recentList, 'Buscando nuevos capítulos...', 'loading');

    chrome.runtime.sendMessage({ action: 'forceCheck' }, async (response) => {
      const runtimeErr = chrome.runtime.lastError;
      await loadData();

      if (runtimeErr || (response && response.status === 'error')) {
        showStatusBanner(
          (response && response.message) || 'No se pudo comprobar JKAnime en este momento.',
          'error'
        );
      }

      if (forceCheckIcon) forceCheckIcon.classList.remove('spin-icon');
      if (forceCheckLabel) forceCheckLabel.textContent = 'Revisar';
      btnForceCheck.disabled = false;
    });
  });

  await loadData();
  requestAnimationFrame(() => {
    document.body.classList.remove('preload');
  });
});
