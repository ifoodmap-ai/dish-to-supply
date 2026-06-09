import { useEffect, useState } from 'react';
import { ClipboardList, CheckCircle, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface Stats {
  pendingCount: number;
  sentCount: number;
  ordersCount: number;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats>({ pendingCount: 0, sentCount: 0, ordersCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [pendingRes, sentRes, ordersRes] = await Promise.all([
        (supabase as never)
          .from('analysis_records')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_review'),
        (supabase as never)
          .from('analysis_records')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'sent'),
        (supabase as never)
          .from('supplier_orders')
          .select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        pendingCount: (pendingRes as { count: number | null }).count ?? 0,
        sentCount: (sentRes as { count: number | null }).count ?? 0,
        ordersCount: (ordersRes as { count: number | null }).count ?? 0,
      });
      setLoading(false);
    };

    fetchStats();
  }, []);

  const cards = [
    {
      title: '待審核 (Pending Review)',
      value: stats.pendingCount,
      icon: ClipboardList,
      accent: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
    },
    {
      title: '已發送 (Sent)',
      value: stats.sentCount,
      icon: CheckCircle,
      accent: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    {
      title: '總訂單 (Total Orders)',
      value: stats.ordersCount,
      icon: Package,
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">儀表板 (Dashboard)</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {cards.map(({ title, value, icon: Icon, accent, bg, border }) => (
          <Card key={title} className={`border ${border}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={`h-5 w-5 ${accent}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${accent}`}>
                {loading ? '—' : value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
