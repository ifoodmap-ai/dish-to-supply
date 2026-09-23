const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  DEFAULT_LANG,
  alternateUrlsForPath,
  canonicalUrlForPath,
  createDrawerFocusManager,
  createHistoryController,
  pageToPath,
  pathToLang,
  pathToPage,
  pathToRoute,
} = require('../routing.js');
const projectRoot = path.resolve(__dirname, '..');

const BASE = 'https://ifoodmap-landing.vercel.app';
const PAGES = ['home', 'restaurants', 'suppliers', 'cases', 'about', 'contact', 'news', 'qa', 'legal'];

function createFakeWindow(pathname = '/') {
  const listeners = new Map();
  const pushes = [];
  const replaces = [];
  const metadata = {
    canonical: createFakeMetadataElement(`${BASE}/`),
    openGraphUrl: createFakeMetadataElement(`${BASE}/`),
    openGraphLocale: createFakeMetadataElement('zh_TW'),
    hreflangZh: createFakeMetadataElement(`${BASE}/`),
    hreflangEn: createFakeMetadataElement(`${BASE}/en`),
    hreflangDefault: createFakeMetadataElement(`${BASE}/`),
  };
  const selectors = {
    'link[rel="canonical"]': metadata.canonical,
    'meta[property="og:url"]': metadata.openGraphUrl,
    'meta[property="og:locale"]': metadata.openGraphLocale,
    'link[rel="alternate"][hreflang="zh-Hant"]': metadata.hreflangZh,
    'link[rel="alternate"][hreflang="en"]': metadata.hreflangEn,
    'link[rel="alternate"][hreflang="x-default"]': metadata.hreflangDefault,
  };
  const documentElement = createFakeMetadataElement(null);
  const storage = new Map();

  const fakeWindow = {
    location: { pathname },
    document: {
      documentElement,
      querySelector(selector) {
        return selectors[selector] ?? null;
      },
    },
    history: {
      pushState(_state, _title, nextPath) {
        pushes.push(nextPath);
        fakeWindow.location.pathname = nextPath;
      },
      replaceState(_state, _title, nextPath) {
        replaces.push(nextPath);
        fakeWindow.location.pathname = nextPath;
      },
    },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
    navigator: { languages: ['zh-TW'], language: 'zh-TW' },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    listeners,
    metadata,
    pushes,
    replaces,
    storage,
  };
  return fakeWindow;
}

function createFakeMetadataElement(initialValue) {
  const attributes = new Map([['href', initialValue], ['content', initialValue]]);
  return {
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
  };
}

function createFakeElement(document, name) {
  const attributes = new Map();
  return {
    name,
    inert: false,
    setAttribute(key, value) {
      attributes.set(key, String(value));
    },
    getAttribute(key) {
      return attributes.get(key) ?? null;
    },
    removeAttribute(key) {
      attributes.delete(key);
    },
    focus() {
      document.activeElement = this;
    },
    addEventListener() {},
  };
}

test('pathToPage maps every public path to its page', () => {
  assert.deepEqual(
    ['/', '/restaurants', '/suppliers', '/cases', '/about', '/contact', '/news', '/qa', '/legal'].map(pathToPage),
    PAGES,
  );
  assert.deepEqual(
    ['/en', '/en/restaurants', '/en/suppliers', '/en/cases', '/en/about', '/en/contact', '/en/news', '/en/qa', '/en/legal'].map(pathToPage),
    PAGES,
  );
});

test('pathToPage normalizes trailing slashes', () => {
  assert.equal(pathToPage('/restaurants/'), 'restaurants');
  assert.equal(pathToPage('/suppliers////'), 'suppliers');
  assert.equal(pathToPage('/en/'), 'home');
  assert.equal(pathToPage('/en/suppliers/'), 'suppliers');
  assert.equal(pathToLang('/en/'), 'en');
  assert.equal(pathToLang('/en/suppliers//'), 'en');
});

