// 受邀者登入後看到的「餐廳邀請」畫面(掛在登入首頁 LoginPortal 上)。
//
// 每一筆待接受的邀請:「X 餐廳」邀請你以「採購員」加入 → [接受] [拒絕]。
//   接受 → accept_restaurant_invite() → 進餐廳後台
//   拒絕 → 再確認一次 → decline_restaurant_invite()
// 全部處理完之後:
//   有其他身分(自己的餐廳、供應商…)→ 帶他去那個後台
//   什麼身分都沒有 → 引導他在這裡直接建立自己的餐廳(自己輸入餐廳名稱 ——
//   被搶先邀請的 email 自己去註冊時,GoTrue 不會寫入註冊表單的餐廳資料,所以不能指望 user_metadata)
// 已登入、一開始就沒有邀請也沒有任何身分的人(例如之前拒絕了邀請、還沒建店就離開),
// 登入首頁也會用這個元件(invites = [])直接顯示「建立自己的餐廳」。

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail, Store, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultPortal, portalHref, type PortalInfo } from "@/lib/portal";
import {
  RESTAURANT_ROLE_LABEL,
  acceptRestaurantInvite,
  createOwnRestaurant,
  declineRestaurantInvite,
  validateOwnRestaurant,
  type OwnRestaurantInput,
  type PendingRestaurantInvite,
} from "@/lib/restaurant-invites";

interface Props {
  invites: PendingRestaurantInvite[];
  /** 這個人「已生效」的其他身分(可能是空的) */
  portals: PortalInfo[];
  /** 預填「建立自己的餐廳」的聯絡人 */
  displayName?: string | null;
  onSignOut: () => void;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("zh-TW");
};

