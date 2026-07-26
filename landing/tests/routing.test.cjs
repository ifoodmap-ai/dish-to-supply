const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { pageToPath, pathToPage } = require('../routing.js');
const projectRoot = path.resolve(__dirname, '..');

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

test('index loads routing before support and wires History API navigation', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const routingScriptIndex = source.indexOf('src="/routing.js"');
  const supportScriptIndex = source.indexOf('src="./support.js"');

  assert.notEqual(routingScriptIndex, -1);
  assert.notEqual(supportScriptIndex, -1);
  assert.ok(routingScriptIndex < supportScriptIndex);
  assert.match(source, /window\.IfmRouting\.pathToPage\(window\.location\.pathname\)/);
  assert.match(source, /window\.addEventListener\('popstate', this\._onPopState\)/);
  assert.match(source, /window\.removeEventListener\('popstate', this\._onPopState\)/);
  assert.match(source, /window\.history\.pushState\(\{\}, '', path\)/);
  assert.match(source, /isRestaurants:\s*page === 'restaurants'/);
  assert.match(source, /isSuppliers:\s*page === 'suppliers'/);
});

test('package test script runs the Node test suite', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.cjs');
});

test('Vercel rewrites each public route to index without catching API paths', () => {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites, [
    { source: '/restaurants', destination: '/index.html' },
    { source: '/suppliers', destination: '/index.html' },
    { source: '/cases', destination: '/index.html' },
    { source: '/about', destination: '/index.html' },
    { source: '/contact', destination: '/index.html' },
  ]);
  assert.equal(config.rewrites.some(({ source }) => source.includes('api')), false);
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
});