test('pathToPage ignores query strings and hashes defensively', () => {
  assert.equal(pathToPage('/cases?source=nav'), 'cases');
  assert.equal(pathToPage('/about/#team'), 'about');
  assert.equal(pathToPage('/contact?source=nav#form'), 'contact');
  assert.deepEqual(pathToRoute('/en/cases?source=nav'), { page: 'cases', lang: 'en', slug: null });
  assert.deepEqual(pathToRoute('/en/about/#team'), { page: 'about', lang: 'en', slug: null });
  assert.deepEqual(pathToRoute('/en?source=nav#top'), { page: 'home', lang: 'en', slug: null });
});

test('pathToPage falls back to home for unknown paths', () => {
  assert.equal(pathToPage('/missing'), 'home');
  assert.equal(pathToPage(''), 'home');
  assert.equal(pathToPage('/en/missing'), 'home');
});

test('only a real /en segment counts as English', () => {
  // '/enterprise' 開頭剛好是 en,但它不是語系前綴 —— 誤判的話整頁會變英文
  for (const notEnglish of ['/enterprise', '/energy', '/end', '/english', '/en-us', '/venue']) {
    assert.equal(pathToLang(notEnglish), 'zh', notEnglish);
  }
  assert.equal(pathToRoute('/enterprise').lang, 'zh');
  assert.equal(pathToLang('/en'), 'en');
  assert.equal(pathToLang('/en/cases'), 'en');
  assert.equal(pathToLang('/'), DEFAULT_LANG);
  assert.equal(DEFAULT_LANG, 'zh');
});

test('pageToPath maps every page to its canonical public path', () => {
  assert.deepEqual(
    PAGES.map((page) => pageToPath(page)),
    ['/', '/restaurants', '/suppliers', '/cases', '/about', '/contact', '/news', '/qa', '/legal'],
  );
  assert.deepEqual(
    PAGES.map((page) => pageToPath(page, 'zh')),
    ['/', '/restaurants', '/suppliers', '/cases', '/about', '/contact', '/news', '/qa', '/legal'],
  );
  assert.deepEqual(
    PAGES.map((page) => pageToPath(page, 'en')),
    ['/en', '/en/restaurants', '/en/suppliers', '/en/cases', '/en/about', '/en/contact', '/en/news', '/en/qa', '/en/legal'],
  );
});

test('pathToRoute and pageToPath round-trip every page in every language', () => {
  const pages = ['home', 'restaurants', 'suppliers', 'cases', 'about', 'contact', 'news', 'qa', 'legal'];
  for (const lang of ['zh', 'en']) {
    for (const page of pages) {
      const path = pageToPath(page, lang);
      assert.deepEqual(pathToRoute(path), { page, lang, slug: null }, `${lang} ${page} -> ${path}`);
    }
  }

  // 文章頁多一層 slug,來回也要守得住
  for (const lang of ['zh', 'en']) {
    for (const slug of ['how-to-source-ingredients', 'a', 'a-b-c-1']) {
      const path = pageToPath('article', lang, slug);
      assert.deepEqual(pathToRoute(path), { page: 'article', lang, slug }, `${lang} article ${slug} -> ${path}`);
    }
  }

  // 沒有 slug 的文章頁沒有意義,要退回列表頁而不是產出 /news/undefined
  assert.equal(pageToPath('article', 'zh', null), '/news');
  assert.equal(pageToPath('article', 'en', undefined), '/en/news');
  // 多一層路徑不可以被當成文章
  assert.equal(pathToRoute('/news/a/b').page, 'home');

  // 條款頁的 slug 往返:/legal/terms 與 /en/legal/terms 是同一份文件
  for (const lang of ['zh', 'en']) {
    for (const slug of ['terms', 'privacy']) {
      const path = pageToPath('legal', lang, slug);
      assert.deepEqual(pathToRoute(path), { page: 'legal', lang, slug }, `${lang} legal ${slug} -> ${path}`);
    }
  }
  // 沒有 slug 的 /legal 是文件索引,不是 home(這一點跟文章頁刻意不同)
  assert.equal(pageToPath('legal', 'zh', null), '/legal');
  assert.equal(pageToPath('legal', 'en', undefined), '/en/legal');
  assert.equal(pathToRoute('/legal').page, 'legal');
  assert.equal(pathToRoute('/legal').slug, null);
  assert.equal(pathToRoute('/legal/a/b').page, 'home');
});


