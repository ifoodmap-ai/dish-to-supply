import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

type AnalysisStatus = 'pending_review' | 'approved' | 'rejected' | 'sent';
type TabValue = 'all' | AnalysisStatus;

interface AnalysisRecord {
  id: string;
  created_at: string;
  source_type: string;
  summary: string | null;
  status: AnalysisStatus;
}

const statusBadgeClass: Record<AnalysisStatus, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  approved: 'bg-blue-100 text-blue-800 border-blue-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
  sent: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const statusLabel: Record<AnalysisStatus, string> = {
  pending_review: '待審核',
  approved: '已批准',
  rejected: '已拒絕',
  sent: '已發送',
};

const tabs: { value: TabValue; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending_review', label: '待審核' },
  { value: 'sent', label: '已發送' },
  { value: 'rejected', label: '已拒絕' },
];

const AnalysisListPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);

      let query = (supabase as never)
        .from('analysis_records')
        .select('id, created_at, source_type, summary, status')
        .order('created_at', { ascending: false });

      if (activeTab !== 'all') {
        query = (query as { eq: (col: string, val: string) => unknown }).eq('status', activeTab);
      }

      const { data } = await (query as Promise<{ data: AnalysisRecord[] | null }>);
      setRecords((data as AnalysisRecord[] | null) ?? []);
      setLoading(false);
    };

    fetchRecords();
  }, [activeTab]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">分析紀錄 (Analyses)</h1>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="mb-4">
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
              <TableHead className="text-slate-600">來源</TableHead>
              <TableHead className="text-slate-600">摘要</TableHead>
              <TableHead className="text-slate-600">狀態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-slate-400">
                  沒有紀錄 (No records found)
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow
                  key={record.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => navigate(`/admin/analyses/${record.id}`)}
                >
                  <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                    {new Date(record.created_at).toLocaleString('zh-TW')}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{record.source_type}</TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-xs">
                    {record.summary
                      ? record.summary.length > 60
                        ? record.summary.slice(0, 60) + '…'
                        : record.summary
                      : <span className="text-slate-400 italic">無摘要</span>}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusBadgeClass[record.status]}
                    >
                      {statusLabel[record.status]}
                    </Badge>
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

export default AnalysisListPage;
