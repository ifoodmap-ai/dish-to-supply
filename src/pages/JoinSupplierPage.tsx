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

const sellingPoints = [
  {
    icon: Store,
    title: "免費上架",
    description: "免費建立供應商檔案與商品目錄,不收上架費,零成本觸及更多餐飲買家。",
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

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const JoinSupplierPage = () => {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactLine, setContactLine] = useState("");
  const [categories, setCategories] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
        from: (t: string) => { insert: (row: object) => Promise<{ error: { message?: string } | null }> };
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
      <div className="container px-4 py-12 md:py-16 mx-auto max-w-5xl">
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
              審核通過後將以 Email 通知,請留意您的收件匣。
            </p>
            <div className="pt-2">
              <Button variant="hero" asChild>
                <Link to="/">返回首頁</Link>
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
                    disabled={submitting}
                  />
                </div>
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
      </div>
    </div>
  );
};

export default JoinSupplierPage;