const RestaurantInvitePanel = ({ invites, portals, displayName, onSignOut }: Props) => {
  const navigate = useNavigate();
  const [list, setList] = useState<PendingRestaurantInvite[]>(invites);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeclineId, setConfirmDeclineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declinedAny, setDeclinedAny] = useState(false);

  const [form, setForm] = useState<OwnRestaurantInput>({
    restaurantName: "",
    contactName: displayName?.trim() ?? "",
    phone: "",
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof OwnRestaurantInput, string>>>({});
  const [creating, setCreating] = useState(false);

  const otherPortal = defaultPortal(portals);

  const removeInvite = (id: string) => setList((l) => l.filter((x) => x.invite_id !== id));

  const handleAccept = async (inv: PendingRestaurantInvite) => {
    if (busyId) return;
    setBusyId(inv.invite_id);
    setError(null);
    const res = await acceptRestaurantInvite(inv.invite_id);
    setBusyId(null);
    if (res.kind !== "ok") {
      if (res.kind === "gone") removeInvite(inv.invite_id);
      setError(res.message);
      return;
    }
    toast.success(`已加入「${inv.restaurant_name}」`);
    navigate("/restaurant", { replace: true });
  };

  const handleDecline = async (inv: PendingRestaurantInvite) => {
    if (busyId) return;
    setBusyId(inv.invite_id);
    setError(null);
    const res = await declineRestaurantInvite(inv.invite_id);
    setBusyId(null);
    setConfirmDeclineId(null);
    if (res.kind !== "ok") {
      if (res.kind === "gone") removeInvite(inv.invite_id);
      setError(res.message);
      return;
    }
    removeInvite(inv.invite_id);
    setDeclinedAny(true);
    toast.info(`已拒絕「${inv.restaurant_name}」的邀請`);
  };

  const updateForm = (key: keyof OwnRestaurantInput, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const errors = validateOwnRestaurant(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setCreating(true);
    setError(null);
    const res = await createOwnRestaurant(form);
    setCreating(false);
    if (res.kind !== "ok") {
      setError(res.message);
      return;
    }
    toast.success("餐廳建立完成");
    navigate("/restaurant", { replace: true });
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {list.length > 0 && (
        <>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">你有 {list.length} 個餐廳邀請</h1>
            <p className="text-sm text-slate-500 mt-2">
              接受之後才會成為該店的成員;拒絕的話,這個邀請會被移除。
            </p>
          </div>

          <ul className="space-y-3" aria-label="待接受的餐廳邀請">
            {list.map((inv) => {
              const busy = busyId === inv.invite_id;
              const confirming = confirmDeclineId === inv.invite_id;
              const invitedOn = formatDate(inv.invited_at);
              return (
                <li key={inv.invite_id}>
                  <Card className="p-5">
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 break-words">
                          「{inv.restaurant_name}」邀請你以「{RESTAURANT_ROLE_LABEL[inv.role]}」加入
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {inv.branch_name ? `分店:${inv.branch_name}` : "全店"}
                          {invitedOn && ` · 邀請於 ${invitedOn}`}
                        </p>
                      </div>
                    </div>

                    {confirming ? (
                      <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
                        <p className="text-sm text-red-800">
                          確定要拒絕「{inv.restaurant_name}」的邀請嗎?拒絕後這個邀請會被移除,之後要加入得請對方再邀請一次。
                        </p>
                        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => setConfirmDeclineId(null)}
                          >
                            取消
                          </Button>
                          <Button
                            variant="destructive"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => handleDecline(inv)}
                          >
                            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            確定拒絕
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                          variant="outline"
                          className="min-h-11"
                          disabled={!!busyId}
                          onClick={() => {
                            setError(null);
                            setConfirmDeclineId(inv.invite_id);
                          }}
                        >
                          拒絕
                        </Button>
                        <Button className="min-h-11" disabled={!!busyId} onClick={() => handleAccept(inv)}>
                          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                          接受
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {list.length === 0 && otherPortal && (
        <Card className="p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            {declinedAny ? "已拒絕邀請" : "目前沒有待處理的邀請"}
          </h1>
          <p className="text-sm text-slate-500 mt-2">你可以繼續使用你原本的後台。</p>
          <Button asChild className="w-full mt-5 min-h-11">
            <a href={portalHref(otherPortal)}>
              前往{otherPortal.label}
              {otherPortal.orgName ? ` · ${otherPortal.orgName}` : ""}
            </a>
          </Button>
        </Card>
      )}

      {list.length === 0 && !otherPortal && (
        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <Store className="h-6 w-6 text-emerald-600 shrink-0" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {declinedAny ? "已拒絕邀請 —— 要建立自己的餐廳嗎?" : "這個帳號還沒有後台身分"}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                填好餐廳名稱就能建立自己的餐廳;你會是這家店的老闆,之後可以再邀請同事加入。
              </p>
              {!declinedAny && (
                <p className="text-sm text-slate-500 mt-1">
                  如果你是供應商,或是要加入別人的餐廳,請聯絡對方或 iFoodmap 服務窗口開通。
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="own-restaurant-name">餐廳名稱</Label>
              <Input
                id="own-restaurant-name"
                value={form.restaurantName}
                onChange={(e) => updateForm("restaurantName", e.target.value)}
                aria-invalid={!!formErrors.restaurantName}
                aria-describedby={formErrors.restaurantName ? "own-restaurant-name-error" : undefined}
                placeholder="例如:好味小館"
                autoComplete="organization"
              />
              {formErrors.restaurantName && (
                <p id="own-restaurant-name-error" className="text-sm text-red-600">{formErrors.restaurantName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="own-contact-name">聯絡人(選填)</Label>
              <Input
                id="own-contact-name"
                value={form.contactName}
                onChange={(e) => updateForm("contactName", e.target.value)}
                aria-invalid={!!formErrors.contactName}
                aria-describedby={formErrors.contactName ? "own-contact-name-error" : undefined}
                autoComplete="name"
              />
              {formErrors.contactName && (
                <p id="own-contact-name-error" className="text-sm text-red-600">{formErrors.contactName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="own-phone">電話(選填)</Label>
              <Input
                id="own-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => updateForm("phone", e.target.value)}
                aria-invalid={!!formErrors.phone}
                aria-describedby={formErrors.phone ? "own-phone-error" : undefined}
                autoComplete="tel"
              />
              {formErrors.phone && <p id="own-phone-error" className="text-sm text-red-600">{formErrors.phone}</p>}
            </div>
            <Button type="submit" className="w-full min-h-11" disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              建立我的餐廳
            </Button>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
        {list.length > 0 && otherPortal && (
          <a href={portalHref(otherPortal)} className="text-slate-500 hover:text-slate-800 underline-offset-4 hover:underline">
            先不處理,前往{otherPortal.label}
          </a>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex min-h-11 items-center gap-1.5 text-slate-500 hover:text-slate-800"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          登出
        </button>
      </div>
    </div>
  );
};

export default RestaurantInvitePanel;
