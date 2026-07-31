(function () {
    'use strict';

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGSAP = typeof window.gsap !== 'undefined';
    const hasScrollTrigger = typeof window.ScrollTrigger !== 'undefined';
    const LenisCtor = window.Lenis || (window.lenis && window.lenis.default) || null;
    let lenisInstance = null;

    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const msg = chrome.i18n.getMessage(key);
            if (msg) el.textContent = msg;
        });
        const titleEl = document.querySelector('title[data-i18n]');
        if (titleEl) {
            const msg = chrome.i18n.getMessage(titleEl.getAttribute('data-i18n'));
            if (msg) document.title = msg;
        }
    }

    function openPopupTab() {
        const url = chrome.runtime.getURL('popup/popup.html');
        chrome.tabs.create({ url });
    }

    function wireButtons() {
        const openSettingsBtn = document.getElementById('nsftWelcomeOpenSettings');
        if (openSettingsBtn) {
            openSettingsBtn.addEventListener('click', () => {
                if (chrome.action && chrome.action.openPopup) {
                    chrome.action.openPopup().catch(() => openPopupTab());
                } else {
                    openPopupTab();
                }
            });
        }

        const openChangelogBtn = document.getElementById('nsftWelcomeOpenChangelog');
        if (openChangelogBtn) {
            openChangelogBtn.addEventListener('click', () => {
                const url = chrome.runtime.getURL('popup/changelog.html');
                chrome.tabs.create({ url });
            });
        }

        const openExtensionsBtn = document.getElementById('nsftWelcomeOpenExtensions');
        if (openExtensionsBtn) {
            openExtensionsBtn.addEventListener('click', () => {
                if (chrome.tabs && chrome.tabs.create) {
                    chrome.tabs.create({ url: 'chrome://extensions' });
                }
            });
        }

        const jumpStepsBtn = document.getElementById('nsftNoticeJumpToSteps');
        if (jumpStepsBtn) {
            jumpStepsBtn.addEventListener('click', () => {
                const card = document.querySelector('.challenge-card');
                const section = document.getElementById('challenge');
                const target = card || section;
                if (!target) return;
                const vh = window.innerHeight;
                const h = target.getBoundingClientRect().height;
                const centerOffset = h < vh ? -((vh - h) / 2) : -40;
                if (lenisInstance && typeof lenisInstance.scrollTo === 'function') {
                    lenisInstance.scrollTo(target, { offset: centerOffset, duration: 1.4 });
                } else {
                    target.scrollIntoView({ behavior: 'smooth', block: h < vh ? 'center' : 'start' });
                }
            });
        }
    }

    function initLenis() {
        if (reduceMotion || !LenisCtor) return null;
        const lenis = new LenisCtor({
            duration: 1.1,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            smoothTouch: false
        });

        if (hasScrollTrigger && hasGSAP) {
            lenis.on('scroll', window.ScrollTrigger.update);
            window.gsap.ticker.add((time) => lenis.raf(time * 1000));
            window.gsap.ticker.lagSmoothing(0);
        } else {
            const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
            requestAnimationFrame(raf);
        }
        return lenis;
    }

    function buildHeroTimeline() {
        if (!hasGSAP) return;
        const gsap = window.gsap;

        gsap.set('.hero-logo-wrap', { autoAlpha: 0, scale: 0.35, rotation: -220 });
        gsap.set('.hero-logo-ring', { autoAlpha: 0, scale: 0.6 });
        gsap.set('.hero-tagline, .hero-notice, .hero-scroll-hint', { autoAlpha: 0, y: 24 });
        gsap.set('.hero-title-line', { yPercent: 110 });
        gsap.set('.hero-orb', { scale: 0.6, autoAlpha: 0 });

        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
        tl.to('.hero-orb', { scale: 1, autoAlpha: 1, duration: 1.6, stagger: 0.15 }, 0)
          .to('.hero-logo-wrap', { autoAlpha: 1, scale: 1, rotation: 0, duration: 1.3, ease: 'back.out(1.5)' }, 0.1)
          .to('.hero-logo-ring', { autoAlpha: 1, scale: 1, duration: 1.1, stagger: 0.12, ease: 'power3.out' }, 0.45)
          .to('.hero-title-line', { yPercent: 0, duration: 1.4, stagger: 0.12 }, 0.85)
          .to('.hero-tagline', { autoAlpha: 1, y: 0, duration: 0.9 }, 1.7)
          .to('.hero-notice', { autoAlpha: 1, y: 0, duration: 0.9 }, 1.9)
          .to('.hero-scroll-hint', { autoAlpha: 1, y: 0, duration: 0.6 }, 2.2)
          .add(startHeroLogoIdle, '>-0.2');
    }

    function startHeroLogoIdle() {
        if (reduceMotion || !hasGSAP) return;
        const gsap = window.gsap;
        gsap.to('.hero-logo-wrap', {
            y: -10,
            duration: 3.2,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true
        });
    }

    function wireHeroLogoInteraction() {
        if (!hasGSAP) return;
        const gsap = window.gsap;
        const wrap = document.querySelector('.hero-logo-wrap');
        const logo = document.querySelector('.hero-logo');
        if (!wrap || !logo) return;

        if (!reduceMotion) {
            wrap.addEventListener('mousemove', (e) => {
                const rect = wrap.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;
                gsap.to(logo, {
                    rotationY: x * 26,
                    rotationX: -y * 26,
                    scale: 1.06,
                    duration: 0.4,
                    ease: 'power2.out'
                });
            });
            wrap.addEventListener('mouseleave', () => {
                gsap.to(logo, {
                    rotationY: 0,
                    rotationX: 0,
                    scale: 1,
                    duration: 0.8,
                    ease: 'elastic.out(1, 0.5)'
                });
            });
        }

        wrap.addEventListener('click', () => {
            gsap.to(logo, {
                rotation: '+=360',
                duration: 1.1,
                ease: 'back.inOut(1.4)'
            });
        });
    }

    function buildPitchParallax() {
        if (!hasGSAP || !hasScrollTrigger) return;
        const gsap = window.gsap;
        const layers = document.querySelectorAll('.pitch .parallax-layer[data-speed]');
        layers.forEach((layer) => {
            const speed = parseFloat(layer.dataset.speed) || 0.3;
            gsap.to(layer, {
                yPercent: -30 * speed * 2,
                ease: 'none',
                scrollTrigger: {
                    trigger: '.pitch',
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: true
                }
            });
        });

        gsap.from('.parallax-fg > *', {
            y: 60,
            autoAlpha: 0,
            duration: 1,
            ease: 'power3.out',
            stagger: 0.18,
            scrollTrigger: {
                trigger: '.parallax-fg',
                start: 'top 75%'
            }
        });
    }

    function buildRevealAnimations() {
        if (!hasGSAP || !hasScrollTrigger) {
            return;
        }
        const gsap = window.gsap;

        gsap.from('.categories-header > *', {
            y: 40, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1,
            scrollTrigger: { trigger: '.categories-header', start: 'top 80%' }
        });

        gsap.from('.cat', {
            y: 50,
            autoAlpha: 0,
            duration: 0.7,
            ease: 'power3.out',
            stagger: { each: 0.08, from: 'start' },
            scrollTrigger: { trigger: '.cat-grid', start: 'top 80%' }
        });

        gsap.from('.challenge-card', {
            y: 60, autoAlpha: 0, scale: 0.97, duration: 1.1, ease: 'expo.out',
            scrollTrigger: { trigger: '.challenge-card', start: 'top 80%' }
        });

        gsap.from('.step', {
            y: 30, autoAlpha: 0, duration: 0.6, ease: 'power2.out', stagger: 0.12,
            scrollTrigger: { trigger: '.steps', start: 'top 85%' }
        });

        gsap.from('.cta-inner > *', {
            y: 40, autoAlpha: 0, duration: 0.8, ease: 'power3.out', stagger: 0.12,
            scrollTrigger: { trigger: '.cta-sec', start: 'top 85%' }
        });
    }

    function initProgressBar() {
        const bar = document.getElementById('progressBar');
        if (!bar) return;

        let ticking = false;
        const update = () => {
            const h = document.documentElement;
            const scrolled = h.scrollTop;
            const total = h.scrollHeight - h.clientHeight;
            const pct = total > 0 ? (scrolled / total) : 0;
            bar.style.transform = `scaleX(${pct})`;
            ticking = false;
        };
        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        update();
    }

    function init() {
        applyI18n();
        wireButtons();

        if (hasGSAP && hasScrollTrigger) {
            window.gsap.registerPlugin(window.ScrollTrigger);
        }

        lenisInstance = initLenis();
        buildHeroTimeline();
        wireHeroLogoInteraction();
        buildPitchParallax();
        buildRevealAnimations();
        initProgressBar();

        if (hasScrollTrigger) {
            window.addEventListener('load', () => window.ScrollTrigger.refresh());
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
