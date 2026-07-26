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

  return {
    createHistoryController: createHistoryController,
    pathToPage: pathToPage,
    pageToPath: pageToPath,
  };
});
