import { useEffect, useState } from "react";
import { Loader2, PackageX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Shipment {
  id: string;
  order_id: string;
  shipped_at: string;
  notes: string | null;
  tracking_info: Record<string, string> | null;
}

export default function SupplierShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: acct } = await (supabase as any)
        .from("supplier_accounts")
        .select("supplier_id")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!acct) { setLoading(false); return; }

      const { data } = await (supabase as any)
        .from("supplier_shipments")
        .select("id, order_id, shipped_at, notes, tracking_info")
        .eq("supplier_id", acct.supplier_id)
        .order("shipped_at", { ascending: false });
      setShipments(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">出貨紀錄</h1>
      <p className="text-sm text-gray-500 mb-6">所有已確認出貨的歷史紀錄</p>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-emerald-500" size={28} />
        </div>
      ) : shipments.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <PackageX size={40} className="mx-auto mb-3 opacity-40" />
          <p>暫無出貨紀錄</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">出貨時間</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">訂單編號</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">追蹤資訊</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">備註</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-700">
                    {new Date(s.shipped_at).toLocaleString("zh-TW")}
                  </td>
                  <td className="px-5 py-3 font-mono text-gray-500 text-xs">
                    #{s.order_id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {s.tracking_info && Object.keys(s.tracking_info).length > 0
                      ? Object.entries(s.tracking_info).map(([k, v]) => `${k}: ${v}`).join(" · ")
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{s.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
