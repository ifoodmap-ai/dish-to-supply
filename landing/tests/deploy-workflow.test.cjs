const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 2026-09-28 起形象站住在 ifoodmap-ai/dish-to-supply 的 landing/,部署 workflow 在 repo 根目錄。
// 產品端(根目錄)有自己的 deploy-vercel.yml / product-ci.yml,兩邊靠路徑過濾互不觸發。
const wf = fs.readFileSync(path.join(__dirname, '..', '..', '.github/workflows/landing-deploy.yml'), 'utf8');

test('landing-deploy 只在 landing/ 有變動時觸發,而且所有指令都在 landing/ 裡跑', () => {
  assert.match(wf, /push:\s*\n\s*branches: \[main\]\s*\n\s*paths:\s*\n\s*- "landing\/\*\*"/);
  assert.match(wf, /defaults:\s*\n\s*run:\s*\n\s*working-directory: landing\s*\n/);
});

test('部署前一定先跑 npm test,PR 只測不部署', () => {
  assert.match(wf, /deploy:\s*\n\s*needs: test\s*\n\s*if: github\.event_name != 'pull_request'/);
});

test('專案 ID 寫死成形象站專案,不可以用本 repo 的 secrets.VERCEL_PROJECT_ID(那是舊 "ifoodmap" 專案)', () => {
  assert.doesNotMatch(wf, /\$\{\{\s*secrets\.VERCEL_PROJECT_ID\s*\}\}/);
  assert.match(wf, /^\s+VERCEL_PROJECT_ID: prj_[A-Za-z0-9]+$/m);
});
