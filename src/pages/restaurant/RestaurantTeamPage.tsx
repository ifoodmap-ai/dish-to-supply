import { useEffect, useState } from "react";
import {
  Store,
  Users,
  Plus,
  Pencil,
  Lock,
  Clock,
  MapPin,
  UserX,
  UserCheck,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant, canSeeCost, type RestaurantRole } from "@/components/RestaurantRoute";

interface BranchRow {
  id: string;
  restaurant_id: string;
  name: string | null;
  address: string | null;
  receiving_hours: string | null;
  is_active: boolean | null;
  created_at: string;
}

interface MemberRow {
  id: string;
  user_id: string;
  restaurant_id: string;
  branch_id: string | null;
  role: RestaurantRole;
  is_active: boolean | null;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
}

interface BranchForm {
  id: string | null;
  name: string;
  address: string;
  receiving_hours: string;
  is_active: boolean;
}

const emptyBranch: BranchForm = {
  id: null,
  name: "",
  address: "",
  receiving_hours: "",
  is_active: true,
};

const ROLE_OPTIONS: { value: RestaurantRole; label: string; hint: string }[] = [
  { value: "owner", label: "老闆", hint: "所有權限,可管理成員與分店" },
  { value: "manager", label: "店長", hint: "可看成本、管理分店與採購" },
  { value: "purchaser", label: "採購員", hint: "只能下單收貨,看不到成本" },
];

const ROLE_LABEL: Record<RestaurantRole, string> = {
  owner: "老闆",
  manager: "店長",
  purchaser: "採購員",
};

const ROLE_CLASS: Record<RestaurantRole, string> = {
  owner: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manager: "bg-blue-50 text-blue-700 border-blue-200",
  purchaser: "bg-slate-100 text-slate-600 border-slate-300",
};

/** 查不到 profile 時的顯示名稱 */
const shortId = (userId: string) => `${userId.slice(0, 8)}…`;

