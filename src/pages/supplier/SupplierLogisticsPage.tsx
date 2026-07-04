import { useEffect, useState } from 'react';
import { Loader2, Truck, PackageX, Check, Package, MapPin, Clock, StickyNote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TrackingInfo {
  carrier?: string;
  tracking_number?: string;
}

interface Shipment {
  id: string;
  order_id: string | null;
  shipped_at: string | null;
  tracking_info: TrackingInfo | null;
  notes: string | null;
  created_at: string;
}

// 物流狀態步驟
const STEPS = ['待出貨', '已出貨', '運送中', '已送達'] as const;

// 推導目前進度(回傳「已完成到哪一個 index」)
function deriveStep(s: Shipment): number {
  const notes = s.notes ?? '';
  const delivered = notes.includes('送達') || notes.includes('已送達');
  if (delivered) return 3; // 已送達
  if (s.shipped_at) return 2; // demo:已出貨的都視為運送中
  return 0; // 待出貨
}

function last8(id: string | null): string {
  if (!id) return '—';
  return id.length > 8 ? id.slice(-8) : id;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusTimeline({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((label, i) => {
        const completed = i < current;
        const isCurrent = i === current;
        const dotClass = completed
          ? 'bg-emerald-500 border-emerald-500 text-white'
          : isCurrent
            ? 'bg-white border-emerald-500 ring-4 ring-emerald-100 text-emerald-600'
            : 'bg-white border-gray-300 text-gray-300';
        const labelClass = completed || isCurrent ? 'text-emerald-600 font-medium' : 'text-gray-400';
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`h-8 w-8 rounded-full border-2 flex items-center justify-center transition-colors ${dotClass}`}
              >
                {completed ? <Check className="h-4 w-4" /> : <span className="text-xs font-semibold">{i + 1}</span>}
              </div>
              <span className={`mt-2 text-xs whitespace-nowrap ${labelClass}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-6 rounded ${i < current ? 'bg-emerald-500' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SupplierLogisticsPage() {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: acct } = await (supabase as never)
        .from('supplier_accounts')
        .select('supplier_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle() as { data: { supplier_id: string } | null };
      if (acct?.supplier_id) {
        setSupplierId(acct.supplier_id);
        const { data } = (await (supabase as never)
          .from('supplier_shipments')
          .select('id, order_id, shipped_at, tracking_info, notes, created_at')
          .eq('supplier_id', acct.supplier_id)
          .order('created_at', { ascending: false })) as { data: Shipment[] | null };
        setShipments(data ?? []);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Truck className="text-emerald-600" size={22} />
        <h1 className="text-xl font-bold text-gray-900">物流追蹤</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">追蹤每筆出貨的配送進度</p>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>
      ) : !supplierId ? (
        <div className="text-center py-20 text-gray-400">此帳號尚未綁定供應商</div>
      ) : shipments.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <PackageX size={40} className="mx-auto mb-3 opacity-40" />
          <p>暫無出貨</p>
        </div>
      ) : (
        <div className="space-y-5">
          {shipments.map((s) => {
            const step = deriveStep(s);
            const carrier = s.tracking_info?.carrier;
            const trackingNo = s.tracking_info?.tracking_number;
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
                  <div className="flex items-center gap-2">
                    <Package className="text-gray-400" size={18} />
                    <span className="font-semibold text-gray-800">訂單編號</span>
                    <span className="font-mono text-gray-900">#{last8(s.order_id)}</span>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      step === 3
                        ? 'bg-emerald-100 text-emerald-700'
                        : step === 0
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {STEPS[step]}
                  </span>
                </div>

                <div className="px-2 py-2">
                  <StatusTimeline current={step} />
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Truck className="text-gray-400 mt-0.5 shrink-0" size={16} />
                    <div>
                      <p className="text-gray-500">物流商</p>
                      <p className="text-gray-800 font-medium">{carrier || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="text-gray-400 mt-0.5 shrink-0" size={16} />
                    <div>
                      <p className="text-gray-500">追蹤單號</p>
                      <p className="text-gray-800 font-medium font-mono">{trackingNo || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="text-gray-400 mt-0.5 shrink-0" size={16} />
                    <div>
                      <p className="text-gray-500">出貨時間</p>
                      <p className="text-gray-800 font-medium">{fmtDateTime(s.shipped_at)}</p>
                    </div>
                  </div>
                  {s.notes && (
                    <div className="flex items-start gap-2">
                      <StickyNote className="text-gray-400 mt-0.5 shrink-0" size={16} />
                      <div>
                        <p className="text-gray-500">備註</p>
                        <p className="text-gray-800">{s.notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
