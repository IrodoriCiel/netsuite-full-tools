(function () {
    'use strict';
    if (window.NSFT_LoginIdentity) return;

    const CARD_ID = 'nsft-login-id';

    function getCard() {
        let card = document.getElementById(CARD_ID);
        if (card) return card;

        const box = document.querySelector('.login-page-box');
        if (!box) return null;

        card = document.createElement('div');
        card.id = CARD_ID;
        card.className = 'nsft-login-id';
        card.hidden = true;

        const top = document.createElement('div');
        top.className = 'nsft-login-id-top';
        const foot = document.createElement('div');
        foot.className = 'nsft-login-id-foot';
        card.appendChild(top);
        card.appendChild(foot);

        const logos = box.querySelector('.login-page-box-logos');
        if (logos) logos.appendChild(card);
        else box.insertBefore(card, box.querySelector('.login-page-box-title') || box.firstChild);
        return card;
    }

    function sync() {
        const card = document.getElementById(CARD_ID);
        if (!card) return;
        const top = card.querySelector('.nsft-login-id-top');
        const foot = card.querySelector('.nsft-login-id-foot');
        top.hidden = !top.children.length;
        foot.hidden = !foot.children.length;
        card.hidden = top.hidden && foot.hidden;
        card.classList.toggle('is-foot-only', top.hidden && !foot.hidden);
    }

    function put(slot, el) {
        const card = getCard();
        if (!card || !el) return false;
        const top = card.querySelector('.nsft-login-id-top');
        const foot = card.querySelector('.nsft-login-id-foot');
        if (slot === 'logo') top.insertBefore(el, top.firstChild);
        else if (slot === 'name') top.appendChild(el);
        else if (slot === 'last') foot.insertBefore(el, foot.firstChild);
        else foot.appendChild(el);
        sync();
        return true;
    }

    function remove(el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
        sync();
    }

    window.NSFT_LoginIdentity = { put, remove };
})();