test('pageToPath falls back to the home path for unknown pages', () => {
  assert.equal(pageToPath('services'), '/');
  assert.equal(pageToPath(), '/');
  assert.equal(pageToPath('services', 'en'), '/en');
  // 認不得的語系當成沒有前綴,不能生出 /xx/about 這種 404 網址
  assert.equal(pageToPath('about', 'ja'), '/about');
});

test('canonicalUrlForPath creates self-referencing public URLs', () => {
  assert.deepEqual(
    ['/', '/restaurants', '/suppliers/', '/cases', '/about', '/contact'].map(canonicalUrlForPath),
    [
      `${BASE}/`,
      `${BASE}/restaurants`,
      `${BASE}/suppliers`,
      `${BASE}/cases`,
      `${BASE}/about`,
      `${BASE}/contact`,
    ],
  );
  // 英文頁的 canonical 要指向自己的英文網址,不能指回中文版
  assert.deepEqual(
    ['/en', '/en/restaurants', '/en/suppliers/', '/en/contact'].map(canonicalUrlForPath),
    [`${BASE}/en`, `${BASE}/en/restaurants`, `${BASE}/en/suppliers`, `${BASE}/en/contact`],
  );
});

test('alternateUrlsForPath pairs each page with its other language and a Chinese x-default', () => {
  assert.deepEqual(alternateUrlsForPath('/suppliers'), {
    zh: `${BASE}/suppliers`,
    en: `${BASE}/en/suppliers`,
    xDefault: `${BASE}/suppliers`,
  });
  // 同一頁的兩個語系版本互指同一組 alternates —— 不一致的話 Google 會忽略整組 hreflang
  assert.deepEqual(alternateUrlsForPath('/en/suppliers'), alternateUrlsForPath('/suppliers'));
  assert.deepEqual(alternateUrlsForPath('/en'), {
    zh: `${BASE}/`,
    en: `${BASE}/en`,
    xDefault: `${BASE}/`,
  });
});

test('history controller synchronizes canonical and Open Graph URLs on direct load, navigation, and popstate', () => {
  const fakeWindow = createFakeWindow('/about');
  const controller = createHistoryController({ window: fakeWindow, onRoute() {} });

  controller.start();
  assert.equal(fakeWindow.metadata.canonical.getAttribute('href'), `${BASE}/about`);
  assert.equal(fakeWindow.metadata.openGraphUrl.getAttribute('content'), `${BASE}/about`);

  controller.navigate('contact', { preventDefault() {} });
  assert.equal(fakeWindow.metadata.canonical.getAttribute('href'), `${BASE}/contact`);
  assert.equal(fakeWindow.metadata.openGraphUrl.getAttribute('content'), `${BASE}/contact`);

  fakeWindow.location.pathname = '/suppliers';
  fakeWindow.dispatch('popstate');
  assert.equal(fakeWindow.metadata.canonical.getAttribute('href'), `${BASE}/suppliers`);
  assert.equal(fakeWindow.metadata.openGraphUrl.getAttribute('content'), `${BASE}/suppliers`);
});

