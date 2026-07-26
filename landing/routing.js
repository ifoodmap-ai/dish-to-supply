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

  return {
    pathToPage: pathToPage,
    pageToPath: pageToPath,
  };
});
