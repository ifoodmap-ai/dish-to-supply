import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Inbox, Truck, Boxes, FileText, MapPin, LogOut,
  LayoutDashboard, Radar, Tags, TrendingUp, Users, Star, Menu, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PortalSwitcher from "@/components/PortalSwitcher";
import { useEffect, useState } from "react";

const navItems = [
  { to: "/supplier", label: "營運總覽", icon: LayoutDashboard, end: true },
  { to: "/supplier/leads", label: "商機雷達", icon: Radar, end: false },
  { to: "/supplier/orders", label: "收單紀錄", icon: Inbox, end: false },
  { to: "/supplier/quotes", label: "線上報價", icon: FileText, end: false },
  { to: "/supplier/catalog", label: "商品目錄", icon: Boxes, end: false },
  { to: "/supplier/pricing", label: "定價助手", icon: Tags, end: false },
  { to: "/supplier/forecast", label: "需求預測", icon: TrendingUp, end: false },
  { to: "/supplier/customers", label: "客戶管理", icon: Users, end: false },
  { to: "/supplier/logistics", label: "物流追蹤", icon: MapPin, end: false },
  { to: "/supplier/shipments", label: "出貨紀錄", icon: Truck, end: false },
  { to: "/supplier/reviews", label: "我的評價", icon: Star, end: false },
];

export default function SupplierLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? "");
    });
  }, []);

  // 換頁就把抽屜收起來 —— 不然點完選單還留在畫面上擋住內容
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const currentLabel =
    navItems.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))
      ?.label ?? "供應商入口";

  const Sidebar = () => (
    <div className="flex flex-col h-full w-60 bg-white border-r border-gray-200">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏭</span>
          <span className="font-bold text-emerald-700 text-sm">供應商入口</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Supplier Portal</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`
            }
          >
            <Icon size={16} className="shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-100 space-y-2">
        <PortalSwitcher current="supplier" tone="light" />
        <p className="text-xs text-gray-400 truncate">{email}</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-500 transition-colors"
        >
          <LogOut size={13} />
          登出
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* 桌機:固定側邊欄 */}
      <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-60">
        <Sidebar />
      </div>

      {/* 手機:點遮罩關抽屜 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 手機:滑出式抽屜。原本是 flex-shrink-0 的 w-60 aside,
          在 390px 螢幕上會把內容擠到只剩 150px —— 金額直接被切掉、
          標籤一個字一行,等於不能用。 */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex flex-col md:hidden transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar />
      </div>

      <div className="flex flex-col flex-1 min-w-0 md:pl-60">
        {/* 手機頂欄 */}
        <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="font-semibold text-gray-800 truncate">{currentLabel}</span>
        </header>

        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
