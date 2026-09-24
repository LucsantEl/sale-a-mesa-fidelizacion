(function () {
  var KEY = 'sam_cookies_ack';
  try {
    if (localStorage.getItem(KEY)) return;
  } catch (e) {}

  var el = document.createElement('div');
  el.id = 'cookie-banner';
  el.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#5b2d8e;color:#f7efd9;' +
    'padding:14px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;' +
    'gap:14px;font-family:"Segoe UI",Arial,sans-serif;font-size:0.85rem;line-height:1.4;' +
    'box-shadow:0 -2px 10px rgba(0,0,0,0.2);';

  el.innerHTML =
    '<p style="margin:0;max-width:520px;">' +
      'Este sitio no usa cookies de rastreo ni publicidad. Solo guardamos los datos que nos ' +
      'compartís al registrar tu tarjeta de fidelización.' +
    '</p>' +
    '<button id="cookie-banner-ok" style="flex-shrink:0;background:#f7efd9;color:#5b2d8e;border:none;' +
      'border-radius:6px;padding:8px 18px;font-weight:700;font-size:0.85rem;cursor:pointer;">Entendido</button>';

  document.body.appendChild(el);
  document.getElementById('cookie-banner-ok').addEventListener('click', function () {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    el.remove();
  });
})();
