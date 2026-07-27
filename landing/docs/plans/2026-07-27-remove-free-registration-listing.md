# Remove Free Registration and Listing Wording Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove price-related「免費」wording from restaurant registration and supplier listing interfaces while preserving every「免費媒合」message.

**Architecture:** This is a copy-only change across the Product React application and the Landing static SPA. Update mutation-sensitive content tests first, then replace only registration/listing wording in public UI; historical planning documents remain unchanged.

**Tech Stack:** React, TypeScript, Vitest, Node test runner, static HTML/JavaScript

---

### Task 1: Product registration and listing wording

**Files:**
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/App.registration-route.test.tsx`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/pages/RestaurantRegisterPage.test.tsx`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/pages/LoginPortal.tsx`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/pages/RestaurantRegisterPage.tsx`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/pages/JoinSupplierPage.tsx`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/components/investors/roadmap-config.ts`

**Step 1: Write the failing tests**

Change the expected restaurant heading and login CTA to `建立餐廳帳號`. Add assertions that the public registration/listing UI does not contain:

```ts
/免費.*(?:註冊|帳號|上架)|(?:註冊|上架).*免費|不收上架費|零成本/
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/App.registration-route.test.tsx src/pages/RestaurantRegisterPage.test.tsx
```

Expected: FAIL because the current UI still includes registration/listing free claims.

**Step 3: Update the Product copy**

Use these replacements:

```text
免費建立餐廳帳號 → 建立餐廳帳號
免費上架申請 → 上架申請
免費上架 → 供應商上架
免費建立供應商檔案與商品目錄,不收上架費,零成本觸及更多餐飲買家。
→ 建立供應商檔案與商品目錄，申請上架並觸及更多餐飲買家。
```

Update roadmap copy from `免費上架` to `供應商上架`. Do not alter docs or any `免費媒合` wording.

**Step 4: Verify Product**

Run:

```bash
npm test
npm run typecheck:registration
npm run build
npx eslint src/App.registration-route.test.tsx src/pages/RestaurantRegisterPage.test.tsx src/pages/LoginPortal.tsx src/pages/RestaurantRegisterPage.tsx src/pages/JoinSupplierPage.tsx src/components/investors/roadmap-config.ts
```

Expected: all tests, typecheck, build, and scoped lint pass.

**Step 5: Commit**

```bash
git add src/App.registration-route.test.tsx src/pages/RestaurantRegisterPage.test.tsx src/pages/LoginPortal.tsx src/pages/RestaurantRegisterPage.tsx src/pages/JoinSupplierPage.tsx src/components/investors/roadmap-config.ts
git commit -m "copy: remove free registration and listing claims"
```

### Task 2: Landing registration and listing wording

**Files:**
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/tests/content.test.cjs`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html`

**Step 1: Write the failing tests**

Update CTA expectations to:

```text
餐廳註冊
供應商上架
建立餐廳帳號
申請供應商上架
```

Add a guard that rejects registration/listing free claims inside `index.html`, and a separate positive assertion that `免費媒合` remains present.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test
```

Expected: FAIL because current CTA and explanatory copy still use the old wording.

**Step 3: Update Landing copy**

Replace registration/listing phrases in all six route fragments, contact role entries, and footer links. Change:

```text
餐廳免費建立帳號，供應商免費申請上架。
→ 餐廳建立帳號，供應商申請上架。
```

Do not change the contact submit button, AI fallback, AI lead CTA, or any other `免費媒合` copy.

**Step 4: Verify Landing**

Run:

```bash
npm test
git diff --check
```

Expected: 59 tests pass and no whitespace errors.

**Step 5: Commit**

```bash
git add index.html tests/content.test.cjs docs/plans/2026-07-27-remove-free-registration-listing-design.md docs/plans/2026-07-27-remove-free-registration-listing.md
git commit -m "copy: remove free registration and listing wording"
```

### Task 3: Final cross-project verification and delivery

**Step 1: Search public source**

Run targeted `rg` checks in both repositories. Expected:

- No production UI matches for free registration/listing claims.
- `免費媒合` still exists in Landing.
- Historical docs may retain old approved wording.

**Step 2: Confirm clean main branches**

Run:

```bash
git status --short --branch
git diff --check origin/main...HEAD
```

Expected: clean worktrees, local `main` ahead of `origin/main`.

**Step 3: Push**

Run in both repositories:

```bash
git push origin main
```

Expected: both remote `main` branches advance to the verified commits.
