// 總覽「營運」分頁最上方的「今日待辦」(業主拍板 Q4-A):四個數字,各自點下去就到對應分區的分頁。
// 數字的定義與查詢都在 ./adminCounts(與「會員 › 入駐審核」分頁上的待審數共用同一份),這裡只管顯示。
// 每個數字各自有三種狀態:讀取中 → 灰色骨架;查到 → 數字(0 也照實顯示 0);
// 查詢失敗 → 「—」+「讀取失敗」—— 絕不把失敗顯示成 0,不然管理員會以為沒事。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ChevronRight, ClipboardCheck, RefreshCw, Scale, UserPlus, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchOpenDisputeCount,
  fetchPendingAnalysisCount,
  fetchPendingApplicationCount,
  fetchStuckOrderCount,
} from './adminCounts';

type TodoKey = 'stuck' | 'applications' | 'disputes' | 'analyses';

interface TodoDef {
  key: TodoKey;
  label: string;
  /** 數字底下那一句,也就是這個數字的定義 */
  hint: string;
  /** 點下去要去的分頁 */
  to: string;
  /** 那個分頁在哪個分區(滑鼠停留提示用) */
  destination: string;
  icon: LucideIcon;
  /** 有待辦時數字用什麼顏色:紅 = 已經超時/有人在等處理,琥珀 = 待審 */
  tone: 'red' | 'amber';
  fetch: () => Promise<number>;
}

const TODOS: TodoDef[] = [
  {
    key: 'stuck',
    label: '卡關訂單',
    hint: '停留超過該階段的處理時限',
    to: '/admin/pipeline',
    destination: '訂單 › 看板',
    icon: AlertTriangle,
    tone: 'red',
    fetch: fetchStuckOrderCount,
  },
  {
    key: 'applications',
    label: '待審入駐',
    hint: '供應商入駐申請等審核',
    to: '/admin/applications',
    destination: '會員 › 入駐審核',
    icon: UserPlus,
    tone: 'amber',
    fetch: fetchPendingApplicationCount,
  },
  {
    key: 'disputes',
    label: '未結爭議',
    hint: '待處理＋調查中',
    to: '/admin/disputes',
    destination: '訂單 › 爭議',
    icon: Scale,
    tone: 'red',
    fetch: fetchOpenDisputeCount,
  },
  {
    key: 'analyses',
    label: '待審分析',
    hint: 'AI 分析紀錄等審核',
    to: '/admin/analyses',
    destination: '需求與媒合 › AI 分析紀錄',
    icon: ClipboardCheck,
    tone: 'amber',
    fetch: fetchPendingAnalysisCount,
  },
];

type TodoState =
  | { status: 'loading' }
  | { status: 'ok'; count: number }
  | { status: 'error'; message: string };

const allLoading = (): Record<TodoKey, TodoState> => ({
  stuck: { status: 'loading' },
  applications: { status: 'loading' },
  disputes: { status: 'loading' },
  analyses: { status: 'loading' },
});

const TONE_TEXT: Record<TodoDef['tone'], string> = { red: 'text-red-600', amber: 'text-amber-600' };
const TONE_BORDER: Record<TodoDef['tone'], string> = { red: 'border-red-200', amber: 'border-amber-200' };

const TodoTile = ({ todo, state }: { todo: TodoDef; state: TodoState }) => {
  const Icon = todo.icon;
  const hasWork = state.status === 'ok' && state.count > 0;
  const failed = state.status === 'error';

  return (
    <Link
      to={todo.to}
      data-testid={`todo-${todo.key}`}
      title={`前往「${todo.destination}」`}
      className={`group flex h-full flex-col rounded-lg border bg-white p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
        hasWork ? TONE_BORDER[todo.tone] : 'border-slate-200'
      }`}
    >
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-slate-600">
        <span className="flex items-center gap-1.5">
          <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          {todo.label}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" aria-hidden />
      </span>

      <span
        data-testid={`todo-${todo.key}-value`}
        className={`mt-2 text-3xl font-bold leading-9 tabular-nums ${
          hasWork ? TONE_TEXT[todo.tone] : failed ? 'text-slate-400' : 'text-slate-800'
        }`}
      >
        {state.status === 'loading' ? (
          <>
            <span className="inline-block h-8 w-12 animate-pulse rounded-md bg-slate-100 align-middle" aria-hidden />
            <span className="sr-only">讀取中</span>
          </>
        ) : state.status === 'error' ? (
          '—'
        ) : (
          state.count
        )}
      </span>

      <span
        className={`mt-1 text-xs ${failed ? 'font-medium text-red-600' : 'text-slate-500'}`}
        title={failed ? state.message : undefined}
      >
        {failed ? '讀取失敗' : todo.hint}
      </span>
    </Link>
  );
};

export default function TodayTodos() {
  const [states, setStates] = useState<Record<TodoKey, TodoState>>(allLoading);
  // 每次載入的編號:重新整理或離開頁面後,舊的回應一律丟掉,不會蓋掉新的結果
  const runId = useRef(0);

  const load = useCallback(() => {
    const id = ++runId.current;
    setStates(allLoading());
    TODOS.forEach((todo) => {
      todo.fetch().then(
        (count) => {
          if (runId.current === id) {
            setStates((prev) => ({ ...prev, [todo.key]: { status: 'ok', count } }));
          }
        },
        (err: unknown) => {
          if (runId.current === id) {
            const message = err instanceof Error && err.message ? err.message : '讀取失敗';
            setStates((prev) => ({ ...prev, [todo.key]: { status: 'error', message } }));
          }
        },
      );
    });
  }, []);

  useEffect(() => {
    load();
    return () => {
      runId.current += 1;
    };
  }, [load]);

  const anyLoading = TODOS.some((todo) => states[todo.key].status === 'loading');

  return (
    <section aria-labelledby="today-todos-heading" className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="today-todos-heading" className="text-base font-semibold text-slate-800">
          今日待辦
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={anyLoading}
          className="text-slate-500 hover:text-slate-800"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${anyLoading ? 'animate-spin' : ''}`} />
          重新整理
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TODOS.map((todo) => (
          <li key={todo.key}>
            <TodoTile todo={todo} state={states[todo.key]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
