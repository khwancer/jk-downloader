document.addEventListener('DOMContentLoaded', async () => {
  // Limpiar el badge al abrir el popup
  chrome.action.setBadgeText({ text: '' });
  chrome.storage.local.set({ badgeCount: 0 });
  
  // Elementos UI
  const btnForceCheck = document.getElementById('btn-force-check');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabIndicator = document.getElementById('tab-indicator');
  const recentList = document.getElementById('recent-list');
  const favoritesList = document.getElementById('favorites-list');

  // Estado
  let history = [];
  let favorites = {};

  // Cargar datos del storage
  async function loadData() {
    const storage = await chrome.storage.local.get(['episodeHistory', 'favorites', 'theme']);
    history = storage.episodeHistory || [];
    favorites = storage.favorites || {};
    
    // Aplicar tema
    if (storage.theme === 'dark') {
      document.body.classList.add('dark');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      document.body.classList.remove('dark');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }

    renderLists();
  }

  // Renderizar las listas (Recientes y Favoritos)
  function renderLists() {
    recentList.innerHTML = '';
    favoritesList.innerHTML = '';

    if (history.length === 0) {
      recentList.innerHTML = '<div class="empty-msg">No hay episodios recientes. Haz clic en "Revisar".</div>';
    } else {
      // Limitar a los primeros 32 episodios
      const fragment = document.createDocumentFragment();
      history.slice(0, 32).forEach(ep => {
        fragment.appendChild(createAnimeElement(ep, false));
      });
      recentList.appendChild(fragment);
    }

    // Pestaña de favoritos: listamos directamente los animes marcados
    const favNames = Object.keys(favorites);
    
    if (favNames.length === 0) {
      favoritesList.innerHTML = '<div class="empty-msg">No tienes animes favoritos guardados. Da clic a la ⭐ en la lista de recientes.</div>';
    } else {
      // Mostrar cada anime favorito sin número de episodio
      let needsSave = false;
      const fragment = document.createDocumentFragment();
      
      favNames.sort().forEach(favName => {
        let imageUrl = favorites[favName];
        if (imageUrl === true) {
          // Tratar de buscarla en el historial si solo tiene "true" (dato antiguo)
          const found = history.find(h => h.name === favName);
          imageUrl = found ? found.image : null;
          
          // Actualizar el dato antiguo para que no se pierda la imagen si sale del historial
          if (imageUrl) {
            favorites[favName] = imageUrl;
            needsSave = true;
          }
        }
        const el = createAnimeElement({ name: favName, epNumber: '', image: imageUrl }, true);
        fragment.appendChild(el);
      });
      
      favoritesList.appendChild(fragment);
      
      if (needsSave) {
        chrome.storage.local.set({ favorites: favorites });
      }
    }
  }

  // Crear elemento HTML para un anime
  function createAnimeElement(ep, isOnlyName = false) {
    const div = document.createElement('div');
    div.className = 'anime-item';
    
    const isFav = favorites[ep.name] !== undefined;

    const imgHtml = ep.image ? `<img class="anime-img" src="${ep.image}" alt="cover">` : `<div class="anime-img-placeholder"></div>`;
    
    const safeNameAttr = ep.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const safeNameText = ep.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    div.innerHTML = `
      <div class="anime-img-container">
        ${imgHtml}
      </div>
      <div class="anime-info">
        <div class="anime-name">${safeNameText}</div>
        ${isOnlyName ? '' : `<div class="anime-ep">Episodio ${ep.epNumber}</div>`}
      </div>
      <div class="anime-actions">
        ${(!isOnlyName && ep.url) ? `
          <button class="download-btn" data-url="${ep.url}" title="Descargar (Mediafire/Mp4upload)">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          </button>
          <button class="copy-btn" data-url="${ep.url}" title="Copiar enlace">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
        ` : ''}
        <button class="fav-btn ${isFav ? 'is-fav' : ''}" data-name="${safeNameAttr}" title="Agregar/Quitar de Favoritos">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="star-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      </div>
    `;

    // Event listeners para botones de URL (Copiar y Descargar)
    if (!isOnlyName && ep.url) {
      const copyBtn = div.querySelector('.copy-btn');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(ep.url);
          const originalContent = copyBtn.innerHTML;
          copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          copyBtn.classList.add('success-state');
          setTimeout(() => {
            copyBtn.innerHTML = originalContent;
            copyBtn.classList.remove('success-state');
          }, 1500);
        } catch (err) {
          console.error('Error al copiar: ', err);
        }
      });

      const downloadBtn = div.querySelector('.download-btn');
      downloadBtn.addEventListener('click', () => {
        const originalContent = downloadBtn.innerHTML;
        downloadBtn.innerHTML = '<svg class="spin-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
        downloadBtn.disabled = true;
        chrome.runtime.sendMessage({ action: 'downloadEpisode', url: ep.url, name: ep.name, epNumber: ep.epNumber }, (response) => {
          if (response && response.status === 'success') {
            downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            downloadBtn.classList.add('success-state');
          } else {
            downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            downloadBtn.classList.add('error-state');
            console.error('Error descargando:', response?.message);
          }
          setTimeout(() => {
            downloadBtn.innerHTML = originalContent;
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('success-state', 'error-state');
          }, 2000);
        });
      });
    }

    // Event listener para la estrella
    const btn = div.querySelector('.fav-btn');
    btn.addEventListener('click', async () => {
      const name = btn.getAttribute('data-name');
      if (favorites[name]) {
        delete favorites[name];
        btn.classList.remove('is-fav');
      } else {
        favorites[name] = ep.image || true;
        btn.classList.add('is-fav');
      }
      
      // Guardar en storage
      await chrome.storage.local.set({ favorites: favorites });
      
      // Re-renderizar listas para actualizar vista
      renderLists();
    });

    return div;
  }

  // Theme toggle
  btnThemeToggle.addEventListener('click', async () => {
    const isDark = document.body.classList.contains('dark');
    if (isDark) {
      document.body.classList.remove('dark');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
      await chrome.storage.local.set({ theme: 'light' });
    } else {
      document.body.classList.add('dark');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
      await chrome.storage.local.set({ theme: 'dark' });
    }
  });

  // Manejo de pestañas
  tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
      
      // Update indicator position
      if (index === 0) {
        tabIndicator.style.transform = 'translateX(0)';
      } else {
        tabIndicator.style.transform = 'translateX(100%)';
      }
    });
  });

  // Forzar revisión
  btnForceCheck.addEventListener('click', () => {
    btnForceCheck.disabled = true;
    btnForceCheck.textContent = 'Buscando...';
    recentList.innerHTML = '<div class="loading">Buscando nuevos capítulos...</div>';
    
    chrome.runtime.sendMessage({ action: 'forceCheck' }, () => {
      // Recargar datos tras la comprobación
      setTimeout(async () => {
        await loadData();
        btnForceCheck.disabled = false;
        btnForceCheck.textContent = '↻ Revisar';
      }, 1000); // Pequeño delay para asegurar que background termina
    });
  });

  // Iniciar
  loadData();
});
