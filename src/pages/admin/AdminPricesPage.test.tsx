// 食材資料 › 價格檢查(原「價格資料維護」)的「修正品項」連結。
// 🔴 以前寫的是相對網址 /supplier/:id —— 管理員站(VITE_PORTAL=admin)沒有這條路由,
//    點了會被萬用路由導回登入頁。公開供應商頁只在主站上,所以連結要指到 MAIN_SITE_URL。

import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIN_SITE_URL } from '@/lib/portal';
import { fakeSupabase } from './testFakeSupabase';
import AdminPricesPage from './AdminPricesPage';

vi.mock('@/integrations/supabase/client', async () => ({
  supabase: (await import('./testFakeSupabase')).fakeSupabase.client,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SUPPLIER_ID = '0b5c1e7a-1111-4000-8000-00000000abcd';

const PRICE_ROWS = [
  {
    id: 'ph-1', ingredient_id: 'ing-1', supply_id: 'sup-1', supplier_id: SUPPLIER_ID, raw_name: '牛腱',
    price: 420, unit: 'kg', normalized_price: 420, region: '台北', captured_at: '2026-09-20T02:00:00.000Z',
  },
  {
    // 沒有 supplier_id(例如從別的來源擷取的報價)→ 沒有連結可以點
    id: 'ph-2', ingredient_id: 'ing-1', supply_id: null, supplier_id: null, raw_name: '牛腱(市場價)',
    price: 400, unit: 'kg', normalized_price: 400, region: null, captured_at: '2026-09-19T02:00:00.000Z',
  },
];

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/prices']}>
      <AdminPricesPage />
    </MemoryRouter>,
  );

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeSupabase.reset();
  fakeSupabase.respond((q) => {
    if (q.table === 'price_history') return { data: PRICE_ROWS };
    if (q.table === 'ingredients') return { data: [{ id: 'ing-1', canonical_name: '牛腱' }] };
    if (q.table === 'suppliers') return { data: [{ id: SUPPLIER_ID, name: '頂鮮肉品行' }] };
    return undefined;
  });
  fetchGuard = vi.fn(() => Promise.reject(new Error('測試不准打網路')));
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
});

describe('AdminPricesPage — 「修正品項」連結', () => {
  it('連到主站上這家供應商的公開頁(絕對網址),不是管理員站會壞掉的相對網址', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /修正品項/ });

    expect(link).toHaveAttribute('href', `${MAIN_SITE_URL}/supplier/${SUPPLIER_ID}`);
    expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    expect(link.getAttribute('href')).not.toMatch(/^\/supplier\//);
  });

  it('在新分頁開、不帶 opener 與 referrer', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /修正品項/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  });

  it('沒有供應商的報價那一列沒有連結(只有一個「修正品項」)', async () => {
    renderPage();
    await screen.findByRole('link', { name: /修正品項/ });
    expect(screen.getAllByRole('link', { name: /修正品項/ })).toHaveLength(1);
    const orphanRow = screen.getByText('牛腱(市場價)').closest('tr') as HTMLElement;
    expect(within(orphanRow).queryByRole('link')).toBeNull();
  });

  it('頁面本身照舊是唯讀報表:載入不寫任何資料', async () => {
    renderPage();
    await screen.findByRole('link', { name: /修正品項/ });
    expect(fakeSupabase.writes()).toEqual([]);
    expect(fakeSupabase.queriesOf('price_history')[0].filters).toEqual([
      { op: 'order', column: 'captured_at', value: { ascending: false } },
      { op: 'limit', column: 'limit', value: 1000 },
    ]);
  });
});
