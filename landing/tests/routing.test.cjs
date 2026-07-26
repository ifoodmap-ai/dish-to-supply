const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createHistoryController, pageToPath, pathToPage } = require('../routing.js');
const projectRoot = path.resolve(__dirname, '..');

function createFakeWindow(pathname = '/') {
  const listeners = new Map();
  const pushes = [];

  return {
    location: { pathname },
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
    pushes,
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
  assert.deepEqual(pages, ['restaurants', 'restaurants']);

  fakeWindow.location.pathname = '/suppliers';
  fakeWindow.dispatch('popstate');
  assert.deepEqual(pages, ['restaurants', 'restaurants', 'suppliers']);

  controller.stop();
  assert.equal(fakeWindow.listeners.has('popstate'), false);
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

test('index loads routing before support and wires History API navigation', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const routingScriptIndex = source.indexOf('src="/routing.js"');
  const supportScriptIndex = source.indexOf('src="./support.js"');

  assert.notEqual(routingScriptIndex, -1);
  assert.notEqual(supportScriptIndex, -1);
  assert.ok(routingScriptIndex < supportScriptIndex);
  assert.match(source, /window\.IfmRouting\.pathToPage\(window\.location\.pathname\)/);
  assert.match(source, /window\.IfmRouting\.createHistoryController/);
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
  assert.match(source, /e\.key === 'Escape'/);
  assert.match(source, /menu\.inert = true/);
  assert.match(source, /menu\.inert = false/);
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
