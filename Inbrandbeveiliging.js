// ==UserScript==
// @name         MKS Inbrandbeveiliging
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Beschermt een OLED/LED-scherm tegen inbranden: na 5 minuten wordt de pagina gedimd, en bij 5 minuten geen activiteit verschijnt een zwarte schermbeveiliging. Instelbaar via het menu in de navigatiebalk.
// @author       TheLegacyDev
// @match        https://*.meldkamerspel.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=meldkamerspel.com
// @grant        none
// @run-at       document-end
// @downloadURL  https://github.com/TheDutchLegacy/mks-scripts/raw/refs/heads/main/Inbrandbeveiliging.js
// @updateURL    https://github.com/TheDutchLegacy/mks-scripts/raw/refs/heads/main/Inbrandbeveiliging.js
// ==/UserScript==

/* =====================================================================
 * MKS INBRANDBEVEILIGING
 * =====================================================================
 * Fase 1 - Dimmen: zodra de pagina langer dan 5 minuten open staat,
 *          legt het script een zwarte, doorklikbare laag over de pagina.
 *          Daardoor branden wit (tekst, iconen, randen, kaartlabels)
 *          niet meer op volle helderheid. Muis/toetsenbord blijven werken.
 * Fase 2 - Schermbeveiliging: geen muis/toets/scroll/touch gedurende
 *          5 minuten -> scherm (bijna) zwart, met een kleine tekst die
 *          elke 10 seconden verspringt (zodat ook die niet inbrandt).
 *          Eerste klik/toets/muisbeweging haalt het scherm terug.
 *
 * Draait alleen in het hoofdvenster; vensters in de lightbox (missies,
 * gebouwen) geven hun activiteit door, zodat de schermbeveiliging niet
 * aanslaat terwijl je in een missie bezig bent.
 * ===================================================================== */
