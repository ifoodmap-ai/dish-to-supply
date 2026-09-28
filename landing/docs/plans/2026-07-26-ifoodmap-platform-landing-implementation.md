# iFoodmap Platform Landing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the existing iFoodmap Landing into a routable two-sided platform website and add immediate self-service restaurant onboarding to the iFoodmap product.

**Architecture:** Keep the Landing's existing `index.html + support.js` runtime, isolate route mapping in a small testable browser module, and add real History API paths backed by a Vercel fallback rewrite. In the React product, add a validated registration service and page; an authenticated, idempotent PostgreSQL RPC creates the restaurant, default branch, and owner membership in one transaction.

**Tech Stack:** Static HTML/CSS/JavaScript, Node test runner, Vercel, React 18, TypeScript, Vite, Vitest, React Testing Library, Supabase Auth, PostgreSQL, pgTAP.

---

## Working directories

- Landing repository: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy`
- Product repository: `/Users/aimand/.gemini/File/ifoodmap`
- Approved design: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/docs/plans/2026-07-26-ifoodmap-platform-landing-design.md`

Before implementation, use `@using-git-worktrees` to create an isolated worktree for each repository. Do not edit `support.js`. Preserve unrelated user changes.

## Required skills during execution

- `@test-driven-development` for every product behavior and route helper.
- `@security-review` for the onboarding RPC, auth flow, validation, and RLS checks.
- `@frontend-patterns` for the React registration page.
- `@ui-ux-pro-max` for the Landing role pages and product mockups.
- `@verification-before-completion` before any completion claim.

### Task 1: Add the product test harness

**Files:**

- Modify: `/Users/aimand/.gemini/File/ifoodmap/package.json`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/package-lock.json`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/vite.config.ts`
- Create: `/Users/aimand/.gemini/File/ifoodmap/src/test/setup.ts`
- Create: `/Users/aimand/.gemini/File/ifoodmap/src/test/smoke.test.ts`

**Step 1: Install the test dependencies**

Run:

```bash
cd /Users/aimand/.gemini/File/ifoodmap
npm install --save-dev vitest@^2.1.9 jsdom@^25.0.1 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.5.2
```

Expected: `package.json` and `package-lock.json` contain the five test dependencies.

**Step 2: Add test scripts**

Add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

to `scripts` in `package.json`.

**Step 3: Configure Vitest**

Extend `vite.config.ts` with:

```ts
test: {
  environment: "jsdom",
  setupFiles: ["./src/test/setup.ts"],
  clearMocks: true,
},
```

Import the Vitest config type if TypeScript requires it.

**Step 4: Add the setup and smoke test**

`src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`src/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs in jsdom", () => {
    expect(document.createElement("div")).toBeInstanceOf(HTMLElement);
  });
});
```

**Step 5: Run the test**

Run: `npm test -- src/test/smoke.test.ts`

Expected: one passing test.

**Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/test
git commit -m "test: add frontend test harness"
```

### Task 2: Add a transactional restaurant-onboarding RPC

**Files:**

- Create: `/Users/aimand/.gemini/File/ifoodmap/supabase/migrations/20260726150000_restaurant_self_signup.sql`
- Create: `/Users/aimand/.gemini/File/ifoodmap/supabase/tests/database/restaurant_self_signup.test.sql`

**Step 1: Write the failing pgTAP test**

Create a pgTAP test that verifies:

1. Anonymous callers cannot execute `create_restaurant_onboarding`.
2. An authenticated user creates exactly one restaurant.
3. The same call creates one default branch named `總店`.
4. The caller becomes an active `owner`.
5. Repeating the RPC returns the existing restaurant ID without creating duplicates.
6. Empty restaurant names and invalid phone lengths are rejected.

The test should set request claims with:

```sql
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text,
  true
);
```

and call:

```sql
SELECT public.create_restaurant_onboarding(
  '測試餐廳',
  '王小明',
  '0912345678'
);
```

**Step 2: Run the test to verify it fails**

Run:

```bash
supabase start
supabase db reset
supabase test db supabase/tests/database/restaurant_self_signup.test.sql
```

Expected: FAIL because `create_restaurant_onboarding` does not exist.