test('syncMetadata keeps html lang, og:locale and the three hreflang links in step', () => {
  const fakeWindow = createFakeWindow('/en/suppliers');
  const controller = createHistoryController({ window: fakeWindow, onRoute() {} });

  controller.start();
  assert.equal(fakeWindow.document.documentElement.getAttribute('lang'), 'en');
  assert.equal(fakeWindow.metadata.openGraphLocale.getAttribute('content'), 'en_US');
  assert.equal(fakeWindow.metadata.canonical.getAttribute('href'), `${BASE}/en/suppliers`);
  assert.equal(fakeWindow.metadata.hreflangZh.getAttribute('href'), `${BASE}/suppliers`);
  assert.equal(fakeWindow.metadata.hreflangEn.getAttribute('href'), `${BASE}/en/suppliers`);
  assert.equal(fakeWindow.metadata.hreflangDefault.getAttribute('href'), `${BASE}/suppliers`);

  controller.setLang('zh');
  assert.equal(fakeWindow.document.documentElement.getAttribute('lang'), 'zh-Hant');
  assert.equal(fakeWindow.metadata.openGraphLocale.getAttribute('content'), 'zh_TW');
  assert.equal(fakeWindow.metadata.canonical.getAttribute('href'), `${BASE}/suppliers`);

  controller.navigate('cases', { preventDefault() {} });
  assert.equal(fakeWindow.metadata.hreflangZh.getAttribute('href'), `${BASE}/cases`);
  assert.equal(fakeWindow.metadata.hreflangEn.getAttribute('href'), `${BASE}/en/cases`);
  assert.equal(fakeWindow.metadata.hreflangDefault.getAttribute('href'), `${BASE}/cases`);
});

