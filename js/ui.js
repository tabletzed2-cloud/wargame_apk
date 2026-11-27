// ⚡ BUILD-МАРКЕР: v13.207
// js/ui.js — интерфейсные хелперы
(function () {
  'use strict';
  // Возвращает HTML-строку с иконкой из спрайта.
  // Использование: uiIcon('play')  → '<svg class="icon"...><use href="#icon-play"/></svg>'
  window.uiIcon = function (name, size) {
    if (!name) return '';
    var s = size ? ' style="width:' + size + 'px;height:' + size + 'px;"' : '';
    return '<svg class="icon" aria-hidden="true"' + s + '><use href="#icon-' + name + '"/></svg>';
  };
})();
