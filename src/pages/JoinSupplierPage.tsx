import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Store, Sparkles, ClipboardList, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { landingHomeUrl } from "@/lib/site";
import { useLanguage } from "@/contexts/LanguageContext";
import PublicHeader from "@/components/PublicHeader";

const sellingPoints = [
  {
    icon: Store,
    title: "供應商上架",
    description: "建立供應商檔案與商品目錄，申請上架並觸及更多餐飲買家。",
  },
  {
    icon: Sparkles,
    title: "AI 自動派單",
    description: "AI 分析餐廳的採購需求,自動把符合您品類與服務區域的詢價派給您。",
  },
  {
    icon: ClipboardList,
    title: "線上接單管理",
    description: "詢價、報價、訂單狀態集中管理,一個後台掌握所有生意進度。",
  },
];

// 只收一般的 email —— 跟資料庫的匿名送件 policy(migration 20260928180100 / 180200)與寄信端
// (supabase/functions/_shared/supplier-mail.ts 的 EMAIL_PATTERN)同一條規則。
// `文字<信箱>`、`x@gmail.com.` 這類寫法會被拿來繞過「同一個 email」的頻率限制或塞廣告文字。
const emailRegex =
  /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.([A-Za-z]{2,}|xn--[A-Za-z0-9-]+)$/;

// 欄位長度上限 —— 跟資料庫的匿名送件 policy 一致
// (supabase/migrations/20260928180000_supplier_application_mail.sql),超過會被資料庫擋下
const MAX = {
  company_name: 200,
  contact_name: 100,
  contact_email: 254,
  contact_phone: 50,
  contact_line: 100,
  categories: 500,
  service_areas: 500,
  description: 5000,
} as const;

type InsertResult = { error: { message?: string; code?: string } | null };

const JoinSupplierPage = () => {
  const { language } = useLanguage();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactLine, setContactLine] = useState("");
  const [categories, setCategories] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [description, setDescription] = useState("");
  // honeypot:真人看不到、也跳不到這一欄;會把它填上的幾乎都是自動填表的機器人
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 機器人:假裝成功,什麼都不寫(不讓它知道被擋,也不會觸發任何寄信)
    if (website.trim()) {
      setSubmitted(true);
      return;
    }

    if (!companyName.trim()) {
      toast.error("請填寫公司名稱");
      return;
    }
    if (!contactEmail.trim()) {
      toast.error("請填寫聯絡 Email");
      return;
    }
    if (!emailRegex.test(contactEmail.trim())) {
      toast.error("Email 格式不正確,請確認後再送出");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await (supabase as never as {
        from: (t: string) => { insert: (row: object) => Promise<InsertResult> };
      })
        .from("supplier_applications")
        .insert({
          company_name: companyName.trim(),
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim() || null,
          contact_line: contactLine.trim() || null,
          categories: categories.trim() || null,
          service_areas: serviceAreas.trim() || null,
          description: description.trim() || null,
        });

      if (error) {
        // 同一個 Email 已經有一筆待審申請(資料庫的部分唯一索引)
        if (error.code === "23505") {
          toast.info("這個 Email 已經有一筆申請在審核中", {
            description: "不需要重複送出,審核結果會寄到這個信箱。",
          });
          return;
        }
        toast.error("送出失敗,請稍後再試");
        return;
      }

      track("supplier_applied", {});
      setSubmitted(true);
    } catch {
      toast.error("送出失敗,請稍後再試");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader className="max-w-5xl px-4 pt-3" />
      <main className="container px-4 py-12 md:py-16 mx-auto max-w-5xl">
        {/* Hero */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            成為 iFoodmap 合作供應商
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            加入全台餐飲採購媒合平台,讓 AI 幫您找到最適合的餐廳客戶,生意自己上門。
          </p>
        </div>

        {/* Selling points */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {sellingPoints.map(({ icon: Icon, title, description: desc }) => (
            <Card key={title} className="p-8 text-center space-y-3 hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </Card>
          ))}
        </div>

        {/* Application form / success */}
        {submitted ? (
          <Card className="p-8 md:p-12 max-w-2xl mx-auto text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">已收到申請</h2>
            <p className="text-muted-foreground leading-relaxed">
              感謝您申請成為 iFoodmap 合作供應商!
              <br />
              我們會寄一封確認信到 <span className="font-medium text-foreground">{contactEmail.trim()}</span>
              ,幾分鐘內沒收到的話,請看看垃圾郵件匣。
              <br />
              審核約需 3 個工作天,結果會以 Email 通知。
            </p>
            <div className="pt-2">
              {/* 申請者還沒有帳號,產品站的 `/` 是登入頁對他沒用 —— 回形象站首頁 */}
              <Button variant="hero" asChild>
                <a href={landingHomeUrl(language)}>返回首頁</a>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-8 max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-1">供應商入駐申請</h2>
              <p className="text-sm text-muted-foreground">
                填寫以下資料,我們將盡快完成審核並與您聯繫。標示 * 為必填欄位。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="company_name">
                    公司名稱 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="company_name"
                    placeholder="例:鮮采農產有限公司"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    maxLength={MAX.company_name}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_name">聯絡人</Label>
                  <Input
                    id="contact_name"
                    placeholder="例:王小明"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    maxLength={MAX.contact_name}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_email">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contact_email"
                    type="email"
                    placeholder="例:contact@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    maxLength={MAX.contact_email}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_phone">電話</Label>
                  <Input
                    id="contact_phone"
                    type="tel"
                    placeholder="例:02-1234-5678"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    maxLength={MAX.contact_phone}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_line">LINE ID</Label>
                  <Input
                    id="contact_line"
                    placeholder="例:freshfarm123"
                    value={contactLine}
                    onChange={(e) => setContactLine(e.target.value)}
                    maxLength={MAX.contact_line}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categories">供應品類</Label>
                  <Input
                    id="categories"
                    placeholder="例:蔬菜、肉品"
                    value={categories}
                    onChange={(e) => setCategories(e.target.value)}
                    maxLength={MAX.categories}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="service_areas">服務區域</Label>
                  <Input
                    id="service_areas"
                    placeholder="例:台北、新北"
                    value={serviceAreas}
                    onChange={(e) => setServiceAreas(e.target.value)}
                    maxLength={MAX.service_areas}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">公司簡介</Label>
                  <Textarea
                    id="description"
                    placeholder="簡單介紹您的公司、主力商品與服務特色…"
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={MAX.description}
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* honeypot:移出畫面外、不能用 Tab 跳到、螢幕閱讀器也略過 */}
              <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
                <label htmlFor="website">公司網站(請勿填寫)</label>
                <input
                  id="website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    送出中…
                  </>
                ) : (
                  "送出申請"
                )}
              </Button>

              <p className="text-sm text-muted-foreground text-center">
                已有帳號?
                <Link to="/auth" className="text-primary font-medium hover:underline ml-1">
                  供應商登入
                </Link>
              </p>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
};

export default JoinSupplierPage;