test('history controller starts, navigates, reacts to popstate, and stops', () => {
  const fakeWindow = createFakeWindow('/');
  const routes = [];
  const controller = createHistoryController({
    window: fakeWindow,
    onRoute(route) {
      routes.push(route);
    },
  });

  controller.start();
  assert.equal(fakeWindow.listeners.has('popstate'), true);
  assert.deepEqual(controller.route(), { page: 'home', lang: 'zh', slug: null });

  const click = { preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
  controller.navigate('restaurants', click);
  assert.equal(click.preventDefaultCalled, true);
  assert.deepEqual(fakeWindow.pushes, ['/restaurants']);
  assert.deepEqual(routes, [{ page: 'restaurants', lang: 'zh', slug: null }]);

  controller.navigate('restaurants', { preventDefault() {} });
  assert.deepEqual(fakeWindow.pushes, ['/restaurants']);
  assert.deepEqual(routes, [{ page: 'restaurants', lang: 'zh', slug: null }]);

  fakeWindow.location.pathname = '/suppliers';
  fakeWindow.dispatch('popstate');
  assert.deepEqual(routes, [{ page: 'restaurants', lang: 'zh', slug: null }, { page: 'suppliers', lang: 'zh', slug: null }]);

  controller.stop();
  assert.equal(fakeWindow.listeners.has('popstate'), false);
});

test('navigate keeps the current language, or moves to the one it is handed', () => {
  const fakeWindow = createFakeWindow('/en/restaurants');
  const routes = [];
  const controller = createHistoryController({ window: fakeWindow, onRoute: (route) => routes.push(route) });

  controller.start();
  assert.deepEqual(controller.route(), { page: 'restaurants', lang: 'en', slug: null });

  // 省略第三個參數 → 沿用當前網址的語系,英文站內換頁不會掉回中文
  controller.navigate('cases', { preventDefault() {} });
  assert.deepEqual(fakeWindow.pushes, ['/en/cases']);
  assert.deepEqual(routes.at(-1), { page: 'cases', lang: 'en', slug: null });

  controller.navigate('about', { preventDefault() {} }, 'zh');
  assert.deepEqual(fakeWindow.pushes, ['/en/cases', '/about']);
  assert.deepEqual(routes.at(-1), { page: 'about', lang: 'zh', slug: null });
});

test('setLang swaps only the language of the current page', () => {
  const fakeWindow = createFakeWindow('/suppliers');
  const routes = [];
  const focusedPages = [];
  const controller = createHistoryController({
    window: fakeWindow,
    onRoute: (route) => routes.push(route),
    focusPage: (page) => focusedPages.push(page),
  });

  controller.start();
  assert.equal(controller.setLang('en'), true);
  assert.deepEqual(fakeWindow.pushes, ['/en/suppliers']);
  assert.deepEqual(routes, [{ page: 'suppliers', lang: 'en', slug: null }]);
  // 切語系是換字不是換頁,焦點留在原地
  assert.deepEqual(focusedPages, []);

  // pushState(不是 replaceState):上一頁要能切回來
  assert.deepEqual(fakeWindow.replaces, []);

  assert.equal(controller.setLang('en'), false);
  assert.deepEqual(fakeWindow.pushes, ['/en/suppliers']);

  assert.equal(controller.setLang('zh'), true);
  assert.deepEqual(fakeWindow.pushes, ['/en/suppliers', '/suppliers']);
  assert.deepEqual(routes.at(-1), { page: 'suppliers', lang: 'zh', slug: null });
});

test('applyPreferredLang only redirects the bare / URL', () => {
  const bare = createFakeWindow('/');
  const routes = [];
  const bareController = createHistoryController({ window: bare, onRoute: (route) => routes.push(route) });
  bareController.start();

  assert.equal(bareController.applyPreferredLang('en'), true);
  // replaceState,不留歷史 —— 按上一頁不該回到「剛剛那個會自動跳走的 /」
  assert.deepEqual(bare.replaces, ['/en']);
  assert.deepEqual(bare.pushes, []);
  assert.deepEqual(routes, [{ page: 'home', lang: 'en', slug: null }]);
  assert.equal(bareController.applyPreferredLang('en'), false);

  // 深層網址一律照網址渲染。否則 Googlebot 帶 Accept-Language: en 逛中文頁會被踢走,
  // 中文版就索引不到了。
  for (const deep of ['/restaurants', '/suppliers', '/cases', '/about', '/contact']) {
    const win = createFakeWindow(deep);
    const seen = [];
    const controller = createHistoryController({ window: win, onRoute: (route) => seen.push(route) });
    controller.start();
    assert.equal(controller.applyPreferredLang('en'), false, deep);
    assert.deepEqual(win.replaces, [], deep);
    assert.deepEqual(win.pushes, [], deep);
    assert.deepEqual(seen, [], deep);
    assert.equal(win.location.pathname, deep);
  }

  // 已經在 /en 了也不動(包含英文首頁本身與英文深層頁)
  for (const already of ['/en', '/en/about']) {
    const win = createFakeWindow(already);
    const controller = createHistoryController({ window: win, onRoute() {} });
    controller.start();
    assert.equal(controller.applyPreferredLang('zh'), false, already);
    assert.equal(win.location.pathname, already);
  }
});

test('history controller focuses once after real navigation and popstate but not same-route or modified clicks', () => {
  const fakeWindow = createFakeWindow('/');
  const routes = [];
  const focusedPages = [];
  const controller = createHistoryController({
    window: fakeWindow,
    onRoute: (route) => routes.push(route),
    focusPage: (page) => focusedPages.push(page),
  });

  controller.start();
  const didNavigate = controller.navigate('restaurants', { preventDefault() {} });
  assert.equal(didNavigate, true);
  assert.deepEqual(routes.map((route) => route.page), ['restaurants']);
  assert.deepEqual(focusedPages, ['restaurants']);

  const didNavigateSameRoute = controller.navigate('restaurants', { preventDefault() {} });
  const didNavigateModified = controller.navigate('cases', { ctrlKey: true, preventDefault() {} });
  assert.equal(didNavigateSameRoute, false);
  assert.equal(didNavigateModified, false);
  assert.deepEqual(routes.map((route) => route.page), ['restaurants']);
  assert.deepEqual(focusedPages, ['restaurants']);

  fakeWindow.location.pathname = '/suppliers';
  fakeWindow.dispatch('popstate');
  assert.deepEqual(routes.map((route) => route.page), ['restaurants', 'suppliers']);
  assert.deepEqual(focusedPages, ['restaurants', 'suppliers']);
});

test('history controller leaves modified clicks to the browser', () => {
  const fakeWindow = createFakeWindow('/');
  const routes = [];
  const controller = createHistoryController({ window: fakeWindow, onRoute: (route) => routes.push(route) });
  let prevented = false;

  controller.navigate('cases', { metaKey: true, preventDefault() { prevented = true; } });

  assert.equal(prevented, false);
  assert.deepEqual(fakeWindow.pushes, []);
  assert.deepEqual(routes, []);
});

test('drawer focus manager isolates background and traps Tab at both edges', () => {
  const document = { activeElement: null };
  const background = createFakeElement(document, 'background');
  const drawer = createFakeElement(document, 'drawer');
  const toggle = createFakeElement(document, 'toggle');
  const close = createFakeElement(document, 'close');
  const link = createFakeElement(document, 'link');
  const manager = createDrawerFocusManager({
    document,
    background,
    drawer,
    toggle,
    getFocusables: () => [close, link],
  });

  manager.open();
  assert.equal(background.inert, true);
  assert.equal(drawer.inert, false);
  assert.equal(drawer.getAttribute('aria-hidden'), 'false');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, close);

  document.activeElement = link;
  let prevented = false;
  manager.handleKeyDown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(document.activeElement, close);

  document.activeElement = close;
  prevented = false;
  manager.handleKeyDown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(document.activeElement, link);
});

