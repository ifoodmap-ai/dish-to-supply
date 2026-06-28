import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface Ingredient {
  name?: string;
  quantity?: string;
  unit?: string;
  category?: string;
}

interface OrderRow {
  id: string;
  created_at: string;
  status: string;
  sent_at: string | null;
  supplier_id: string | null;
  ingredient_list: Ingredient[] | null;
}

const statusBadgeClass: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  sent: 'bg-blue-100 text-blue-800 border-blue-300',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  shipped: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
};

const statusLabel: Record<string, string> = {
  pending: '待處理',
  sent: '已發送',
  accepted: '已接受',
  shipped: '已出貨',
  completed: '已完成',
  rejected: '已拒絕',
};

const tabs: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待處理' },
  { value: 'accepted', label: '已接受' },
  { value: 'rejected', label: '已拒絕' },
];

const AdminOrdersPage = () => {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      let query = (supabase as never)
        .from('supplier_orders')
        .select('id, created_at, status, sent_at, supplier_id, ingredient_list')
        .order('created_at', { ascending: false });

      if (activeTab !== 'all') {
        query = (query as { eq: (col: string, val: string) => unknown }).eq('status', activeTab);
      }

      const { data } = await (query as Promise<{ data: OrderRow[] | null }>);
      setOrders((data as OrderRow[] | null) ?? []);

      const { data: sup } = (await (supabase as never)
        .from('suppliers')
        .select('id, name')) as { data: { id: string; name: string }[] | null };
      const map: Record<string, string> = {};
      (sup ?? []).forEach((s) => {
        map[s.id] = s.name;
      });
      setSupplierMap(map);

      setLoading(false);
    };

    fetchData();
  }, [activeTab]);

  const ingredientPreview = (list: Ingredient[] | null) => {
    if (!list || list.length === 0) return <span className="text-slate-400 italic">—</span>;
    const names = list.map((i) => i.name).filter(Boolean) as string[];
    const head = names.slice(0, 3).join('、');
    return `${head}${names.length > 3 ? ` …(共 ${names.length} 項)` : ''}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">供應商訂單 (Orders)</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList>
          {tabs.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-slate-600">建立時間</TableHead>
              <TableHead className="text-slate-600">供應商</TableHead>
              <TableHead className="text-slate-600">食材清單</TableHead>
              <TableHead className="text-slate-600">狀態</TableHead>
              <TableHead className="text-slate-600">發送時間</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                  沒有訂單 (No orders found)
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                    {new Date(o.created_at).toLocaleString('zh-TW')}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {(o.supplier_id && supplierMap[o.supplier_id]) || (
                      <span className="text-slate-400 italic">未指定</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-xs">
                    {ingredientPreview(o.ingredient_list)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        statusBadgeClass[o.status] ?? 'bg-slate-100 text-slate-700 border-slate-300'
                      }
                    >
                      {statusLabel[o.status] ?? o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                    {o.sent_at ? new Date(o.sent_at).toLocaleString('zh-TW') : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminOrdersPage;
