# JKAnime Auto-Notifier

Una extensión para el navegador que revisa automáticamente los nuevos episodios en JKAnime y te notifica sobre tus series favoritas.

## ✨ Características

- **Notificaciones Automáticas:** Recibe alertas en el navegador cuando se publica un nuevo episodio de tus animes favoritos.
- **Listado de Últimos Episodios:** Accede rápidamente a los lanzamientos más recientes desde la interfaz de la extensión.
- **Gestión de Favoritos:** Guarda tus series preferidas para llevar un seguimiento personalizado.
- **Botón de Comprobación Manual:** Fuerza la búsqueda de nuevos capítulos en cualquier momento con un solo clic.
- **Integración con Reproductores:** Cuenta con scripts para interactuar con servidores de video (como mp4upload) y descargas (como MediaFire).

## 🚀 Instalación (Modo Desarrollador)

1. Clona o descarga este repositorio en tu computadora.
2. Abre tu navegador (Google Chrome, Edge, Brave, etc.) y ve a la página de extensiones (por ejemplo, `chrome://extensions/`).
3. Activa el **Modo Desarrollador** (Developer mode) en la esquina superior derecha.
4. Haz clic en **Cargar descomprimida** (Load unpacked) y selecciona la carpeta de este proyecto (`jkanime-notifier`).

## 🛠️ Permisos Utilizados

- **alarms**: Para revisar periódicamente en segundo plano si hay nuevos capítulos.
- **storage**: Para guardar tus configuraciones y tu lista de animes favoritos localmente.
- **notifications**: Para mostrarte avisos visuales cuando haya novedades.
- **host_permissions**: Permite el acceso a JKAnime, Mp4Upload y MediaFire para su correcto funcionamiento y extracción de enlaces.

## 📝 Uso

1. Haz clic en el ícono de la extensión.
2. En la pestaña **Últimos Episodios**, verás lo más nuevo. Puedes marcar un anime como favorito.
3. En la pestaña **Mis Favoritos**, estarán guardadas tus series.
4. La extensión revisará en segundo plano (cada cierto tiempo) y te notificará si alguno de tus favoritos saca capítulo nuevo.