test('drawer focus manager restores the toggle on Escape', () => {
  const document = { activeElement: null };
  const background = createFakeElement(document, 'background');
  const drawer = createFakeElement(document, 'drawer');
  const toggle = createFakeElement(document, 'toggle');
  const close = createFakeElement(document, 'close');
  const manager = createDrawerFocusManager({
    document,
    background,
    drawer,
    toggle,
    getFocusables: () => [close],
  });
  let prevented = false;

  manager.open();
  manager.handleKeyDown({ key: 'Escape', preventDefault() { prevented = true; } });

  assert.equal(prevented, true);
  assert.equal(background.inert, false);
  assert.equal(drawer.inert, true);
  assert.equal(drawer.getAttribute('aria-hidden'), 'true');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, toggle);
});

test('drawer focus manager moves route focus to the new page heading', () => {
  const document = { activeElement: null };
  const background = createFakeElement(document, 'background');
  const drawer = createFakeElement(document, 'drawer');
  const toggle = createFakeElement(document, 'toggle');
  const heading = createFakeElement(document, 'heading');
  const manager = createDrawerFocusManager({
    document,
    background,
    drawer,
    toggle,
    getFocusables: () => [],
  });

  manager.open();
  manager.close({ focusTarget: heading });

  assert.equal(background.inert, false);
  assert.equal(drawer.inert, true);
  assert.equal(heading.getAttribute('tabindex'), '-1');
  assert.equal(document.activeElement, heading);
});

