(function (root, factory) {
  var routing = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = routing;
  }

  if (root) {
    root.IfmRouting = routing;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  var publicBaseUrl = 'https://ifoodmap-landing.vercel.app';

  // 語系走網址前綴:中文是 /xxx(不帶前綴,維持既有網址不變),英文是 /en/xxx。
  // 前綴是「哪個語系被渲染」的唯一真相 —— 連結才分享得出去、Google 才索引得到英文版。
  var DEFAULT_LANG = 'zh';
  var PREFIXED_LANGS = { en: '/en' };

  // 文章頁是動態路由 /news/<slug>,不在這張靜態表裡,由 pathToRoute 另外處理。
  var ARTICLE_RE = /^\/news\/([^/]+)$/;
  // 法律文件也是參數路由 /legal/<slug>,中英共用同一個 slug,hreflang 才指得對。
  var LEGAL_RE = /^\/legal\/([^/]+)$/;

  var pageByPath = {
    '/': 'home',
    '/news': 'news',
    '/legal': 'legal',
    '/qa': 'qa',
    '/restaurants': 'restaurants',
    '/suppliers': 'suppliers',
    '/cases': 'cases',
    '/about': 'about',
    '/contact': 'contact',
  };

  var pathByPage = {
    home: '/',
    news: '/news',
    legal: '/legal',
    qa: '/qa',
    restaurants: '/restaurants',
    suppliers: '/suppliers',
    cases: '/cases',
    about: '/about',
    contact: '/contact',
  };

  var htmlLangByLang = { zh: 'zh-Hant', en: 'en' };
  var ogLocaleByLang = { zh: 'zh_TW', en: 'en_US' };

  function normalizePath(pathname) {
    var path = typeof pathname === 'string' ? pathname : '/';
    path = path.split(/[?#]/, 1)[0].replace(/\/+$/, '');
    return path || '/';
  }

  // '/en/suppliers' → { lang:'en', path:'/suppliers' };'/suppliers' → { lang:'zh', path:'/suppliers' }
  function splitLang(pathname) {
    var path = normalizePath(pathname);
    for (var lang in PREFIXED_LANGS) {
      var prefix = PREFIXED_LANGS[lang];
      if (path === prefix) return { lang: lang, path: '/' };
      if (path.indexOf(prefix + '/') === 0) return { lang: lang, path: path.slice(prefix.length) };
    }
    return { lang: DEFAULT_LANG, path: path };
  }

  function pathToPage(pathname) {
    return pathToRoute(pathname).page;
  }

  function pathToLang(pathname) {
    return splitLang(pathname).lang;
  }

  // slug 可能被編碼過(雖然我們只產 a-z0-9- 的 slug,但使用者可能手打或貼到編碼過的網址)
  function decodeSlug(raw) {
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function pathToRoute(pathname) {
    var split = splitLang(pathname);
    var article = ARTICLE_RE.exec(split.path);
    if (article) {
      return { page: 'article', lang: split.lang, slug: decodeSlug(article[1]) };
    }
    var legal = LEGAL_RE.exec(split.path);
    if (legal) {
      return { page: 'legal', lang: split.lang, slug: decodeSlug(legal[1]) };
    }
    return { page: pageByPath[split.path] || 'home', lang: split.lang, slug: null };
  }

  function pageToPath(page, lang, slug) {
    var path;
    if (page === 'article') {
      // 沒有 slug 的文章頁沒有意義,退回列表頁 —— 免得產出 /news/undefined 這種連結
      path = slug ? '/news/' + encodeURIComponent(slug) : pathByPage.news;
    } else if (page === 'legal') {
      // 沒有 slug 的 /legal 是有意義的(文件索引),所以退回 /legal 而不是丟掉這一頁
      path = slug ? '/legal/' + encodeURIComponent(slug) : pathByPage.legal;
    } else {
      path = pathByPage[page] || '/';
    }
    var prefix = PREFIXED_LANGS[lang];
    if (!prefix) return path;
    return path === '/' ? prefix : prefix + path;
  }

  function canonicalUrlForPath(pathname) {
    var route = pathToRoute(pathname);
    return publicBaseUrl + pageToPath(route.page, route.lang, route.slug);
  }

  // hreflang:同一頁的各語系版本。x-default 指中文版(預設語系)。
  function alternateUrlsForPath(pathname) {
    var route = pathToRoute(pathname);
    return {
      zh: publicBaseUrl + pageToPath(route.page, 'zh', route.slug),
      en: publicBaseUrl + pageToPath(route.page, 'en', route.slug),
      xDefault: publicBaseUrl + pageToPath(route.page, DEFAULT_LANG, route.slug),
    };
  }

  function syncMetadata(win) {
    var doc = win && win.document;
    if (!doc || typeof doc.querySelector !== 'function') return;

    var route = pathToRoute(win.location.pathname);
    var url = canonicalUrlForPath(win.location.pathname);
    var alternates = alternateUrlsForPath(win.location.pathname);

    var canonical = doc.querySelector('link[rel="canonical"]');
    var openGraphUrl = doc.querySelector('meta[property="og:url"]');
    if (canonical) canonical.setAttribute('href', url);
    if (openGraphUrl) openGraphUrl.setAttribute('content', url);

    var openGraphLocale = doc.querySelector('meta[property="og:locale"]');
    if (openGraphLocale) openGraphLocale.setAttribute('content', ogLocaleByLang[route.lang] || ogLocaleByLang[DEFAULT_LANG]);

    if (doc.documentElement && typeof doc.documentElement.setAttribute === 'function') {
      doc.documentElement.setAttribute('lang', htmlLangByLang[route.lang] || htmlLangByLang[DEFAULT_LANG]);
    }

    var hreflangs = [['zh-Hant', alternates.zh], ['en', alternates.en], ['x-default', alternates.xDefault]];
    for (var i = 0; i < hreflangs.length; i++) {
      var link = doc.querySelector('link[rel="alternate"][hreflang="' + hreflangs[i][0] + '"]');
      if (link) link.setAttribute('href', hreflangs[i][1]);
    }
  }

  function shouldHandleClick(event) {
    if (!event) return true;
    if (event.defaultPrevented) return false;
    if (typeof event.button === 'number' && event.button !== 0) return false;
    return !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function createHistoryController(options) {
    var win = options.window;
    var onRoute = options.onRoute;
    var focusPage = options.focusPage;
    var started = false;
    var renderRoute = function (route, shouldFocus) {
      onRoute(route);
      if (shouldFocus && typeof focusPage === 'function') focusPage(route.page);
    };
    var onPopState = function () {
      syncMetadata(win);
      renderRoute(pathToRoute(win.location.pathname), true);
    };

    return {
      start: function () {
        if (started) return;
        win.addEventListener('popstate', onPopState);
        syncMetadata(win);
        started = true;
      },
      route: function () {
        return pathToRoute(win.location.pathname);
      },
      navigate: function (page, event, lang, slug) {
        if (!shouldHandleClick(event)) return false;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();

        var nextLang = lang || pathToLang(win.location.pathname);
        var path = pageToPath(page, nextLang, slug);
        if (normalizePath(win.location.pathname) === path) return false;
        win.history.pushState({}, '', path);
        syncMetadata(win);
        renderRoute({ page: page, lang: nextLang, slug: slug || null }, true);
        return true;
      },
      // 切語系:同一頁換到另一個語系的網址。用 pushState 讓「上一頁」能切回來。
      setLang: function (lang) {
        var current = pathToRoute(win.location.pathname);
        if (current.lang === lang) return false;
        win.history.pushState({}, '', pageToPath(current.page, lang, current.slug));
        syncMetadata(win);
        renderRoute({ page: current.page, lang: lang, slug: current.slug }, false);
        return true;
      },
      // 只在「裸網址 /」時依瀏覽器語系自動落地,而且不留歷史紀錄(replaceState)。
      // 深層網址一律照網址渲染 —— 否則 Googlebot 帶 Accept-Language: en 逛中文頁會被踢走,
      // 中文版就索引不到了。
      applyPreferredLang: function (lang) {
        var current = pathToRoute(win.location.pathname);
        if (current.page !== 'home' || current.lang === lang) return false;
        if (normalizePath(win.location.pathname) !== pageToPath('home', DEFAULT_LANG)) return false;
        win.history.replaceState({}, '', pageToPath('home', lang));
        syncMetadata(win);
        renderRoute({ page: 'home', lang: lang, slug: null }, false);
        return true;
      },
      stop: function () {
        if (!started) return;
        win.removeEventListener('popstate', onPopState);
        started = false;
      },
    };
  }

  function createDrawerFocusManager(options) {
    var doc = options.document;
    var background = options.background;
    var drawer = options.drawer;
    var toggle = options.toggle;
    var getFocusables = options.getFocusables;
    var isOpen = false;

    function setOpen(open) {
      isOpen = open;
      background.inert = open;
      drawer.inert = !open;
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function focusPageTarget(target) {
      if (!target) {
        toggle.focus();
        return;
      }
      target.setAttribute('tabindex', '-1');
      target.focus();
      if (typeof target.addEventListener === 'function') {
        target.addEventListener('blur', function () {
          target.removeAttribute('tabindex');
        }, { once: true });
      }
    }

    return {
      open: function () {
        setOpen(true);
        var focusables = getFocusables();
        if (focusables.length) focusables[0].focus();
      },
      close: function (closeOptions) {
        setOpen(false);
        if (closeOptions && closeOptions.restoreFocus === false) return;
        focusPageTarget(closeOptions && closeOptions.focusTarget);
      },
      handleKeyDown: function (event) {
        if (!isOpen) return false;
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
          return true;
        }
        if (event.key !== 'Tab') return false;

        var focusables = getFocusables();
        if (!focusables.length) {
          event.preventDefault();
          toggle.focus();
          return true;
        }
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        var current = doc.activeElement;
        if (event.shiftKey && (current === first || focusables.indexOf(current) === -1)) {
          event.preventDefault();
          last.focus();
          return true;
        }
        if (!event.shiftKey && (current === last || focusables.indexOf(current) === -1)) {
          event.preventDefault();
          first.focus();
          return true;
        }
        return false;
      },
      isOpen: function () {
        return isOpen;
      },
    };
  }

  return {
    DEFAULT_LANG: DEFAULT_LANG,
    alternateUrlsForPath: alternateUrlsForPath,
    canonicalUrlForPath: canonicalUrlForPath,
    createDrawerFocusManager: createDrawerFocusManager,
    createHistoryController: createHistoryController,
    pathToLang: pathToLang,
    pathToPage: pathToPage,
    pathToRoute: pathToRoute,
    pageToPath: pageToPath,
  };
});
