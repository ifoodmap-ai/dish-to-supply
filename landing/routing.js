(function (root, factory) {
  var routing = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = routing;
  }

  if (root) {
    root.IfmRouting = routing;
  }
})(typeof window !== 'undefined' ? window : null, function () {
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

  function shouldHandleClick(event) {
    if (!event) return true;
    if (event.defaultPrevented) return false;
    if (typeof event.button === 'number' && event.button !== 0) return false;
    return !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function createHistoryController(options) {
    var win = options.window;
    var onPage = options.onPage;
    var started = false;
    var onPopState = function () {
      onPage(pathToPage(win.location.pathname));
    };

    return {
      start: function () {
        if (started) return;
        win.addEventListener('popstate', onPopState);
        started = true;
      },
      navigate: function (page, event) {
        if (!shouldHandleClick(event)) return false;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();

        var path = pageToPath(page);
        if (win.location.pathname !== path) {
          win.history.pushState({}, '', path);
        }
        onPage(page);
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
    createDrawerFocusManager: createDrawerFocusManager,
    createHistoryController: createHistoryController,
    pathToPage: pathToPage,
    pageToPath: pageToPath,
  };
});