test('index loads i18n and routing before support and wires History API navigation', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const i18nScriptIndex = source.indexOf('src="/i18n.js"');
  const routingScriptIndex = source.indexOf('src="/routing.js"');
  const supportScriptIndex = source.indexOf('src="/support.js"');

  assert.notEqual(i18nScriptIndex, -1);
  assert.notEqual(routingScriptIndex, -1);
  assert.notEqual(supportScriptIndex, -1);
  assert.ok(i18nScriptIndex < routingScriptIndex);
  assert.ok(routingScriptIndex < supportScriptIndex);
  assert.match(source, /window\.IfmRouting\.pathToPage\(window\.location\.pathname\)/);
  assert.match(source, /window\.IfmRouting\.pathToLang\(window\.location\.pathname\)/);
  assert.match(source, /window\.IfmRouting\.createHistoryController/);
  assert.match(source, /onRoute:\s*\(route\)\s*=>\s*\{/);
  assert.match(source, /this\.setState\(\{ page: route\.page, lang: route\.lang/);
  assert.match(source, /focusPage:\s*\(page\)\s*=>\s*this\.focusActivePage\(page\)/);
  assert.match(source, /focusActivePage\(page\)/);
  assert.match(source, /querySelectorAll\('h1'\)/);
  assert.match(source, /target\.setAttribute\('tabindex', '-1'\)/);
  assert.match(source, /target\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  assert.match(source, /this\._routingController\.start\(\)/);
  assert.match(source, /this\._routingController\.stop\(\)/);
  assert.match(source, /this\._routingController\.navigate\(p, event, null, slug\)/);
  assert.match(source, /this\._routingController\.setLang\(lang\)/);
  // 自動落地只在裸網址 /,由 applyPreferredLang 自己把關(見 routing.js);
  // 送進去的語系必須是 IfmI18n.detect() 的結果,而且要在 controller.start() 之後才跑。
  const mountStart = source.indexOf('componentDidMount() {');
  const mount = source.slice(mountStart, source.indexOf('\n  }', mountStart));
  assert.ok(mountStart > 0, 'component must define componentDidMount()');
  assert.match(mount, /window\.IfmI18n\.detect\(window\)/);
  assert.match(mount, /this\._routingController\.applyPreferredLang\(/);
  assert.ok(mount.indexOf('this._routingController.start()') < mount.indexOf('window.IfmI18n.detect(window)'));
  assert.ok(mount.indexOf('window.IfmI18n.detect(window)') < mount.indexOf('applyPreferredLang('));
  assert.match(source, /isRestaurants:\s*page === 'restaurants'/);
  assert.match(source, /isSuppliers:\s*page === 'suppliers'/);
});

test('package scripts run tests and serve with SPA fallback', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.cjs');
  assert.equal(pkg.scripts.dev, 'npx serve -s .');
  assert.equal(pkg.scripts.start, 'npx serve -s .');
});

test('public route controls use anchors and navigation exposes accessibility hooks', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.doesNotMatch(source, /<(?:span|div)\s+onClick="\{\{\s*go/);
  // 內部連結是 {{ href* }} 綁定(才會帶語系前綴),對應的路徑由 pageToPath 產生
  for (const binding of ['hrefHome', 'hrefRestaurants', 'hrefSuppliers', 'hrefCases', 'hrefAbout', 'hrefContact']) {
    assert.match(source, new RegExp(`<a href="\\{\\{ ${binding} \\}\\}"`));
    assert.match(source, new RegExp(`${binding}: href\\('[a-z]+'\\)`));
  }
  assert.match(source, /const href = \(target, targetLang\) =>/);
  assert.match(source, /window\.IfmRouting\.pageToPath\(target, targetLang \|\| lang\)/);
  // 語言切換是真的 <a href>,右鍵複製連結、新分頁開啟、爬蟲都正常
  assert.match(source, /<a href="\{\{ langHref \}\}"[^>]*onClick="\{\{ switchLang \}\}"/);
  // 🔴 語言切換的 href 必須帶 slug,否則 /legal/terms 與 /news/<slug> 上右鍵開新分頁
  // 會掉到 /en/legal、/en/news 這種列表頁(onClick 走 setLang 是對的,所以點起來正常)
  assert.match(source, /langHref: href2\(page, this\.state\.slug, otherLang\)/);
  assert.match(source, /aria-current="\{\{\s*ariaCurrentHome\s*\}\}"/);
  assert.match(source, /document\.createElement\('button'\)/);
  assert.match(source, /btn\.type = 'button'/);
  assert.match(source, /document\.createElement\('a'\)/);
  assert.match(source, /window\.IfmRouting\.createDrawerFocusManager/);
  assert.match(source, /focusManager\.handleKeyDown\(e\)/);
  const mobileNavStart = source.indexOf('function navTo(page, event)');
  const mobileNavSource = source.slice(mobileNavStart, source.indexOf('MOBILE_LINKS.forEach', mobileNavStart));
  assert.match(mobileNavSource, /var isSameRoute = window\.IfmRouting\.pathToPage\(window\.location\.pathname\) === page/);
  assert.match(mobileNavSource, /focusManager\.close\(\{ restoreFocus: isSameRoute \}\)/);
  assert.doesNotMatch(mobileNavSource, /focusManager\.close\(\{ restoreFocus: false \}\)/);
  assert.doesNotMatch(mobileNavSource, /focusManager\.close\(\{ focusTarget:/);
  assert.ok(mobileNavSource.indexOf('if (isModifiedClick(event)) return;') < mobileNavSource.indexOf('event.preventDefault();'));
  assert.ok(mobileNavSource.indexOf('var isSameRoute =') < mobileNavSource.indexOf('if (target) target.click();'));
  assert.ok(mobileNavSource.indexOf('event.preventDefault();') < mobileNavSource.indexOf('hideMenu();'));
});

test('Vercel rewrites each public route to index without catching API paths', () => {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'));
  // 中文 6 條 + 文章參數路由 + /qa + /legal 兩條 + /en
  //   + 英文 6 條 + 英文文章參數路由 + /en/qa + /en/legal 兩條 = 21。
  // 中文首頁 / 就是 index 本身,不需要 rewrite。
  const expectedSources = [
    '/restaurants', '/suppliers', '/cases', '/about', '/contact', '/news',
    '/news/:slug',
    '/qa',
    '/legal', '/legal/:slug',
    '/en',
    '/en/restaurants', '/en/suppliers', '/en/cases', '/en/about', '/en/contact', '/en/news',
    '/en/news/:slug',
    '/en/qa',
    '/en/legal', '/en/legal/:slug',
  ];
  assert.deepEqual(config.rewrites.map(({ source }) => source), expectedSources);

  // 每個可分享的網址都要有 rewrite,否則直接開那個網址會 404
  const shareable = ['zh', 'en'].flatMap((lang) => PAGES.map((page) => pageToPath(page, lang)));
  for (const url of shareable) {
    assert.ok(url === '/' || expectedSources.includes(url), `missing rewrite for ${url}`);
  }
  // 文章與法律文件的網址要被參數路由接到
  // (文章是 18 篇唯一的進入點,法律文件是頁尾兩條連結的目的地 —— 漏了就整批 404)
  const matchesParamRoute = (url) => expectedSources.find((src) => {
    if (!src.includes(':')) return false;
    const a = src.split('/'); const b = url.split('/');
    return a.length === b.length && a.every((seg, i) => seg.startsWith(':') || seg === b[i]);
  });
  for (const lang of ['zh', 'en']) {
    for (const [page, slug] of [['article', 'some-slug'], ['legal', 'terms'], ['legal', 'privacy']]) {
      const url = pageToPath(page, lang, slug);
      assert.ok(matchesParamRoute(url), `missing rewrite for ${url}`);
    }
  }

  // destination 要是 '/',不能是 '/index.html':cleanUrls 會把 index.html 改成 index 提供,
  // 寫 /index.html 的話 Vercel 檔案系統檢查找不到,深層網址直接 404(2026-09-21 線上實測)
  assert.deepEqual(config.rewrites.map(({ destination }) => destination), Array(expectedSources.length).fill('/'));
  // 萬用字元與括號仍然不准(會誤吃到別的路徑);: 參數路由是允許的,但只准出現在最後一段
  assert.equal(config.rewrites.some(({ source }) => /[*()]/.test(source)), false);
  for (const { source } of config.rewrites) {
    if (!source.includes(':')) continue;
    const segs = source.split('/');
    assert.ok(segs.slice(0, -1).every((seg) => !seg.includes(':')), `參數只能在最後一段:${source}`);
  }
  assert.equal(config.rewrites.some(({ source }) => source.includes('api')), false);
  assert.equal(config.cleanUrls, true);
});