(function () {
    'use strict';

    // Lightbox-iframes: alleen activiteit doorgeven aan het hoofdvenster
    if (window.top !== window.self) {
        let last = 0;
        const ping = () => {
            const now = Date.now();
            if (now - last < 1000) return;
            last = now;
            try { window.top.postMessage({ mkxBurnInActivity: true }, location.origin); } catch (e) {}
        };
        ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
            window.addEventListener(ev, ping, { passive: true, capture: true }));
        return;
    }

    const STORAGE_KEY = 'mkx_burnin_settings';
    const DEFAULTS = {
        enabled: true,
        dimAfterMin: 5,     // minuten na openen voordat er gedimd wordt
        dimLevel: 0.35,     // 0 = niet dimmen, 0.6 = flink donker
        saverAfterMin: 5,   // minuten zonder activiteit tot schermbeveiliging (0 = uit)
    };

    function loadSettings() {
        try {
            return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
        } catch (e) {
            return Object.assign({}, DEFAULTS);
        }
    }
    function saveSettings() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
    }
    let settings = loadSettings();

    const style = document.createElement('style');
    style.id = 'mkxBurnInStyle';
    style.textContent = `
#mkxBurnInDim {
    position: fixed; inset: 0; z-index: 2147483646;
    background: #000; opacity: 0; pointer-events: none;
    transition: opacity 3s ease;
}
#mkxBurnInSaver {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #000; display: none; cursor: none;
}
#mkxBurnInSaver span {
    position: absolute; color: #333; font-size: 14px;
    font-family: sans-serif; white-space: nowrap; user-select: none;
}`;
    document.head.appendChild(style);

    const dim = document.createElement('div');
    dim.id = 'mkxBurnInDim';
    const saver = document.createElement('div');
    saver.id = 'mkxBurnInSaver';
    const saverText = document.createElement('span');
    saverText.textContent = 'Meldkamerspel - beweeg de muis om verder te gaan';
    saver.appendChild(saverText);
    document.body.append(dim, saver);

    const openedAt = Date.now();
    let lastActivity = Date.now();
    let saverOn = false;
    let saverMoveTimer = null;
    let saverShownAt = 0;

    function moveSaverText() {
        const maxX = Math.max(0, window.innerWidth - saverText.offsetWidth - 20);
        const maxY = Math.max(0, window.innerHeight - saverText.offsetHeight - 20);
        saverText.style.left = (10 + Math.random() * maxX) + 'px';
        saverText.style.top = (10 + Math.random() * maxY) + 'px';
    }

    function showSaver() {
        if (saverOn) return;
        saverOn = true;
        saverShownAt = Date.now();
        saver.style.display = 'block';
        moveSaverText();
        saverMoveTimer = setInterval(moveSaverText, 10000);
    }
    function hideSaver() {
        if (!saverOn) return;
        saverOn = false;
        saver.style.display = 'none';
        clearInterval(saverMoveTimer);
    }

    function activity(e) {
        // kleine muisbewegingen vlak na het starten niet meetellen
        if (saverOn && e && e.type === 'mousemove' && Date.now() - saverShownAt < 1500) return;
        lastActivity = Date.now();
        hideSaver();
    }
    ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
        window.addEventListener(ev, activity, { passive: true, capture: true }));
    window.addEventListener('message', e => {
        if (e.origin === location.origin && e.data && e.data.mkxBurnInActivity) activity();
    });
    // Klik op de schermbeveiliging alleen gebruiken om wakker te maken,
    // niet doorgeven aan de kaart of knoppen eronder
    saver.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); activity(); });
    saver.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });

    function tick() {
        if (!settings.enabled) {
            dim.style.opacity = '0';
            hideSaver();
            return;
        }
        const now = Date.now();
        const dimActive = now - openedAt >= settings.dimAfterMin * 60000;
        dim.style.opacity = dimActive ? String(settings.dimLevel) : '0';
        if (settings.saverAfterMin > 0 && now - lastActivity >= settings.saverAfterMin * 60000) showSaver();
    }
    setInterval(tick, 5000);
    tick();

    /* ------------------ menu in de navigatiebalk ------------------ */
    const DIM_OPTIONS = [
        { value: 0.2, label: 'Licht' },
        { value: 0.35, label: 'Normaal' },
        { value: 0.5, label: 'Donker' },
        { value: 0.65, label: 'Zeer donker' },
    ];
    const SAVER_OPTIONS = [
        { value: 0, label: 'Uit' },
        { value: 2, label: '2 min' },
        { value: 5, label: '5 min' },
        { value: 10, label: '10 min' },
        { value: 15, label: '15 min' },
    ];

    function menuHtml() {
        const dimLabel = (DIM_OPTIONS.find(o => o.value === settings.dimLevel) || { label: settings.dimLevel }).label;
        const saverLabel = (SAVER_OPTIONS.find(o => o.value === settings.saverAfterMin) || { label: settings.saverAfterMin + ' min' }).label;
        return '<li><a href="#" id="mkxBurnInToggle">Inbrandbeveiliging: <strong>' + (settings.enabled ? 'Aan' : 'Uit') + '</strong></a></li>' +
            '<li><a href="#" id="mkxBurnInDimLevel">Dimmen na ' + settings.dimAfterMin + ' min: <strong>' + dimLabel + '</strong></a></li>' +
            '<li><a href="#" id="mkxBurnInSaverAfter">Schermbeveiliging na: <strong>' + saverLabel + '</strong></a></li>' +
            '<li><a href="#" id="mkxBurnInNow">Schermbeveiliging nu starten</a></li>';
    }

    const newsLi = document.querySelector('#main_navbar #navbar-main-collapse .navbar-right #news_li');
    if (newsLi) {
        const li = document.createElement('li');
        li.id = 'mkxBurnInMenu';
        li.className = 'dropdown';
        li.innerHTML = '<a class="dropdown-toggle" data-toggle="dropdown" href="#" title="Inbrandbeveiliging">' +
            '<span class="glyphicon glyphicon-adjust" aria-hidden="true"></span><span class="caret"></span></a>' +
            '<ul class="dropdown-menu" id="mkxBurnInMenuList">' + menuHtml() + '</ul>';
        newsLi.after(li);

        const next = (list, cur) => list[(list.findIndex(o => o.value === cur) + 1) % list.length].value;
        li.addEventListener('click', e => {
            const a = e.target.closest('a[id^="mkxBurnIn"]');
            if (!a) return;
            e.preventDefault();
            if (a.id === 'mkxBurnInToggle') settings.enabled = !settings.enabled;
            else if (a.id === 'mkxBurnInDimLevel') settings.dimLevel = next(DIM_OPTIONS, settings.dimLevel);
            else if (a.id === 'mkxBurnInSaverAfter') settings.saverAfterMin = next(SAVER_OPTIONS, settings.saverAfterMin);
            else if (a.id === 'mkxBurnInNow') {
                // even wachten zodat de klik zelf de schermbeveiliging niet meteen sluit
                setTimeout(showSaver, 300);
                return;
            }
            saveSettings();
            document.getElementById('mkxBurnInMenuList').innerHTML = menuHtml();
            tick();
            e.stopPropagation(); // menu open houden
        });
    }
})();
