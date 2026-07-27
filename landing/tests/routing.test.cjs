const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  canonicalUrlForPath,
  createDrawerFocusManager,
  createHistoryController,
  pageToPath,
  pathToPage,
} = require('../routing.js');
const projectRoot = path.resolve(__dirname, '..');

function createFakeWindow(pathname = '/') {
  const listeners = new Map();
  const pushes = [];
  const metadata = {
    canonical: createFakeMetadataElement('https://ifoodmap-landing.vercel.app/'),
    openGraphUrl: createFakeMetadataElement('https://ifoodmap-landing.vercel.app/'),
  };

  return {
    location: { pathname },
    document: {
      querySelector(selector) {
        if (selector === 'link[rel="canonical"]') return metadata.canonical;
        if (selector === 'meta[property="og:url"]') return metadata.openGraphUrl;
        return null;
      },
    },
    history: {
      pushState(_state, _title, nextPath) {
        pushes.push(nextPath);
        this.window.location.pathname = nextPath;
      },
      window: null,
    },
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
  };
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
    ['/', '/restaurants', '/suppliers', '/cases', '/about', '/contact'].map(pathToPage),
    ['home', 'restaurants', 'suppliers', 'cases', 'about', 'contact'],
  );
});

test('pathToPage normalizes trailing slashes', () => {
  assert.equal(pathToPage('/restaurants/'), 'restaurants');
  assert.equal(pathToPage('/suppliers////'), 'suppliers');
});

test('pathToPage ignores query strings and hashes defensively', () => {
  assert.equal(pathToPage('/cases?source=nav'), 'cases');
  assert.equal(pathToPage('/about/#team'), 'about');
  assert.equal(pathToPage('/contact?source=nav#form'), 'contact');
});

test('pathToPage falls back to home for unknown paths', () => {
  assert.equal(pathToPage('/missing'), 'home');
  assert.equal(pathToPage(''), 'home');
});

test('pageToPath maps every page to its canonical public path', () => {
  assert.deepEqual(
    ['home', 'restaurants', 'suppliers', 'cases', 'about', 'contact'].map(pageToPath),
    ['/', '/restaurants', '/suppliers', '/cases', '/about', '/contact'],
  );
});

test('pageToPath falls back to the home path for unknown pages', () => {
  assert.equal(pageToPath('services'), '/');
  assert.equal(pageToPath(), '/');
});

test('canonicalUrlForPath creates self-referencing public URLs', () => {
  assert.deepEqual(
    ['/', '/restaurants', '/suppliers/', '/cases', '/about', '/contact'].map(canonicalUrlForPath),
    [
      'https://ifoodmap-landing.vercel.app/',
      'https://ifoodmap-landing.vercel.app/restaurants',
      'https://ifoodmap-landing.vercel.app/suppliers',
      'https://ifoodmap-landing.vercel.app/cases',
      'https://ifoodmap-landing.vercel.app/about',
      'https://ifoodmap-landing.vercel.app/contact',
    ],
  );
});

test('history controller synchronizes canonical and Open Graph URLs on direct load, navigation, and popstate', () => {
  const fakeWindow = createFakeWindow('/about');
  fakeWindow.history.window = fakeWindow;
  const controller = createHistoryController({ window: fakeWindow, onPage() {} });

  controller.start();
  assert.equal(fakeWindow.metadata.canonical.getAttribute('href'), 'https://ifoodmap-landing.vercel.app/about');
  assert.equal(fakeWindow.metadata.openGraphUrl.getAttribute('content'), 'https://ifoodmap-landing.vercel.app/about');

  controller.navigate('contact', { preventDefault() {} });
  assert.equal(fakeWindow.metadata.canonical.getAttribute('href'), 'https://ifoodmap-landing.vercel.app/contact');
  assert.equal(fakeWindow.metadata.openGraphUrl.getAttribute('content'), 'https://ifoodmap-landing.vercel.app/contact');

  fakeWindow.location.pathname = '/suppliers';
  fakeWindow.dispatch('popstate');
  assert.equal(fakeWindow.metadata.canonical.getAttribute('href'), 'https://ifoodmap-landing.vercel.app/suppliers');
  assert.equal(fakeWindow.metadata.openGraphUrl.getAttribute('content'), 'https://ifoodmap-landing.vercel.app/suppliers');
});

