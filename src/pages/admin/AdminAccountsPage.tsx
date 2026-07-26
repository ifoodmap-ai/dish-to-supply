import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Search, KeyRound, Store, Truck, ShieldX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * restaurant_accounts / supplier_accounts 尚未進 types.ts,
 * 沿用專案既有的窄型別轉換慣例(只描述用得到的 chain)。
 */
type Result<T> = Promise<{ data: T[] | null; error: { message?: string } | null }>;

interface SelectChain<T> extends Result<T> {
  eq: (column: string, value: unknown) => SelectChain<T>;
  order: (column: string, opts?: { ascending?: boolean }) => SelectChain<T>;
}

interface UpdateChain {
  eq: (column: string, value: unknown) => Promise<{ error: { message?: string } | null }>;
}

interface Db {
  from: (table: string) => {
    select: <T>(columns: string) => SelectChain<T>;
    update: (values: Record<string, unknown>) => UpdateChain;
  };
}

const db = supabase as never as Db;

interface RestaurantAccountRow {
  id: string;
  user_id: string;
  restaurant_id: string | null;
  branch_id: string | null;
  role: string | null;
  is_active: boolean;
  created_at: string;
}

interface SupplierAccountRow {
  id: string;
  user_id: string;
  supplier_id: string | null;
  role?: string | null;
  is_active: boolean;
  created_at: string;
}

interface NamedRow {
  id: string;
  name: string;
}

type AccountKind = 'restaurant' | 'supplier';

interface AccountItem {
  key: string;
  id: string;
  table: 'restaurant_accounts' | 'supplier_accounts';
  kind: AccountKind;
  user_id: string;
  orgName: string | null;
  branchName: string | null;
  role: string | null;
  is_active: boolean;
  created_at: string;
}

const KIND_META: Record<AccountKind, { label: string; className: string; icon: typeof Store }> = {
  restaurant: {
    label: '餐廳',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: Store,
  },
  supplier: {
    label: '供應商',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: Truck,
  },
};

const ACCOUNT_ROLE_LABEL: Record<string, string> = {
  owner: '老闆',
  manager: '店長',
  purchaser: '採購員',
  admin: '管理者',
  staff: '成員',
  sales: '業務',
};

const roleText = (kind: AccountKind, role: string | null): string => {
  if (role) return ACCOUNT_ROLE_LABEL[role] ?? role;
  return kind === 'supplier' ? '供應商成員' : '成員';
};

const tabs: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'restaurant', label: '餐廳端' },
  { value: 'supplier', label: '供應商端' },
  { value: 'disabled', label: '已停用' },
];

