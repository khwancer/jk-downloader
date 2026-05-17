// Este script se inyecta en mp4upload.com para iniciar la descarga directamente desde la página
// y así proveer el Referer correcto a gestores de descarga como Free Download Manager (FDM).

if (window.location.hash.includes('auto-download=1')) {
  const params = new URLSearchParams(window.location.hash.substring(1));
  const url = params.get('url');
  const name = params.get('name');
  
  if (url && name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    
    // Cerramos la pestaña después de un par de segundos para no dejar basura visual
    setTimeout(() => {
      window.close();
    }, 2000);
  }
}
