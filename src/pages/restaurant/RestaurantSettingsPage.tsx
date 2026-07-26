import { useEffect, useState } from "react";
import { Store, Lock, Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant, canSeeCost } from "@/components/RestaurantRoute";

interface RestaurantRow {
  id: string;
  name: string | null;
  tax_id: string | null;
  cuisine_type: string | null;
  seats: number | null;
  address: string | null;
  city: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  monthly_revenue_band: string | null;
  is_active: boolean | null;
  updated_at: string | null;
}

interface FormState {
  name: string;
  tax_id: string;
  cuisine_type: string;
  seats: string;
  address: string;
  city: string;
  contact_name: string;
  contact_phone: string;
  contact_line: string;
  monthly_revenue_band: string;
}

const emptyForm: FormState = {
  name: "",
  tax_id: "",
  cuisine_type: "",
  seats: "",
  address: "",
  city: "",
  contact_name: "",
  contact_phone: "",
  contact_line: "",
  monthly_revenue_band: "",
};

const CUISINE_OPTIONS = [
  "台式",
  "中式",
  "日式",
  "韓式",
  "西式",
  "義式",
  "泰式",
  "美式",
  "港式",
  "火鍋",
  "燒烤",
  "早午餐",
  "咖啡輕食",
  "飲料店",
  "烘焙甜點",
  "素食蔬食",
  "便當自助餐",
  "其他",
];

