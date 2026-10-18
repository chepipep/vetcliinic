(() => {
  'use strict';

  const menu = document.getElementById('mobile-menu');
  const toggle = document.getElementById('menu-toggle');
  const icon = document.getElementById('menu-icon');
  const wideHeader = window.matchMedia('(min-width: 1280px)');
  const wideReader = window.matchMedia('(min-width: 1024px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Открыть меню');
    icon.className = 'ti ti-menu-2';
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', () => {
    if (!menu.hidden) {
      closeMenu();
      return;
    }
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Закрыть меню');
    icon.className = 'ti ti-x';
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) closeMenu(true);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !toggle.contains(event.target)) {
      closeMenu();
    }
  });
  wideHeader.addEventListener('change', (event) => {
    if (event.matches) closeMenu();
  });
  menu.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !document.querySelector('.site-header').contains(event.relatedTarget)) {
      closeMenu();
    }
  });

  const entries = Array.from(document.querySelectorAll('.article-entry[id]'));
  const articles = new Map(entries.map((entry) => [entry.id, entry]));
  const contents = document.getElementById('article-contents');
  const index = document.getElementById('article-index');
  const links = Array.from(index.querySelectorAll('a[href^="#article-"]'));
  const groupIds = new Set(['article-index', 'clinical-materials', 'owner-materials']);
  const defaultTitle = document.title;
  let activeId = 'article-1';
  let lastRenderedUrl = '';

  // Leave the full static document readable if its expected structure is missing.
  if (entries.length !== 11 || entries.some((entry) => !entry.querySelector('.article-title'))) return;

  function showArticle(id) {
    if (!articles.has(id)) return;
    activeId = id;
    entries.forEach((entry) => { entry.hidden = entry.id !== id; });
    links.forEach((link) => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    document.title = `${articles.get(id).querySelector('.article-title').textContent} — Ольга Курилова`;
  }

  function scrollToElement(element, smooth = false) {
    element.scrollIntoView({
      block: 'start',
      behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant',
    });
  }

  function updateUrl(hash) {
    if (window.location.hash !== hash) {
      window.history.pushState({ articleId: activeId }, '', hash);
    }
    lastRenderedUrl = window.location.href;
  }

  function openContents(id, focus = false) {
    contents.open = true;
    const target = document.getElementById(id) || index;
    if (focus) {
      const focusTarget = id === 'article-index'
        ? contents.querySelector('summary')
        : target.querySelector('h3');
      focusTarget?.focus({ preventScroll: true });
    }
    scrollToElement(target);
  }

  function renderLocation(initial = false) {
    if (!initial && lastRenderedUrl === window.location.href) return;
    lastRenderedUrl = window.location.href;
    const id = window.location.hash.slice(1);
    if (articles.has(id)) {
      showArticle(id);
      // A direct link should reach its text without jumping past a long mobile index.
      if (!wideReader.matches) contents.open = false;
      if (initial) requestAnimationFrame(() => scrollToElement(articles.get(id)));
    } else {
      const previousId = window.history.state?.articleId;
      showArticle(!id ? 'article-1' : articles.has(previousId) ? previousId : activeId);
      if (groupIds.has(id)) requestAnimationFrame(() => openContents(id));
      if (!id) {
        contents.open = true;
        document.title = defaultTitle;
      }
    }
    // No focus changes on load or browser Back/Forward. Native history restores scroll.
  }

  index.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const id = link.hash.slice(1);
    if (!articles.has(id)) return;
    event.preventDefault();
    showArticle(id);
    updateUrl(link.hash);
    if (!wideReader.matches) contents.open = false;
    const entry = articles.get(id);
    entry.querySelector('.article-title').focus({ preventScroll: true });
    scrollToElement(entry);
  });

  document.querySelectorAll('.article-return').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      updateUrl('#article-index');
      openContents('article-index', true);
      // Make the selected title easy to find within the separately scrolling desktop list.
      if (wideReader.matches) {
        const currentLink = index.querySelector('[aria-current]');
        if (currentLink) contents.querySelector('nav').scrollTop = currentLink.offsetTop - 100;
      }
    });
  });

  wideReader.addEventListener('change', (event) => {
    if (event.matches) contents.open = true;
  });
  window.addEventListener('popstate', () => renderLocation());
  window.addEventListener('hashchange', () => renderLocation());

  document.querySelector('.articles-page').classList.add('reader-enhanced');
  renderLocation(true);
})();
