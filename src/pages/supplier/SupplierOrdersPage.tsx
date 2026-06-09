import { useEffect, useState } from "react";
import { Loader2, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Order {
  id: string;
  ingredient_list: { name: string; quantity?: string; unit?: string }[];
  status: string;
  sent_at: string;
  notes: string | null;
}

const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待確認" },
  { key: "shipped", label: "已出貨" },
  { key: "delivered", label: "已送達" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    shipped: "bg-green-100 text-green-800",
    delivered: "bg-teal-100 text-teal-800",
  };
  const labels: Record<string, string> = { pending: "待確認", confirmed: "已確認", shipped: "已出貨", delivered: "已送達" };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${map[s] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[s] ?? s}
    </span>
  );
};

export default function SupplierOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [shipping, setShipping] = useState<string | null>(null);
  const { toast } = useToast();

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
      if (acct) setSupplierId(acct.supplier_id);
    })();
  }, []);

  useEffect(() => {
    if (!supplierId) return;
    fetchOrders();
  }, [supplierId, activeTab]);

  const fetchOrders = async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("supplier_orders")
      .select("id, ingredient_list, status, sent_at, notes")
      .eq("supplier_id", supplierId)
      .order("sent_at", { ascending: false });
    if (activeTab !== "all") q = q.eq("status", activeTab);
    const { data } = await q;
    setOrders(data ?? []);
    setLoading(false);
  };

  const confirmShipment = async (order: Order) => {
    setShipping(order.id);
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await (supabase as any).from("supplier_shipments").insert({
      order_id: order.id,
      supplier_id: supplierId,
      confirmed_by: session?.user.id,
      notes: null,
    });
    if (!error) {
      await (supabase as any).from("supplier_orders").update({ status: "shipped" }).eq("id", order.id);
      toast({ title: "已確認出貨", description: `訂單 ${order.id.slice(0, 8)}... 已標記為出貨。` });
      fetchOrders();
    } else {
      toast({ title: "操作失敗", description: error.message, variant: "destructive" });
    }
    setShipping(null);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">收單紀錄</h1>
      <p className="text-sm text-gray-500 mb-6">所有來自 ifoodmap 的採購訂單</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-emerald-500" size={28} />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <PackageCheck size={40} className="mx-auto mb-3 opacity-40" />
          <p>暫無訂單</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const ingredients: { name: string; quantity?: string; unit?: string }[] =
              Array.isArray(order.ingredient_list) ? order.ingredient_list : [];
            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {statusBadge(order.status)}
                      <span className="text-xs text-gray-400">
                        {new Date(order.sent_at).toLocaleString("zh-TW")}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">訂單 #{order.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  {order.status === "pending" && (
                    <button
                      onClick={() => confirmShipment(order)}
                      disabled={shipping === order.id}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {shipping === order.id ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                      確認出貨
                    </button>
                  )}
                </div>
                {ingredients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ingredients.map((ing, i) => (
                      <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                        {ing.name}{ing.quantity ? ` · ${ing.quantity}${ing.unit ?? ""}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {order.notes && <p className="mt-3 text-xs text-gray-500">{order.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