**Step 3: Implement the RPC**

The migration must use this contract:

```sql
CREATE OR REPLACE FUNCTION public.create_restaurant_onboarding(
  p_name TEXT,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_restaurant_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF length(trim(COALESCE(p_name, ''))) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'restaurant name must be 2-100 characters' USING ERRCODE = '22023';
  END IF;

  IF length(trim(COALESCE(p_contact_name, ''))) > 80 THEN
    RAISE EXCEPTION 'contact name is too long' USING ERRCODE = '22023';
  END IF;

  IF length(trim(COALESCE(p_contact_phone, ''))) > 30 THEN
    RAISE EXCEPTION 'contact phone is too long' USING ERRCODE = '22023';
  END IF;

  SELECT restaurant_id
    INTO v_restaurant_id
    FROM public.restaurant_accounts
   WHERE user_id = v_user_id
     AND is_active
   ORDER BY created_at
   LIMIT 1;

  IF v_restaurant_id IS NOT NULL THEN
    RETURN v_restaurant_id;
  END IF;

  INSERT INTO public.restaurants (name, contact_name, contact_phone)
  VALUES (
    trim(p_name),
    NULLIF(trim(COALESCE(p_contact_name, '')), ''),
    NULLIF(trim(COALESCE(p_contact_phone, '')), '')
  )
  RETURNING id INTO v_restaurant_id;

  INSERT INTO public.restaurant_branches (restaurant_id, name)
  VALUES (v_restaurant_id, '總店');

  INSERT INTO public.restaurant_accounts (user_id, restaurant_id, role)
  VALUES (v_user_id, v_restaurant_id, 'owner');

  RETURN v_restaurant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_restaurant_onboarding(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_restaurant_onboarding(TEXT, TEXT, TEXT) TO authenticated;
```

Do not accept `user_id`, `role`, or `is_active` from the client.

**Step 4: Run the database tests**

Run:

```bash
supabase db reset
supabase test db supabase/tests/database/restaurant_self_signup.test.sql
```

Expected: all pgTAP assertions pass.

**Step 5: Review security**

Verify:

- `auth.uid()` is the only identity source.
- `SECURITY DEFINER` has `SET search_path = public`.
- `PUBLIC` execute is revoked.
- Inserts are transactionally rolled back on any failure.
- The function cannot create supplier or admin roles.
- Existing restaurant RLS policies still restrict subsequent reads and writes.

**Step 6: Commit**

```bash
git add supabase/migrations/20260726150000_restaurant_self_signup.sql supabase/tests/database/restaurant_self_signup.test.sql
git commit -m "feat: add secure restaurant onboarding"
```

### Task 3: Add registration validation and onboarding service

**Files:**

- Create: `/Users/aimand/.gemini/File/ifoodmap/src/lib/restaurant-registration.ts`
- Create: `/Users/aimand/.gemini/File/ifoodmap/src/lib/restaurant-registration.test.ts`

**Step 1: Write failing validation tests**

Cover:

- Restaurant name requires 2–100 characters.
- Contact name is required and no longer than 80 characters.
- Phone is required, permits spaces, `+`, parentheses and hyphens, and contains 8–15 digits.
- Email is normalized with `trim().toLowerCase()`.
- Password requires at least eight characters.
- Password confirmation must match.
- Terms must be accepted.

Use this public result shape:

```ts
type RegistrationErrors = Partial<Record<
  "restaurantName" | "contactName" | "phone" | "email" |
  "password" | "confirmPassword" | "terms",
  string
>>;

export function validateRestaurantRegistration(
  input: RestaurantRegistrationInput
): RegistrationErrors;
```

**Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/restaurant-registration.test.ts`

Expected: FAIL because the module does not exist.

**Step 3: Implement validation and error normalization**

Export:

```ts
export interface RestaurantRegistrationInput {
  restaurantName: string;
  contactName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
}

export type RestaurantRegistrationErrorCode =
  | "EMAIL_EXISTS"
  | "EMAIL_CONFIRMATION_REQUIRED"
  | "ONBOARDING_FAILED"
  | "UNKNOWN";
