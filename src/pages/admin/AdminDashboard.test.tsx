// 總覽分區(業主拍板 Q4-A):「營運」分頁(/admin,AdminDashboard)與「成長」分頁(/admin/growth,AdminGrowthPage)。
// 驗證:①營運分頁最上方是「今日待辦」 ②兩頁重複的東西只留一份:供應商數、轉換漏斗只在成長分頁;
//       營運分頁不再另外顯示跟今日待辦同一個數字的「待審核」 ③漏斗下方原本的「供應商申請」搬到成長分頁,沒有弄丟。
// 今日待辦本身的數字/0/失敗在 TodayTodos.test.tsx。

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from './testFakeSupabase';
import AdminDashboard from './AdminDashboard';
import AdminGrowthPage from './AdminGrowthPage';

vi.mock('@/integrations/supabase/client', async () => ({
  supabase: (await import('./testFakeSupabase')).fakeSupabase.client,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// recharts 的 ResponsiveContainer 需要 ResizeObserver,jsdom 沒有
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const renderIn = (ui: JSX.Element) => render(<MemoryRouter initialEntries={['/admin']}>{ui}</MemoryRouter>);

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeSupabase.reset();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  fetchGuard = vi.fn(() => Promise.reject(new Error('測試不准打網路')));
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
});

describe('總覽 › 營運(AdminDashboard)', () => {
  it('最上方是「今日待辦」,排在所有 KPI 與圖表前面', async () => {
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_orders') return { count: 42 };
      if (q.table === 'supplies') return { count: 9 };
      if (q.table === 'analysis_records' && q.options?.head) return { count: 3 };
      return undefined;
    });
    renderIn(<AdminDashboard />);

    const todos = screen.getByRole('region', { name: '今日待辦' });
    const firstKpi = screen.getByText('需求總數');
    // 今日待辦在 DOM 順序上排在第一個 KPI 前面
    expect(todos.compareDocumentPosition(firstKpi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(within(todos).getByTestId('todo-analyses-value')).toHaveTextContent('3'));
    expect(await screen.findByText('42')).toBeInTheDocument(); // 總訂單 KPI 照舊
  });

  it('重複的東西只留一份:沒有「供應商數」「轉換漏斗」,也沒有跟今日待辦重複的「待審核」KPI', async () => {
    renderIn(<AdminDashboard />);
    await waitFor(() => expect(fakeSupabase.queriesOf('supplies')).toHaveLength(1));

    expect(screen.queryByText('供應商數')).toBeNull();
    expect(screen.queryByText(/轉換漏斗/)).toBeNull();
    expect(screen.queryByText('待審核')).toBeNull();
    ['需求總數', '已媒合', '媒合率', '上架商品', '總訂單'].forEach((kpi) => {
      expect(screen.getByText(kpi)).toBeInTheDocument();
    });
    // 漏斗搬走之後,營運分頁也不再整張讀 app_events、不再數供應商
    expect(fakeSupabase.queriesOf('app_events')).toEqual([]);
    expect(fakeSupabase.queriesOf('suppliers')).toEqual([]);
    expect(fakeSupabase.writes()).toEqual([]);
  });
});

describe('總覽 › 成長(AdminGrowthPage)', () => {
  it('轉換漏斗留在成長分頁,原本營運儀表板漏斗下方的「供應商申請」也搬過來了', async () => {
    fakeSupabase.respond((q) => {
      if (q.table === 'app_events') {
        return {
          data: [
            { event: 'analysis_started' },
            { event: 'analysis_started' },
            { event: 'analysis_completed' },
            { event: 'supplier_applied' },
            { event: 'supplier_applied' },
            { event: 'supplier_applied' },
          ],
        };
      }
      return { data: [] };
    });
    renderIn(<AdminGrowthPage />);

    expect(await screen.findByText(/轉換漏斗/)).toBeInTheDocument();
    const line = await screen.findByText('供應商申請(不計入漏斗)');
    expect(line.parentElement).toHaveTextContent('供應商申請(不計入漏斗)3');
    // 供應商數 KPI 在成長分頁
    expect(screen.getByText('累計供應商數')).toBeInTheDocument();
  });
});
