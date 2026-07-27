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
  var pageByPath = {
    '/': 'home',
    '/restaurants': 'restaurants',
    '/suppliers': 'suppliers',
    '/cases': 'cases',
    '/about': 'about',
    '/contact': 'contact',
  };

  var pathByPage = {
    home: '/',
    restaurants: '/restaurants',
    suppliers: '/suppliers',
    cases: '/cases',
    about: '/about',
    contact: '/contact',
  };

  function normalizePath(pathname) {
    var path = typeof pathname === 'string' ? pathname : '/';
    path = path.split(/[?#]/, 1)[0].replace(/\/+$/, '');
    return path || '/';
  }

  function pathToPage(pathname) {
    return pageByPath[normalizePath(pathname)] || 'home';
  }

  function pageToPath(page) {
    return pathByPage[page] || '/';
  }

  function canonicalUrlForPath(pathname) {
    var normalized = normalizePath(pathname);
    var publicPath = pageByPath[normalized] ? normalized : '/';
    return publicBaseUrl + publicPath;
  }

  function syncMetadata(win) {
    if (!win.document || typeof win.document.querySelector !== 'function') return;
    var url = canonicalUrlForPath(win.location.pathname);
    var canonical = win.document.querySelector('link[rel="canonical"]');
    var openGraphUrl = win.document.querySelector('meta[property="og:url"]');
    if (canonical) canonical.setAttribute('href', url);
    if (openGraphUrl) openGraphUrl.setAttribute('content', url);
  }

  function shouldHandleClick(event) {
    if (!event) return true;
    if (event.defaultPrevented) return false;
    if (typeof event.button === 'number' && event.button !== 0) return false;
    return !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function createHistoryController(options) {
    var win = options.window;
    var onPage = options.onPage;
    var focusPage = options.focusPage;
    var started = false;
    var renderPage = function (page, shouldFocus) {
      onPage(page);
      if (shouldFocus && typeof focusPage === 'function') focusPage(page);
    };
    var onPopState = function () {
      syncMetadata(win);
      renderPage(pathToPage(win.location.pathname), true);
    };

    return {
      start: function () {
        if (started) return;
        win.addEventListener('popstate', onPopState);
        syncMetadata(win);
        started = true;
      },
      navigate: function (page, event) {
        if (!shouldHandleClick(event)) return false;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();

        var path = pageToPath(page);
        if (normalizePath(win.location.pathname) === path) return false;
        win.history.pushState({}, '', path);
        syncMetadata(win);
        renderPage(page, true);
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
    canonicalUrlForPath: canonicalUrlForPath,
    createDrawerFocusManager: createDrawerFocusManager,
    createHistoryController: createHistoryController,
    pathToPage: pathToPage,
    pageToPath: pageToPath,
  };
});
