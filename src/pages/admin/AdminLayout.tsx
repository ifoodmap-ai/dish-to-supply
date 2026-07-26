import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Package, Map, Sparkles, TrendingUp, CreditCard,
  Bell, UserPlus, LogOut, Menu, X,
  Store, UtensilsCrossed, KeyRound, Carrot, Network, Shuffle, DollarSign,
  KanbanSquare, Target, Bot, AlertTriangle, Wallet, LineChart, Megaphone,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import PortalSwitcher from '@/components/PortalSwitcher';

const navGroups: { group: string; items: { label: string; icon: typeof LayoutDashboard; to: string }[] }[] = [
  {
    group: '營運',
    items: [
      { label: '儀表板', icon: LayoutDashboard, to: '/admin' },
      { label: '交易全流程看板', icon: KanbanSquare, to: '/admin/pipeline' },
      { label: '分析紀錄', icon: ClipboardList, to: '/admin/analyses' },
      { label: '供應商訂單', icon: Package, to: '/admin/orders' },
      { label: '智慧媒合', icon: Sparkles, to: '/admin/matching' },
      { label: '需求預測', icon: TrendingUp, to: '/admin/forecast' },
    ],
  },
  {
    group: '會員',
    items: [
      { label: '餐廳管理', icon: UtensilsCrossed, to: '/admin/restaurants' },
      { label: '供應商管理', icon: Store, to: '/admin/suppliers' },
      { label: '入駐申請', icon: UserPlus, to: '/admin/applications' },
      { label: '帳號與權限', icon: KeyRound, to: '/admin/accounts' },
    ],
  },
  {
    group: '資料維護',
    items: [
      { label: '食材主檔', icon: Carrot, to: '/admin/ingredients' },
      { label: '菜色↔食材對應', icon: Network, to: '/admin/dishes' },
      { label: '替代食材關係', icon: Shuffle, to: '/admin/substitutes' },
      { label: '價格資料維護', icon: DollarSign, to: '/admin/prices' },
    ],
  },
  {
    group: '品質與財務',
    items: [
      { label: '媒合品質監控', icon: Target, to: '/admin/match-quality' },
      { label: 'AI 用量與品質', icon: Bot, to: '/admin/ai-ops' },
      { label: '履約與爭議', icon: AlertTriangle, to: '/admin/disputes' },
      { label: '營收與抽成', icon: Wallet, to: '/admin/revenue' },
      { label: '金流／發票', icon: CreditCard, to: '/admin/billing' },
    ],
  },
  {
    group: '成長',
    items: [
      { label: '成長儀表板', icon: LineChart, to: '/admin/growth' },
      { label: '推播與活動', icon: Megaphone, to: '/admin/campaigns' },
      { label: '通知中心', icon: Bell, to: '/admin/notifications' },
      { label: '發展藍圖', icon: Map, to: '/admin/roadmap' },
    ],
  },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full w-64 bg-slate-900 text-white">
      <div className="px-6 py-5 border-b border-slate-700">
        <span className="text-lg font-semibold tracking-tight">ifoodmap Admin</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {navGroups.map(({ group, items }) => (
          <div key={group}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {group}
            </p>
            <div className="space-y-0.5">
              {items.map(({ label, icon: Icon, to }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/admin'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-slate-700 space-y-2">
        <PortalSwitcher current="admin" tone="dark" />
        {userEmail && (
          <p className="text-xs text-slate-400 truncate px-1">{userEmail}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4 mr-2" />
          登出 (Logout)
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64">
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex flex-col md:hidden transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 md:pl-64">
        {/* Mobile topbar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="font-semibold text-slate-800">ifoodmap Admin</span>
        </div>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