const AdminAccountsPage = () => {
  const [items, setItems] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [raRes, saRes, restRes, branchRes, supRes] = await Promise.all([
      db
        .from('restaurant_accounts')
        .select<RestaurantAccountRow>(
          'id, user_id, restaurant_id, branch_id, role, is_active, created_at',
        )
        .order('created_at', { ascending: false }),
      db
        .from('supplier_accounts')
        .select<SupplierAccountRow>('*')
        .order('created_at', { ascending: false }),
      db.from('restaurants').select<NamedRow>('id, name'),
      db.from('restaurant_branches').select<NamedRow>('id, name'),
      db.from('suppliers').select<NamedRow>('id, name'),
    ]);

    if (raRes.error) toast.error('載入餐廳帳號失敗', { description: raRes.error.message });
    if (saRes.error) toast.error('載入供應商帳號失敗', { description: saRes.error.message });

    const nameMap = (rows: NamedRow[] | null) => {
      const m: Record<string, string> = {};
      (rows ?? []).forEach((r) => {
        m[r.id] = r.name;
      });
      return m;
    };
    const restaurantNames = nameMap(restRes.data);
    const branchNames = nameMap(branchRes.data);
    const supplierNames = nameMap(supRes.data);

    const merged: AccountItem[] = [
      ...(raRes.data ?? []).map((r) => ({
        key: `restaurant:${r.id}`,
        id: r.id,
        table: 'restaurant_accounts' as const,
        kind: 'restaurant' as const,
        user_id: r.user_id,
        orgName: r.restaurant_id ? restaurantNames[r.restaurant_id] ?? null : null,
        branchName: r.branch_id ? branchNames[r.branch_id] ?? null : null,
        role: r.role ?? null,
        is_active: r.is_active,
        created_at: r.created_at,
      })),
      ...(saRes.data ?? []).map((s) => ({
        key: `supplier:${s.id}`,
        id: s.id,
        table: 'supplier_accounts' as const,
        kind: 'supplier' as const,
        user_id: s.user_id,
        orgName: s.supplier_id ? supplierNames[s.supplier_id] ?? null : null,
        branchName: null,
        role: s.role ?? null,
        is_active: s.is_active,
        created_at: s.created_at,
      })),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    setItems(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const derived = useMemo(() => {
    const restaurant = items.filter((i) => i.kind === 'restaurant').length;
    const supplier = items.filter((i) => i.kind === 'supplier').length;
    const disabled = items.filter((i) => !i.is_active).length;
    return { total: items.length, restaurant, supplier, disabled };
  }, [items]);

  /**
   * 身分衝突:同一個 user_id 同時掛在餐廳端與供應商端。
   * demo 期間為了方便來回看三端會刻意這樣設,但正式營運要清掉 ——
   * 一個人既是買方又是賣方,後台的權限邊界就失去意義。
   */
  const conflicts = useMemo(() => {
    const byUser = new Map<string, AccountItem[]>();
    for (const i of items) {
      if (!i.is_active) continue;
      byUser.set(i.user_id, [...(byUser.get(i.user_id) ?? []), i]);
    }
    return [...byUser.entries()]
      .filter(([, list]) => new Set(list.map((x) => x.kind)).size > 1)
      .map(([user_id, list]) => ({ user_id, list }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (activeTab === 'disabled') {
        if (i.is_active) return false;
      } else if (activeTab !== 'all' && i.kind !== activeTab) {
        return false;
      }
      if (!q) return true;
      const text = `${i.user_id} ${i.orgName ?? ''} ${i.branchName ?? ''} ${roleText(i.kind, i.role)}`;
      return text.toLowerCase().includes(q);
    });
  }, [items, search, activeTab]);

  const toggleActive = async (item: AccountItem) => {
    const next = !item.is_active;
    setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, is_active: next } : x)));
    const { error } = await db.from(item.table).update({ is_active: next }).eq('id', item.id);
    if (error) {
      setItems((prev) =>
        prev.map((x) => (x.key === item.key ? { ...x, is_active: item.is_active } : x)),
      );
      toast.error('更新失敗', { description: error.message });
      return;
    }
    toast.success(next ? '已啟用此帳號' : '已停用此帳號');
  };

  const kpis = [
    { title: '總帳號數', value: derived.total, icon: Users, accent: 'text-slate-700', bg: 'bg-slate-100' },
    { title: '餐廳端帳號', value: derived.restaurant, icon: Store, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: '供應商端帳號', value: derived.supplier, icon: Truck, accent: 'text-blue-600', bg: 'bg-blue-50' },
    { title: '已停用', value: derived.disabled, icon: ShieldX, accent: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">帳號與權限 (Accounts)</h1>
      <p className="text-sm text-slate-500 mb-6">
        餐廳端與供應商端所有登入帳號的綁定關係與啟用狀態
      </p>

      {/* 身分衝突警示 */}
      {conflicts.length > 0 && (
        <Card className="border border-amber-300 bg-amber-50 mb-6">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <ShieldX className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-amber-900">
                  {conflicts.length} 個帳號同時持有多種身分
                </p>
                <p className="text-sm text-amber-800 mt-0.5">
                  同一個人既是買方又是賣方,後台的權限邊界會失去意義。
                  Demo 期間為了來回檢視三端可以這樣設,<strong>正式營運前請清理</strong>。
                </p>
                <ul className="mt-3 space-y-1.5">
                  {conflicts.map(({ user_id, list }) => (
                    <li key={user_id} className="text-sm text-amber-900 flex flex-wrap items-center gap-2">
                      <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">
                        {user_id.slice(0, 8)}
                      </code>
                      {list.map((i) => (
                        <span
                          key={i.key}
                          className="inline-flex items-center gap-1 text-xs bg-white border border-amber-200 rounded px-2 py-0.5"
                        >
                          {KIND_META[i.kind].label}
                          {i.orgName ? ` · ${i.orgName}` : ''}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {kpis.map(({ title, value, icon: Icon, accent, bg }) => (
          <Card key={title} className="border border-slate-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              <div className={`text-2xl font-bold ${accent}`}>{loading ? '—' : value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 說明卡片 */}
      <Card className="border-amber-200 bg-amber-50 mb-6">
        <CardContent className="p-4 flex gap-3">
          <div className="inline-flex p-1.5 rounded-lg bg-amber-100 h-fit">
            <KeyRound className="h-4 w-4 text-amber-700" />
          </div>
          <div className="text-sm text-amber-900">
            <p className="font-medium mb-1">帳號建立與密碼重設不在這裡</p>
            <p className="text-amber-800/90 leading-relaxed">
              新增帳號請走「入駐審核」核准流程(核准後會自動建立供應商帳號並產生臨時密碼);
              密碼重設、刪除使用者請至 Supabase 後台的 Authentication 操作。
              這一頁只負責檢視綁定關係與停用／啟用權限。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 篩選 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {tabs.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:ml-auto sm:max-w-xs w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜尋 user_id / 單位 / 角色…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="rounded-md border border-slate-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-slate-600">使用者</TableHead>
              <TableHead className="text-slate-600">身分</TableHead>
              <TableHead className="text-slate-600">所屬單位</TableHead>
              <TableHead className="text-slate-600">角色</TableHead>
              <TableHead className="text-slate-600 text-center">啟用</TableHead>
              <TableHead className="text-slate-600">建立日</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                  {items.length === 0
                    ? '尚無任何綁定帳號，核准入駐或建立餐廳成員後會出現在這裡'
                    : '沒有符合條件的帳號'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((i) => {
                const meta = KIND_META[i.kind];
                const KindIcon = meta.icon;
                return (
                  <TableRow key={i.key} className="hover:bg-slate-50">
                    <TableCell className="align-top">
                      <span
                        className="font-mono text-sm text-slate-700"
                        title={i.user_id}
                      >
                        {i.user_id ? i.user_id.slice(0, 8) : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline" className={`${meta.className} gap-1 font-normal`}>
                        <KindIcon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="text-sm text-slate-800">
                        {i.orgName ?? <span className="text-slate-400 italic">未綁定</span>}
                      </div>
                      {i.branchName ? (
                        <div className="text-xs text-slate-400 mt-0.5">分店:{i.branchName}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-600 whitespace-nowrap">
                      {roleText(i.kind, i.role)}
                    </TableCell>
                    <TableCell className="align-top text-center">
                      <Switch checked={i.is_active} onCheckedChange={() => toggleActive(i)} />
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-500 whitespace-nowrap">
                      {i.created_at ? new Date(i.created_at).toLocaleDateString('zh-TW') : '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        停用後該使用者仍可登入，但會失去對應餐廳／供應商的資料存取權(RLS 只認 is_active 的綁定)。
      </p>
    </div>
  );
};

export default AdminAccountsPage;
