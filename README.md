# JK Downloader v2

Extensión para navegadores basados en Chromium (Manifest V3) que revisa automáticamente los nuevos episodios publicados en JKAnime, envía notificaciones de tus animes favoritos y facilita la descarga directa desde MediaFire, Mp4Upload y servidores de respaldo.

## ✨ Características Principales (`v2.1.0`)

- **Tarjetas y Notificaciones Interactivas:** Haz clic en cualquier portada, título o notificación del sistema para abrir el episodio o la ficha del anime en JKAnime.
- **Descarga Directa Mejorada:**
  - Extrae enlaces tanto de `var servers` como de la tabla de descargas directas del episodio (`MediaFire`, `Mp4Upload`, `Mega`, `1Fichier`).
  - Incluye desempacador seguro (sin `eval`) para scripts ofuscados en `Mp4Upload` y validación mediante token efímero de un solo uso para compatibilidad segura con gestores como Free Download Manager (FDM).
- **Seguimiento Visual (`NUEVO` y `✓ Descargado`):** Resalta los capítulos nuevos de tus favoritos al abrir la extensión y marca automáticamente los episodios que ya descargaste.
- **Buscador Instantáneo y Detección de Pestaña Activa:**
  - Filtra en tiempo real tus favoritos o hasta los últimos 100 episodios en historial (ignorando tildes/mayúsculas).
  - Si estás visitando un anime en `jkanime.net`, aparece una barra rápida para agregarlo a *Mis Favoritos* con su portada oficial en un clic.
- **Panel de Ajustes y Respaldo JSON:**
  - Configura el intervalo de revisión (`15 min`, `30 min`, `1 hora`, `2 horas`), el servidor preferido (`MediaFire` o `Mp4Upload`) y las notificaciones.
  - Exporta e importa tu lista de favoritos en formato `.json`.
- **Seguridad y Rendimiento:** Construcción del DOM 100% libre de `innerHTML`, decodificación completa de entidades HTML, timeouts de red con `AbortController` y modo oscuro sin parpadeo blanco inicial.

## 🚀 Instalación (Modo Desarrollador)

1. Abre tu navegador (Chrome, Edge, Brave, etc.) y entra a `chrome://extensions/`.
2. Activa el **Modo Desarrollador** en la esquina superior derecha.
3. Haz clic en **Cargar descomprimida** (*Load unpacked*) y selecciona la carpeta `jk-downloader-v2`.