const CITY_OPTIONS = [
  "臺北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

const REVENUE_BANDS = [
  { value: "under_300k", label: "30 萬以下" },
  { value: "300k_600k", label: "30 ~ 60 萬" },
  { value: "600k_1m", label: "60 ~ 100 萬" },
  { value: "1m_3m", label: "100 ~ 300 萬" },
  { value: "over_3m", label: "300 萬以上" },
];

/** 表單欄位外框 —— 必須定義在元件外,否則每次 render 都會重新掛載 Input 導致失焦 */
const Field = ({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor} className="text-slate-600">
      {label}
    </Label>
    {children}
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>
);

const toForm = (r: RestaurantRow): FormState => ({
  name: r.name ?? "",
  tax_id: r.tax_id ?? "",
  cuisine_type: r.cuisine_type ?? "",
  seats: r.seats != null ? String(r.seats) : "",
  address: r.address ?? "",
  city: r.city ?? "",
  contact_name: r.contact_name ?? "",
  contact_phone: r.contact_phone ?? "",
  contact_line: r.contact_line ?? "",
  monthly_revenue_band: r.monthly_revenue_band ?? "",
});

const RestaurantSettingsPage = () => {
  const account = useRestaurant();
  // 只有老闆 / 店長可以編輯,採購員唯讀
  const canEdit = canSeeCost(account.role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState<FormState>(emptyForm);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const { data, error } = (await (supabase as never as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              col: string,
              v: string,
            ) => Promise<{ data: RestaurantRow[] | null; error: { message: string } | null }>;
          };
        };
      })
        .from("restaurants")
        .select("*")
        .eq("id", account.restaurant_id)) as {
        data: RestaurantRow[] | null;
        error: { message: string } | null;
      };

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
        toast.error("載入店家資料失敗", { description: error.message });
        setLoading(false);
        return;
      }

      const row = data?.[0];
      if (!row) {
        setLoadError("找不到這家餐廳的資料");
        setLoading(false);
        return;
      }

      const next = toForm(row);
      setForm(next);
      setOriginal(next);
      setUpdatedAt(row.updated_at);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [account.restaurant_id]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = (Object.keys(form) as (keyof FormState)[]).some(
    (k) => form[k] !== original[k],
  );

  const validate = (): string | null => {
    if (!form.name.trim()) return "請填寫店名";
    if (form.tax_id.trim() && !/^\d{8}$/.test(form.tax_id.trim()))
      return "統一編號須為 8 位數字";
    if (form.seats.trim()) {
      const n = Number(form.seats);
      if (!Number.isFinite(n) || n < 0) return "座位數須為 0 以上的數字";
    }
    return null;
  };

  const handleSave = async () => {
    if (!canEdit) return;
    const invalid = validate();
    if (invalid) {
      toast.error(invalid);
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      tax_id: form.tax_id.trim() || null,
      cuisine_type: form.cuisine_type.trim() || null,
      seats: form.seats.trim() ? Math.round(Number(form.seats)) : null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_line: form.contact_line.trim() || null,
      monthly_revenue_band: form.monthly_revenue_band.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = (await (supabase as never as {
      from: (t: string) => {
        update: (v: unknown) => {
          eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("restaurants")
      .update(payload)
      .eq("id", account.restaurant_id)) as { error: { message: string } | null };

    setSaving(false);

    if (error) {
      toast.error("儲存失敗", { description: error.message });
      return;
    }

    const next: FormState = {
      ...form,
      name: form.name.trim(),
      tax_id: form.tax_id.trim(),
      seats: payload.seats != null ? String(payload.seats) : "",
    };
    setForm(next);
    setOriginal(next);
    setUpdatedAt(payload.updated_at);
    toast.success("店家設定已儲存");
  };

  // 資料庫既有的值若不在選項清單裡,補進下拉避免顯示空白
  const cuisineOptions = form.cuisine_type && !CUISINE_OPTIONS.includes(form.cuisine_type)
    ? [form.cuisine_type, ...CUISINE_OPTIONS]
    : CUISINE_OPTIONS;
  const cityOptions = form.city && !CITY_OPTIONS.includes(form.city)
    ? [form.city, ...CITY_OPTIONS]
    : CITY_OPTIONS;
  const revenueOptions = form.monthly_revenue_band &&
    !REVENUE_BANDS.some((b) => b.value === form.monthly_revenue_band)
    ? [{ value: form.monthly_revenue_band, label: form.monthly_revenue_band }, ...REVENUE_BANDS]
    : REVENUE_BANDS;

  if (loading) {
    return (
      <div className="max-w-3xl">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <Card className="border-slate-200">
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">店家設定</h1>
        <p className="text-sm text-slate-500 mt-1">
          維護餐廳基本資料,供應商與媒合結果會依據這些資訊呈現
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {!canEdit && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>你的角色為採購員,店家設定為唯讀。需要修改請聯繫老闆或店長。</span>
        </div>
      )}

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700 flex items-center gap-2">
            <Store className="h-4 w-4 text-emerald-600" />
            基本資料
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="店名 *" htmlFor="name">
              <Input
                id="name"
                value={form.name}
                disabled={!canEdit}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="例:一鼎麵屋"
              />
            </Field>
            <Field label="統一編號" htmlFor="tax_id" hint="8 位數字,可留空">
              <Input
                id="tax_id"
                value={form.tax_id}
                disabled={!canEdit}
                inputMode="numeric"
                maxLength={8}
                onChange={(e) => set("tax_id")(e.target.value.replace(/\D/g, ""))}
                placeholder="12345678"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="餐廳類型">
              <Select
                value={form.cuisine_type || undefined}
                disabled={!canEdit}
                onValueChange={set("cuisine_type")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇料理類型" />
                </SelectTrigger>
                <SelectContent>
                  {cuisineOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="座位數" htmlFor="seats">
              <Input
                id="seats"
                value={form.seats}
                disabled={!canEdit}
                inputMode="numeric"
                onChange={(e) => set("seats")(e.target.value.replace(/\D/g, ""))}
                placeholder="例:48"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="縣市">
              <Select
                value={form.city || undefined}
                disabled={!canEdit}
                onValueChange={set("city")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇縣市" />
                </SelectTrigger>
                <SelectContent>
                  {cityOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="地址" htmlFor="address">
                <Input
                  id="address"
                  value={form.address}
                  disabled={!canEdit}
                  onChange={(e) => set("address")(e.target.value)}
                  placeholder="例:大安區信義路四段 123 號 1 樓"
                />
              </Field>
            </div>
          </div>

          {canEdit && (
            <Field label="月營業額級距" hint="僅供媒合參考,不會公開給供應商">
              <Select
                value={form.monthly_revenue_band || undefined}
                onValueChange={set("monthly_revenue_band")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇級距" />
                </SelectTrigger>
                <SelectContent>
                  {revenueOptions.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">聯絡資訊</CardTitle>
          <p className="text-xs text-slate-400">供應商出貨、對帳時的聯絡窗口</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="聯絡人" htmlFor="contact_name">
              <Input
                id="contact_name"
                value={form.contact_name}
                disabled={!canEdit}
                onChange={(e) => set("contact_name")(e.target.value)}
                placeholder="王小明"
              />
            </Field>
            <Field label="聯絡電話" htmlFor="contact_phone">
              <Input
                id="contact_phone"
                value={form.contact_phone}
                disabled={!canEdit}
                inputMode="tel"
                onChange={(e) => set("contact_phone")(e.target.value)}
                placeholder="0912-345-678"
              />
            </Field>
            <Field label="LINE ID" htmlFor="contact_line">
              <Input
                id="contact_line"
                value={form.contact_line}
                disabled={!canEdit}
                onChange={(e) => set("contact_line")(e.target.value)}
                placeholder="@myrestaurant"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <Button
            onClick={handleSave}
            disabled={saving || !dirty || !!loadError}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "儲存中…" : "儲存變更"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setForm(original)}
            disabled={saving || !dirty}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            還原
          </Button>
          {dirty && <span className="text-xs text-amber-600">有尚未儲存的變更</span>}
          {!dirty && updatedAt && (
            <span className="text-xs text-slate-400">
              最後更新:{new Date(updatedAt).toLocaleString("zh-TW")}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default RestaurantSettingsPage;
