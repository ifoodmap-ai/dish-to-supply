import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, UtensilsCrossed, ShoppingCart, PackageCheck,
  TrendingDown, Store, FlaskConical, Users, Settings, LogOut, Menu, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRestaurant, canSeeCost } from "@/components/RestaurantRoute";

const navItems = [
  { label: "營運總覽", icon: LayoutDashboard, to: "/restaurant", end: true },
  { label: "我的菜單", icon: UtensilsCrossed, to: "/restaurant/menu", costOnly: true },
  { label: "智慧採購", icon: ShoppingCart, to: "/restaurant/purchase" },
  { label: "訂單與收貨", icon: PackageCheck, to: "/restaurant/orders" },
  { label: "成本與省錢", icon: TrendingDown, to: "/restaurant/costs", costOnly: true },
  { label: "我的供應商", icon: Store, to: "/restaurant/suppliers" },
  { label: "菜色實驗室", icon: FlaskConical, to: "/restaurant/lab", costOnly: true },
  { label: "分店與成員", icon: Users, to: "/restaurant/team" },
  { label: "店家設定", icon: Settings, to: "/restaurant/settings" },
];

const ROLE_LABEL: Record<string, string> = {
  owner: "老闆",
  manager: "店長",
  purchaser: "採購員",
};

const RestaurantLayout = () => {
  const navigate = useNavigate();
  const account = useRestaurant();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 採購員看不到成本相關頁面
  const items = navItems.filter((i) => !i.costOnly || canSeeCost(account.role));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full w-64 bg-emerald-950 text-white">
      <div className="px-6 py-5 border-b border-emerald-800">
        <span className="text-lg font-semibold tracking-tight block truncate">
          {account.restaurant_name}
        </span>
        <span className="text-xs text-emerald-300">
          {ROLE_LABEL[account.role] ?? account.role} · 餐廳後台
        </span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map(({ label, icon: Icon, to, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-800 text-white"
                  : "text-emerald-100 hover:bg-emerald-900 hover:text-white"
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-emerald-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start text-emerald-100 hover:text-white hover:bg-emerald-900"
        >
          <LogOut className="h-4 w-4 mr-2" />
          登出
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 md:pl-64 w-full">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-emerald-950 text-white">
          <span className="font-semibold truncate">{account.restaurant_name}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((v) => !v)}
            className="text-white hover:bg-emerald-900"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>
        <main className="p-4 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default RestaurantLayout;
