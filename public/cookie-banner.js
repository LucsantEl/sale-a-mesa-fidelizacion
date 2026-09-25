(function () {
  var KEY = 'sam_cookies_ack';
  var GA_ID = 'G-VNXYQJ18VT';

  // Páginas internas o personales: nunca se miden.
  var path = location.pathname;
  var internal = /^\/(staff|admin|qr)(\.html)?\/?$/.test(path);

  function loadGA() {
    if (internal || window.__samGA) return;
    window.__samGA = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('js', new Date());
    // /cliente/<id> es un enlace personal: se reporta sin el id.
    var cfg = {};
    if (/^\/cliente\//.test(path)) {
      cfg.page_location = location.origin + '/cliente';
      cfg.page_path = '/cliente';
    }
    gtag('config', GA_ID, cfg);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'granted') { loadGA(); return; }
  if (saved === 'denied') return;

  var el = document.createElement('div');
  el.id = 'cookie-banner';
  el.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#5b2d8e;color:#f7efd9;' +
    'padding:14px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;' +
    'gap:14px;font-family:"Segoe UI",Arial,sans-serif;font-size:0.85rem;line-height:1.4;' +
    'box-shadow:0 -2px 10px rgba(0,0,0,0.2);';

  var btn = 'flex-shrink:0;border-radius:6px;padding:8px 18px;font-weight:700;font-size:0.85rem;cursor:pointer;';
  el.innerHTML =
    '<p style="margin:0;max-width:520px;">' +
      'Usamos Google Analytics (cookies de medición) para entender cómo se usa el sitio, solo si aceptas. ' +
      'Más info en nuestra <a href="https://sale-a-mesa-catalogo.vercel.app/privacidad" style="color:#f7efd9;text-decoration:underline;">Política de Privacidad</a>.' +
    '</p>' +
    '<div style="display:flex;gap:8px;flex-shrink:0;">' +
      '<button id="cookie-banner-no" style="' + btn + 'background:transparent;color:#f7efd9;border:2px solid #f7efd9;">Rechazar</button>' +
      '<button id="cookie-banner-ok" style="' + btn + 'background:#f7efd9;color:#5b2d8e;border:2px solid #f7efd9;">Aceptar</button>' +
    '</div>';

  document.body.appendChild(el);
  function decide(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    el.remove();
    if (value === 'granted') loadGA();
  }
  document.getElementById('cookie-banner-ok').addEventListener('click', function () { decide('granted'); });
  document.getElementById('cookie-banner-no').addEventListener('click', function () { decide('denied'); });
})();