```

Add:

```ts
export async function registerRestaurant(
  client: Pick<typeof supabase, "auth" | "rpc">,
  input: RestaurantRegistrationInput
): Promise<{ restaurantId: string }>;
```

Behavior:

1. Validate and throw a typed validation error before network calls.
2. Call `auth.signUp` with normalized Email and `display_name`.
3. If Supabase returns an existing-user error, throw `EMAIL_EXISTS`.
4. If signup returns no session, throw `EMAIL_CONFIRMATION_REQUIRED`.
5. Call `rpc("create_restaurant_onboarding", ...)`.
6. Return the restaurant ID.
7. Keep the RPC idempotent so a logged-in user can safely retry after a transient failure.

Do not log passwords or the Supabase session.

**Step 4: Add mocked service tests**

Verify:

- Invalid data makes no auth call.
- Signup uses the normalized Email.
- Missing session maps to `EMAIL_CONFIRMATION_REQUIRED`.
- RPC receives only name, contact name, and phone.
- RPC failures map to `ONBOARDING_FAILED`.
- Success returns the UUID.

**Step 5: Run the tests**

Run: `npm test -- src/lib/restaurant-registration.test.ts`

Expected: all validation and service tests pass.

**Step 6: Commit**

```bash
git add src/lib/restaurant-registration.ts src/lib/restaurant-registration.test.ts
git commit -m "feat: add restaurant registration service"
```

### Task 4: Build the restaurant registration page

**Files:**

- Create: `/Users/aimand/.gemini/File/ifoodmap/src/pages/RestaurantRegisterPage.tsx`
- Create: `/Users/aimand/.gemini/File/ifoodmap/src/pages/RestaurantRegisterPage.test.tsx`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/App.tsx:17-27`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/App.tsx:125-140`
- Modify: `/Users/aimand/.gemini/File/ifoodmap/src/pages/LoginPortal.tsx:35-55`

**Step 1: Write the failing interaction tests**

Mock `registerRestaurant`, `useNavigate`, and toast. Verify:

- All seven approved fields render.
- The submit button is disabled while submitting.
- Client errors are displayed beside fields and focus moves to the first invalid field.
- Successful registration navigates to `/restaurant`.
- Existing Email shows an action linking to `/`.
- Confirmation-required shows a clear configuration-dependent message.
- RPC/network failure preserves non-password fields and clears both password fields.
- The Login page's restaurant footer links to `/register/restaurant`.

**Step 2: Run the tests to verify they fail**

Run: `npm test -- src/pages/RestaurantRegisterPage.test.tsx`

Expected: FAIL because the page and route do not exist.

**Step 3: Implement the page**

Use existing `Card`, `Input`, `Label`, `Button`, `Checkbox`, `Loader2`, `Link`, and `toast` components. Keep one React state object for the form and one error object. Use native `autocomplete` values:

- `organization`
- `name`
- `tel`
- `email`
- `new-password`

The page should include:

- Logo and `免費建立餐廳帳號`
- One-sentence benefit statement
- Short form
- Terms checkbox
- Primary submit button
- `已有帳號？登入平台`
- A side or top benefit summary on desktop

On success:

```ts
toast.success("餐廳帳號已建立", {
  description: "歡迎加入 iFoodmap，現在開始設定你的採購流程。",
});
navigate("/restaurant", { replace: true });
```

**Step 4: Register the route**

Import the page in `App.tsx` and add:

```tsx
<Route path="/register/restaurant" element={<RestaurantRegisterPage />} />
```

before protected restaurant routes.

Change the restaurant footer in `LoginPortal.tsx` to:

```ts
footer: {
  text: "還沒有帳號?",
  linkText: "免費建立餐廳帳號",
  to: "/register/restaurant",
},
```

**Step 5: Run focused and full checks**

Run:

```bash
npm test -- src/pages/RestaurantRegisterPage.test.tsx
npm test
npm run lint
npm run build
```

Expected: tests pass, ESLint exits zero, Vite build succeeds.

**Step 6: Commit**

```bash
git add src/pages/RestaurantRegisterPage.tsx src/pages/RestaurantRegisterPage.test.tsx src/App.tsx src/pages/LoginPortal.tsx
git commit -m "feat: add self-service restaurant signup"
```

### Task 5: Add and test Landing route mapping

**Files:**

- Create: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/routing.js`
- Create: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/tests/routing.test.cjs`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/package.json`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html:1-8`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html:535-650`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/vercel.json`

**Step 1: Write failing route tests**

Test these mappings:

```js
{
  "/": "home",
  "/restaurants": "restaurants",
  "/suppliers": "suppliers",
  "/cases": "cases",
  "/about": "about",
  "/contact": "contact"
}
```

Also verify:

- Trailing slashes are normalized.
- Unknown paths fall back to `home`.
- `pageToPath("restaurants")` returns `/restaurants`.

**Step 2: Run tests to verify failure**

Add `"test": "node --test tests/*.test.cjs"` to `package.json`.

Run: `npm test`

Expected: FAIL because `routing.js` does not exist.

**Step 3: Implement the UMD route helper**

Expose:

```js
window.IfmRouting = {
  pathToPage: function (pathname) {},
  pageToPath: function (page) {}
};
```

and `module.exports = api` when CommonJS is available so Node can test it. Do not access `window` unless it exists.

**Step 4: Integrate History API**

Load `routing.js` before the `<x-dc>` component.

Change the component to:

- Initialize `state.page` from `pathToPage(window.location.pathname)`.
- Add a stable `popstate` handler in `componentDidMount`.
- Remove that handler in `componentWillUnmount`.
- Update `go(page)` to call `history.pushState` only when the path actually changes.
- Preserve scroll-to-top and reveal setup.
- Replace `services` state with `restaurants`.
- Add `suppliers` state and handlers.

**Step 5: Add Vercel rewrites**

Keep the `support.js` cache header and add:

```json
"rewrites": [
  { "source": "/restaurants", "destination": "/index.html" },
  { "source": "/suppliers", "destination": "/index.html" },
  { "source": "/cases", "destination": "/index.html" },
  { "source": "/about", "destination": "/index.html" },
  { "source": "/contact", "destination": "/index.html" }
]
```

Do not rewrite `/api/*`.

**Step 6: Run tests**

Run: `npm test`

Expected: route helper tests pass.

**Step 7: Commit**

```bash
git add routing.js tests/routing.test.cjs package.json index.html vercel.json
git commit -m "feat: add routable landing pages"
```

### Task 6: Rebuild the Landing header, homepage, and shared CTA system

**Files:**

- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html:55-270`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html:631-739`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html:827-1340`

**Step 1: Add static-content assertions**

Create `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/tests/content.test.cjs` that reads `index.html` and asserts the presence of:

- `AI 驅動的 B2B 食材採購平台`
- `讓每一筆食材採購，都更快找到對的人`
- `餐廳免費註冊`
- `供應商免費上架`
- `3,000+`, `2,500+`, `28 類`, `24hr`
- `/register/restaurant`
- `/join`

Assert the removed main navigation label `服務` is not present in the header fragment.

**Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: content assertions fail.

**Step 3: Add one product-site configuration**

At the start of the enhancement script, define:

```js
var IFOODMAP_APP_URL = 'https://dish-to-supply.vercel.app';
```

Generate these URLs only from that base:

- Restaurant registration: `/register/restaurant`
- Supplier application: `/join`
- Login: `/`

External product CTAs must be real `<a>` elements with visible focus styles.

**Step 4: Replace the header**

Use:

- 平台介紹 → `/`
- 餐廳方案 → `/restaurants`
- 供應商方案 → `/suppliers`
- 成功案例 → `/cases`
- 關於我們 → `/about`
- 登入平台 → product base URL

Mobile navigation must expose the same destinations.

**Step 5: Replace the homepage hero**

Use the approved copy:

- Eyebrow: `AI 驅動的 B2B 食材採購平台`
- H1: `讓每一筆食材採購，都更快找到對的人`
- Body: `iFoodmap 串接餐廳需求與全台食材供應商，從智慧媒合、報價比較到訂單管理，讓採購與接單都更有效率。`

Replace the current single-purpose CTA row with two equal role cards:

- 餐廳: 菜單成本、比價採購、訂單收貨; CTA `餐廳免費註冊`
- 供應商: 商機媒合、線上報價、出貨管理; CTA `供應商免費上架`

**Step 6: Replace the homepage flow**

Use four steps:

1. 餐廳提出需求
2. AI 標準化與媒合
3. 供應商線上報價
4. 完成採購與履歷

Add two product-value groups:

- 餐廳: 菜單分析、成本管理、比價採購、訂單與收貨
- 供應商: 商機雷達、線上報價、接單出貨、定價與需求預測

Keep the four approved platform numbers and existing three case cards.

**Step 7: Build coded product mockups**

Use semantic HTML and CSS rather than generated screenshots:

- Restaurant mockup: cost KPI, open orders, supplier comparison.
- Supplier mockup: new leads, quote status, demand forecast.
- Use fictional labels such as `示範餐廳` and `示範供應商`.
- Add `aria-label="產品功能示意畫面"` and do not label them as screenshots.

**Step 8: Run checks**

Run:

```bash
npm test
npx serve . -l 4173
```

Open `/`, `/restaurants`, and `/suppliers` at desktop and mobile widths. Expected: homepage is complete, both role cards have equal visual weight, and no placeholder stripe blocks remain on the homepage.

**Step 9: Commit**

```bash
git add index.html tests/content.test.cjs
git commit -m "feat: reposition landing as two-sided platform"
```

### Task 7: Build the restaurant solution page

**Files:**

- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/tests/content.test.cjs`

**Step 1: Add failing content assertions**

Assert `/restaurants` content includes:

- `從菜單分析到完成收貨`
- `AI 菜單分析`
- `成本與採購`
- `訂單與收貨`
- `團隊管理`
- `免費建立餐廳帳號`

**Step 2: Run the test to verify failure**

Run: `npm test`

Expected: the new assertions fail.

**Step 3: Replace the old services page**

Use the old services page visual rhythm for the restaurant page:

1. Restaurant hero with `免費建立餐廳帳號`.
2. Four pain points.
3. Four capability sections with alternating copy and coded mockups.
4. Restaurant and group-catering cases.
5. Final registration CTA.

Each feature description must match behavior that exists in:

- `RestaurantAnalyzePage.tsx`
- `RestaurantMenuPage.tsx`
- `RestaurantPurchasePage.tsx`
- `RestaurantOrdersPage.tsx`
- `RestaurantCostsPage.tsx`
- `RestaurantTeamPage.tsx`

Do not advertise automatic replenishment as live unless the product has a working action for it.

**Step 4: Verify route and CTA**

Run `npm test`, then open `http://localhost:4173/restaurants`.

Expected: direct load succeeds, both restaurant CTAs go to the product's `/register/restaurant`.

**Step 5: Commit**

```bash
git add index.html tests/content.test.cjs
git commit -m "feat: add restaurant solution page"
```

### Task 8: Build the supplier solution page

**Files:**

- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/tests/content.test.cjs`

**Step 1: Add failing content assertions**

Assert `/suppliers` content includes:

- `從商品上架到商機、報價與出貨`
- `商機雷達`
- `報價與接單`
- `定價與預測`
- `客戶經營`
- `免費申請成為供應商`

**Step 2: Run the test to verify failure**

Run: `npm test`

Expected: the supplier assertions fail.

**Step 3: Add the supplier page**

Add a new `sc-if` branch containing:

1. Supplier hero and application CTA.
2. Four supplier pain points.
3. Four capability sections with coded mockups.
4. Existing supplier-facing platform metrics and testimonial.
5. Final supplier application CTA.

Descriptions must match:

- `SupplierLeadsPage.tsx`
- `SupplierQuotesPage.tsx`
- `SupplierOrdersPage.tsx`
- `SupplierPricingPage.tsx`
- `SupplierForecastPage.tsx`
- `SupplierCustomersPage.tsx`
- `SupplierShipmentsPage.tsx`
- `SupplierReviewsPage.tsx`

All application CTAs go to the product's `/join`.

**Step 4: Verify**

Run `npm test`, then open `http://localhost:4173/suppliers`.

Expected: direct load succeeds and all supplier CTAs go to `/join`.

**Step 5: Commit**

```bash
git add index.html tests/content.test.cjs
git commit -m "feat: add supplier solution page"
```

### Task 9: Align cases, about, contact, metadata, and footer

**Files:**

- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html:9-36`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/index.html:315-525`
- Modify: `/Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy/tests/content.test.cjs`

**Step 1: Add failing assertions**

Verify:

- Title and description describe a two-sided B2B platform.
- Footer contains restaurant, supplier, cases, about, contact, and login links.
- Existing service phone, Email, and opening hours remain present.
- Existing case result numbers remain present.
- The contact form heading remains `填寫食材需求` so the existing delegated submit handler still finds it.

**Step 2: Update metadata**

Use:

```html
<title>iFoodmap 食材地圖｜餐廳與供應商的 B2B 食材採購平台</title>
<meta name="description" content="iFoodmap 以 AI 串接餐廳需求與全台食材供應商，整合智慧媒合、報價比較、訂單、出貨與採購管理。">
```

Align Open Graph and Twitter copy. Keep the existing approved OG image URL unless a new asset is explicitly created.

**Step 3: Align supporting pages**

- Cases: keep all approved names and result numbers; improve comparison hierarchy.
- About: describe the two-sided platform and retain the three operating values.
- Contact: retain general consultation and existing lead submission behavior.
- Footer: split links into `餐廳`, `供應商`, `公司`, and `客服`.

**Step 4: Regression-test existing progressive enhancement**

Verify:

- Contact form posts to `landing_leads`.
- AI chat calls `/api/ai-chat`.
- Menu upload calls `/api/ai-menu`.
- AI extraction calls `/api/ai-extract`.
- Mobile menu opens and navigates to real routes.
- Reduced-motion mode disables nonessential motion.

**Step 5: Run tests and commit**

```bash
npm test
git add index.html tests/content.test.cjs
git commit -m "feat: align landing support pages and metadata"
```

### Task 10: End-to-end verification across both repositories

**Files:**

- Modify only files required by failures found during verification.

**Step 1: Verify the product**

Run:

```bash
cd /Users/aimand/.gemini/File/ifoodmap
npm test
npm run lint
npm run build
```

Expected: all commands exit zero.

**Step 2: Verify the database**

Run:

```bash
supabase db reset
supabase test db supabase/tests/database/restaurant_self_signup.test.sql
```

Expected: reset succeeds and all pgTAP tests pass.

**Step 3: Verify the Landing**

Run:

```bash
cd /Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy
npm test
npx serve . -l 4173
```

Verify these direct URLs:

- `http://localhost:4173/`
- `http://localhost:4173/restaurants`
- `http://localhost:4173/suppliers`
- `http://localhost:4173/cases`
- `http://localhost:4173/about`
- `http://localhost:4173/contact`

**Step 4: Browser acceptance matrix**

At 1440×900, 768×1024, and 390×844 verify:

- No horizontal overflow.
- Header and mobile menu expose all destinations.
- Browser back/forward restores the correct page.
- Role cards have equal visual weight.
- Focus indicators are visible.
- All CTA targets are correct.
- Product mockups are readable and identified as examples.
- Contact and AI flows still work.

**Step 5: Verify onboarding manually**

Use a fresh Email:

1. Open `/register/restaurant`.
2. Submit valid data.
3. Confirm immediate redirect to `/restaurant`.
4. Confirm one restaurant, one `總店` branch, and one active owner membership.
5. Sign out and sign back in through the restaurant role.
6. Confirm the user cannot access another restaurant's rows.

Then verify invalid data, duplicate Email, weak password, double-click submission, simulated RPC error, and simulated offline state.

If signup returns no session, stop and update the Supabase Auth Email-confirmation setting before claiming immediate onboarding works.

**Step 6: Inspect repository state**

Run:

```bash
git -C /Users/aimand/.gemini/File/ifoodmap status --short
git -C /Users/aimand/.gemini/File/ifoodmap-landing/ifoodmap_deploy status --short
```

Expected: only intentional changes remain.

**Step 7: Final review commit**

Commit only actual fixes discovered during verification:

```bash
git add <verified-files>
git commit -m "fix: resolve platform landing acceptance issues"
```

Do not create an empty commit.