test('history controller starts, navigates, reacts to popstate, and stops', () => {
  const fakeWindow = createFakeWindow('/');
  fakeWindow.history.window = fakeWindow;
  const pages = [];
  const controller = createHistoryController({
    window: fakeWindow,
    onPage(page) {
      pages.push(page);
    },
  });

  controller.start();
  assert.equal(fakeWindow.listeners.has('popstate'), true);

  const click = { preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
  controller.navigate('restaurants', click);
  assert.equal(click.preventDefaultCalled, true);
  assert.deepEqual(fakeWindow.pushes, ['/restaurants']);
  assert.deepEqual(pages, ['restaurants']);

  controller.navigate('restaurants', { preventDefault() {} });
  assert.deepEqual(fakeWindow.pushes, ['/restaurants']);
  assert.deepEqual(pages, ['restaurants']);

  fakeWindow.location.pathname = '/suppliers';
  fakeWindow.dispatch('popstate');
  assert.deepEqual(pages, ['restaurants', 'suppliers']);

  controller.stop();
  assert.equal(fakeWindow.listeners.has('popstate'), false);
});

test('history controller focuses once after real navigation and popstate but not same-route or modified clicks', () => {
  const fakeWindow = createFakeWindow('/');
  fakeWindow.history.window = fakeWindow;
  const pages = [];
  const focusedPages = [];
  const controller = createHistoryController({
    window: fakeWindow,
    onPage: (page) => pages.push(page),
    focusPage: (page) => focusedPages.push(page),
  });

  controller.start();
  controller.navigate('restaurants', { preventDefault() {} });
  assert.deepEqual(pages, ['restaurants']);
  assert.deepEqual(focusedPages, ['restaurants']);

  controller.navigate('restaurants', { preventDefault() {} });
  controller.navigate('cases', { ctrlKey: true, preventDefault() {} });
  assert.deepEqual(pages, ['restaurants']);
  assert.deepEqual(focusedPages, ['restaurants']);

  fakeWindow.location.pathname = '/suppliers';
  fakeWindow.dispatch('popstate');
  assert.deepEqual(pages, ['restaurants', 'suppliers']);
  assert.deepEqual(focusedPages, ['restaurants', 'suppliers']);
});

test('history controller leaves modified clicks to the browser', () => {
  const fakeWindow = createFakeWindow('/');
  fakeWindow.history.window = fakeWindow;
  const pages = [];
  const controller = createHistoryController({ window: fakeWindow, onPage: (page) => pages.push(page) });
  let prevented = false;

  controller.navigate('cases', { metaKey: true, preventDefault() { prevented = true; } });

  assert.equal(prevented, false);
  assert.deepEqual(fakeWindow.pushes, []);
  assert.deepEqual(pages, []);
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

test('index loads routing before support and wires History API navigation', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const routingScriptIndex = source.indexOf('src="/routing.js"');
  const supportScriptIndex = source.indexOf('src="./support.js"');

  assert.notEqual(routingScriptIndex, -1);
  assert.notEqual(supportScriptIndex, -1);
  assert.ok(routingScriptIndex < supportScriptIndex);
  assert.match(source, /window\.IfmRouting\.pathToPage\(window\.location\.pathname\)/);
  assert.match(source, /window\.IfmRouting\.createHistoryController/);
  assert.match(source, /focusPage:\s*\(page\)\s*=>\s*this\.focusActivePage\(page\)/);
  assert.match(source, /focusActivePage\(page\)/);
  assert.match(source, /querySelectorAll\('h1'\)/);
  assert.match(source, /target\.setAttribute\('tabindex', '-1'\)/);
  assert.match(source, /target\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  assert.match(source, /this\._routingController\.start\(\)/);
  assert.match(source, /this\._routingController\.stop\(\)/);
  assert.match(source, /this\._routingController\.navigate\(p, event\)/);
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
  for (const publicPath of ['/', '/restaurants', '/suppliers', '/cases', '/about', '/contact']) {
    assert.match(source, new RegExp(`<a[^>]+href="${publicPath.replace('/', '\\/')}"`));
  }
  assert.match(source, /aria-current="\{\{\s*ariaCurrentHome\s*\}\}"/);
  assert.match(source, /document\.createElement\('button'\)/);
  assert.match(source, /btn\.type = 'button'/);
  assert.match(source, /document\.createElement\('a'\)/);
  assert.match(source, /closeBtn\.setAttribute\('aria-label', '關閉選單'\)/);
  assert.match(source, /window\.IfmRouting\.createDrawerFocusManager/);
  assert.match(source, /focusManager\.handleKeyDown\(e\)/);
  const mobileNavSource = source.slice(source.indexOf('function navTo(page, event)'));
  assert.match(mobileNavSource, /focusManager\.close\(\{ restoreFocus: false \}\)/);
  assert.doesNotMatch(mobileNavSource, /focusManager\.close\(\{ focusTarget:/);
  assert.ok(mobileNavSource.indexOf('if (isModifiedClick(event)) return;') < mobileNavSource.indexOf('event.preventDefault();'));
  assert.ok(mobileNavSource.indexOf('event.preventDefault();') < mobileNavSource.indexOf('hideMenu();'));
});

test('Vercel rewrites each public route to index without catching API paths', () => {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'));
  const expectedSources = ['/restaurants', '/suppliers', '/cases', '/about', '/contact'];
  assert.deepEqual(config.rewrites.map(({ source }) => source), expectedSources);
  assert.deepEqual(config.rewrites.map(({ destination }) => destination), Array(5).fill('/index.html'));
  assert.equal(config.rewrites.some(({ source }) => /[*():]/.test(source)), false);
  assert.equal(config.rewrites.some(({ source }) => source.includes('api')), false);
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
});
