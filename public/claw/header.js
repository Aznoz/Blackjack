// diagnostika: případná chyba v JavaScriptu se ukáže dole na stránce (stačí poslat screenshot)
window.addEventListener('error', function (e) { var b = document.getElementById('errbar'); if (b) { b.hidden = false; b.textContent += (e.message || 'chyba') + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')\n'; } });
// záložní ovládání horní lišty: funguje i kdyby se hlavní skript (claw.js) vůbec nenačetl
(function () {
  try {
    var $ = function (i) { return document.getElementById(i); };
    var snd = $('btn-snd'), on = true;
    try { on = localStorage.getItem('claw_sound') !== '0'; } catch (e) {}
    snd.textContent = on ? '🔊' : '🔇';
    snd.onclick = function () { on = !on; try { localStorage.setItem('claw_sound', on ? '1' : '0'); } catch (e) {} snd.textContent = on ? '🔊' : '🔇'; };
    $('btn-info').onclick = function () { $('modal').hidden = false; };
    $('modal-close').onclick = function () { $('modal').hidden = true; };
  } catch (e) {}
})();