const RestaurantTeamPage = () => {
  const account = useRestaurant();
  const isOwner = account.role === "owner";
  // 分店由老闆 / 店長維護;成員只有老闆能動
  const canEditBranch = canSeeCost(account.role);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);

  const [branchForm, setBranchForm] = useState<BranchForm>(emptyBranch);
  const [branchOpen, setBranchOpen] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<MemberRow | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  const fetchBranches = async (): Promise<BranchRow[] | null> => {
    const { data, error } = (await (supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            v: string,
          ) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => Promise<{ data: BranchRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    })
      .from("restaurant_branches")
      .select("*")
      .eq("restaurant_id", account.restaurant_id)
      .order("created_at", { ascending: true })) as {
      data: BranchRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      toast.error("載入分店失敗", { description: error.message });
      return null;
    }
    return data ?? [];
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setMyUserId(session?.user.id ?? null);
        setMyEmail(session?.user.email ?? null);
      }

      const branchRows = await fetchBranches();
      if (cancelled) return;
      if (branchRows) setBranches(branchRows);

      const { data: memberRows, error: memberErr } = (await (supabase as never as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              col: string,
              v: string,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => Promise<{ data: MemberRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      })
        .from("restaurant_accounts")
        .select("id, user_id, restaurant_id, branch_id, role, is_active, created_at")
        .eq("restaurant_id", account.restaurant_id)
        .order("created_at", { ascending: true })) as {
        data: MemberRow[] | null;
        error: { message: string } | null;
      };

      if (cancelled) return;

      if (memberErr) {
        setLoadError(memberErr.message);
        toast.error("載入成員失敗", { description: memberErr.message });
        setLoading(false);
        return;
      }

      const list = memberRows ?? [];
      setMembers(list);

      const ids = [...new Set(list.map((m) => m.user_id).filter(Boolean))];
      if (ids.length > 0) {
        const { data: profileRows } = (await (supabase as never as {
          from: (t: string) => {
            select: (c: string) => {
              in: (
                col: string,
                v: string[],
              ) => Promise<{ data: ProfileRow[] | null; error: { message: string } | null }>;
            };
          };
        })
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", ids)) as {
          data: ProfileRow[] | null;
          error: { message: string } | null;
        };

        if (cancelled) return;
        const map: Record<string, string> = {};
        (profileRows ?? []).forEach((p) => {
          if (p.display_name?.trim()) map[p.user_id] = p.display_name.trim();
        });
        setProfiles(map);
      }

      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.restaurant_id]);

  /* ---------------- 分店 ---------------- */

  const openCreateBranch = () => {
    setBranchForm(emptyBranch);
    setBranchOpen(true);
  };

  const openEditBranch = (b: BranchRow) => {
    setBranchForm({
      id: b.id,
      name: b.name ?? "",
      address: b.address ?? "",
      receiving_hours: b.receiving_hours ?? "",
      is_active: b.is_active ?? true,
    });
    setBranchOpen(true);
  };

  const handleSaveBranch = async () => {
    if (!canEditBranch) return;
    if (!branchForm.name.trim()) {
      toast.error("請填寫分店名稱");
      return;
    }

    setSavingBranch(true);
    const payload = {
      name: branchForm.name.trim(),
      address: branchForm.address.trim() || null,
      receiving_hours: branchForm.receiving_hours.trim() || null,
      is_active: branchForm.is_active,
    };

    const { error } = branchForm.id
      ? ((await (supabase as never as {
          from: (t: string) => {
            update: (v: unknown) => {
              eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
            };
          };
        })
          .from("restaurant_branches")
          .update(payload)
          .eq("id", branchForm.id)) as { error: { message: string } | null })
      : ((await (supabase as never as {
          from: (t: string) => {
            insert: (v: unknown) => Promise<{ error: { message: string } | null }>;
          };
        })
          .from("restaurant_branches")
          .insert({ ...payload, restaurant_id: account.restaurant_id })) as {
          error: { message: string } | null;
        });

    setSavingBranch(false);

    if (error) {
      toast.error("儲存失敗", { description: error.message });
      return;
    }

    setBranchOpen(false);
    toast.success(branchForm.id ? "已更新分店" : "已新增分店");
    const rows = await fetchBranches();
    if (rows) setBranches(rows);
  };

  /* ---------------- 成員 ---------------- */

  const handleChangeRole = async (m: MemberRow, role: RestaurantRole) => {
    if (!isOwner || role === m.role) return;

    // 不能把自己降級,避免整家店沒有老闆
    if (m.user_id === myUserId) {
      toast.error("不能變更自己的角色", { description: "請由其他老闆帳號操作。" });
      return;
    }
    // 至少要留一位啟用中的老闆
    const activeOwners = members.filter((x) => x.role === "owner" && x.is_active !== false);
    if (m.role === "owner" && activeOwners.length <= 1) {
      toast.error("至少要保留一位老闆");
      return;
    }

    setBusyMemberId(m.id);
    const prev = m.role;
    setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, role } : x)));

    const { error } = (await (supabase as never as {
      from: (t: string) => {
        update: (v: unknown) => {
          eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("restaurant_accounts")
      .update({ role })
      .eq("id", m.id)) as { error: { message: string } | null };

    setBusyMemberId(null);

    if (error) {
      setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, role: prev } : x)));
      toast.error("角色更新失敗", { description: error.message });
      return;
    }
    toast.success(`已將角色改為${ROLE_LABEL[role]}`);
  };

  const handleToggleActive = async () => {
    const m = toggleTarget;
    setToggleTarget(null);
    if (!m || !isOwner) return;

    const next = !(m.is_active ?? true);

    if (!next) {
      if (m.user_id === myUserId) {
        toast.error("不能停用自己的帳號");
        return;
      }
      const activeOwners = members.filter((x) => x.role === "owner" && x.is_active !== false);
      if (m.role === "owner" && activeOwners.length <= 1) {
        toast.error("至少要保留一位啟用中的老闆");
        return;
      }
    }

    setBusyMemberId(m.id);
    setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, is_active: next } : x)));

    const { error } = (await (supabase as never as {
      from: (t: string) => {
        update: (v: unknown) => {
          eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("restaurant_accounts")
      .update({ is_active: next })
      .eq("id", m.id)) as { error: { message: string } | null };

    setBusyMemberId(null);

    if (error) {
      setMembers((list) =>
        list.map((x) => (x.id === m.id ? { ...x, is_active: !next } : x)),
      );
      toast.error("更新失敗", { description: error.message });
      return;
    }
    toast.success(next ? "已重新啟用成員" : "已停用成員");
  };

  const memberName = (m: MemberRow) => {
    if (profiles[m.user_id]) return profiles[m.user_id];
    if (m.user_id === myUserId && myEmail) return myEmail;
    return shortId(m.user_id);
  };

  const branchName = (id: string | null) =>
    id ? (branches.find((b) => b.id === id)?.name ?? "已移除的分店") : "全店";

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">分店與成員</h1>
        <p className="text-sm text-slate-500 mt-1">
          管理 {account.restaurant_name} 的收貨據點與後台使用者
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          載入失敗:{loadError}
        </div>
      )}

      {/* ── 分店管理 ── */}
      <Card className="border-slate-200 mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base text-slate-700 flex items-center gap-2">
                <Store className="h-4 w-4 text-emerald-600" />
                分店管理
              </CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                每個收貨據點一筆,供應商送貨會依這裡的地址與收貨時段安排
              </p>
            </div>
            {canEditBranch && (
              <Button
                size="sm"
                onClick={openCreateBranch}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                新增分店
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : branches.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>還沒有建立分店</p>
              {canEditBranch && (
                <p className="mt-1 text-xs">點右上角「新增分店」建立第一個收貨據點</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-800">{b.name ?? "未命名分店"}</p>
                      {b.is_active === false && (
                        <Badge
                          variant="outline"
                          className="bg-slate-100 text-slate-500 border-slate-300"
                        >
                          已停用
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1 flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                      {b.address || "尚未填寫地址"}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5 flex items-start gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                      {b.receiving_hours || "尚未設定收貨時段"}
                    </p>
                  </div>
                  {canEditBranch && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-slate-700 shrink-0"
                      onClick={() => openEditBranch(b)}
                      aria-label="編輯分店"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!canEditBranch && !loading && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5" />
              你的角色為採購員,分店資料為唯讀。
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 成員管理 ── */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700 flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            成員管理
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            調整每位同事的權限;採購員看不到任何成本與毛利數字
          </p>
        </CardHeader>
        <CardContent>
          {!isOwner && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <span>只有老闆可以調整成員角色或停用帳號,以下為唯讀檢視。</span>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>目前沒有其他成員</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const active = m.is_active ?? true;
                const isSelf = m.user_id === myUserId;
                const busy = busyMemberId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border px-4 py-3 ${
                      active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-slate-800 truncate">{memberName(m)}</p>
                        {isSelf && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            你自己
                          </Badge>
                        )}
                        {!active && (
                          <Badge
                            variant="outline"
                            className="bg-slate-100 text-slate-500 border-slate-300"
                          >
                            已停用
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {branchName(m.branch_id)} · 加入於{" "}
                        {new Date(m.created_at).toLocaleDateString("zh-TW")}
                      </p>
                    </div>

                    {isOwner ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={m.role}
                          disabled={busy || isSelf || !active}
                          onValueChange={(v) => handleChangeRole(m, v as RestaurantRole)}
                        >
                          <SelectTrigger className="h-9 w-[132px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {/* 只放純文字 —— SelectItem 的 children 會被 Radix 鏡射到 trigger 上 */}
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || isSelf}
                          onClick={() => setToggleTarget(m)}
                          className={
                            active
                              ? "text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          }
                        >
                          {active ? (
                            <>
                              <UserX className="h-4 w-4 mr-1.5" />
                              停用
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4 mr-1.5" />
                              啟用
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline" className={`${ROLE_CLASS[m.role]} shrink-0`}>
                        {ROLE_LABEL[m.role] ?? m.role}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && members.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">角色權限說明</p>
              {ROLE_OPTIONS.map((r) => (
                <p key={r.value} className="text-xs text-slate-400">
                  <span className="text-slate-600 font-medium">{r.label}</span>
                  {" — "}
                  {r.hint}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 分店編輯 Dialog */}
      <Dialog open={branchOpen} onOpenChange={setBranchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{branchForm.id ? "編輯分店" : "新增分店"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name" className="text-slate-600">
                分店名稱 *
              </Label>
              <Input
                id="branch-name"
                value={branchForm.name}
                onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例:信義店"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-address" className="text-slate-600">
                收貨地址
              </Label>
              <Input
                id="branch-address"
                value={branchForm.address}
                onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="例:臺北市信義區松高路 11 號 B1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-hours" className="text-slate-600">
                收貨時段
              </Label>
              <Input
                id="branch-hours"
                value={branchForm.receiving_hours}
                onChange={(e) =>
                  setBranchForm((f) => ({ ...f, receiving_hours: e.target.value }))
                }
                placeholder="例:週一至週六 08:00–11:00"
              />
              <p className="text-xs text-slate-400">供應商會依這個時段安排配送</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={branchForm.is_active}
                onCheckedChange={(v) => setBranchForm((f) => ({ ...f, is_active: v }))}
              />
              <span className="text-sm text-slate-600">啟用中(可接收訂單)</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={savingBranch || !branchForm.name.trim()}
              onClick={handleSaveBranch}
            >
              {savingBranch ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 停用 / 啟用確認 */}
      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(o) => {
          if (!o) setToggleTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget && (toggleTarget.is_active ?? true)
                ? "確定停用這位成員?"
                : "確定重新啟用這位成員?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget && (toggleTarget.is_active ?? true)
                ? `${toggleTarget ? memberName(toggleTarget) : ""} 將無法再登入餐廳後台,既有訂單紀錄會完整保留。`
                : "該成員將可以重新登入餐廳後台。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              className={
                toggleTarget && (toggleTarget.is_active ?? true)
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }
            >
              確定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RestaurantTeamPage;
