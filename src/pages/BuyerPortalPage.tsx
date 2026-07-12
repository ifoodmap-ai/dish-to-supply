import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ShoppingBag,
  Store,
  LogIn,
  RotateCcw,
  CalendarDays,
  ArrowRight,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

interface InquiryRow {
  id: string | number;
  user_id: string;
  supplier_id: number | null;
  supplier_name: string | null;
  products: unknown;
  message: string | null;
  status: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: {
    label: "待回覆",
    className:
      "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  },
  sent: {
    label: "已送出",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  },
  quoted: {
    label: "已報價",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  },
  closed: {
    label: "已結案",
    className:
      "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
};

const PRODUCT_CHIP_CAP = 6;

const productNames = (products: unknown): string[] => {
  if (!Array.isArray(products)) return [];
  return products.map((item) => {
    if (item && typeof item === "object") {
      const name = (item as Record<string, unknown>).name;
      if (typeof name === "string" && name.length > 0) return name;
    }
    return typeof item === "string" ? item : String(item);
  });
};

const formatDateTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
};

const fetchInquiries = async (userId: string): Promise<InquiryRow[]> => {
  const { data, error } = (await (supabase as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string
        ) => {
          order: (
            c: string,
            o: { ascending: boolean }
          ) => Promise<{
            data: InquiryRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("inquiries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })) as {
    data: InquiryRow[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return data ?? [];
};

const StatusBadge = ({ status }: { status: string | null }) => {
  const key = status ?? "pending";
  const cfg = STATUS_MAP[key];
  if (!cfg) {
    return (
      <Badge variant="outline" className="text-xs">
        {key}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
};

const BuyerPortalPage = () => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [reorderingId, setReorderingId] = useState<string | number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const {
    data: inquiries,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["my-inquiries", userId],
    queryFn: () => fetchInquiries(userId as string),
    enabled: !!userId,
  });

  const handleReorder = async (original: InquiryRow) => {
    if (!userId || reorderingId !== null) return;
    setReorderingId(original.id);

    const payload = {
      user_id: userId,
      supplier_id: original.supplier_id,
      supplier_name: original.supplier_name,
      products: original.products,
      message: "回購:" + (original.message ?? ""),
      status: "pending",
    };

    const tempId = `temp_${Date.now()}`;
    const optimistic: InquiryRow = {
      id: tempId,
      user_id: userId,
      supplier_id: original.supplier_id,
      supplier_name: original.supplier_name,
      products: original.products,
      message: payload.message,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    // Optimistic prepend
    queryClient.setQueryData<InquiryRow[]>(["my-inquiries", userId], (old) => [
      optimistic,
      ...(old ?? []),
    ]);

    try {
      const { data, error } = (await (supabase as never as {
        from: (t: string) => {
          insert: (row: object) => {
            select: (c: string) => {
              single: () => Promise<{
                data: InquiryRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from("inquiries")
        .insert(payload)
        .select("*")
        .single()) as {
        data: InquiryRow | null;
        error: { message: string } | null;
      };
      if (error) throw new Error(error.message);

      // Replace the temp row with the real one from the server
      if (data) {
        queryClient.setQueryData<InquiryRow[]>(["my-inquiries", userId], (old) =>
          (old ?? []).map((r) => (r.id === tempId ? data : r))
        );
      }
      toast.success("已重新送出詢價，供應商將盡快與您聯繫");
      track("inquiry_sent", { reorder: true });
    } catch (e) {
      // Roll back the optimistic row
      queryClient.setQueryData<InquiryRow[]>(["my-inquiries", userId], (old) =>
        (old ?? []).filter((r) => r.id !== tempId)
      );
      toast.error(
        e instanceof Error && e.message
          ? `詢價送出失敗：${e.message}`
          : "詢價送出失敗，請稍後再試"
      );
    } finally {
      setReorderingId(null);
    }
  };

  const totalCount = inquiries?.length ?? 0;
  const latestDate = inquiries?.[0]?.created_at
    ? formatDate(inquiries[0].created_at)
    : "—";

  // ---- Auth loading ----
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container px-4 py-12 mx-auto max-w-4xl space-y-6">
          <Skeleton className="h-10 w-48 mx-auto" />
          <Skeleton className="h-5 w-72 mx-auto" />
          <div className="space-y-4 pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-6 space-y-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-32" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- Not signed in ----
  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container px-4 py-20 mx-auto max-w-lg">
          <Card className="p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <LogIn className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">請先登入以查看您的採購紀錄</h1>
            <p className="text-muted-foreground mb-6">
              登入後即可查看歷史詢價、追蹤報價進度，並一鍵回購常用食材。
            </p>
            <Button variant="hero" size="lg" asChild>
              <Link to="/auth">
                前往登入
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // ---- Signed in ----
  return (
    <div className="min-h-screen bg-background">
      <div className="container px-4 py-12 mx-auto max-w-4xl">
        {/* Header */}
        <div className="text-center mb-10 space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold">我的採購</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            查看您的詢價紀錄與報價進度，常用食材一鍵回購，採購更省時。
          </p>
          {/* KPI chips */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">總詢價次數</span>
              <span className="font-bold">{isLoading ? "…" : totalCount}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm">
              <CalendarDays className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">最近詢價日期</span>
              <span className="font-bold">{isLoading ? "…" : latestDate}</span>
            </div>
          </div>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-14 rounded-full" />
                </div>
                <Skeleton className="h-9 w-36" />
              </Card>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <Card className="p-8 text-center max-w-lg mx-auto">
            <h2 className="text-xl font-bold mb-2">暫時無法載入採購紀錄</h2>
            <p className="text-muted-foreground mb-4">請稍後再試。</p>
            <Button
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["my-inquiries", userId] })
              }
            >
              重新載入
            </Button>
          </Card>
        )}

        {/* Empty state */}
        {!isLoading && !isError && totalCount === 0 && (
          <Card className="p-12 text-center max-w-lg mx-auto">
            <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold mb-2">還沒有詢價紀錄</h2>
            <p className="text-muted-foreground mb-6">
              從供應商列表挑選合適的夥伴，送出您的第一筆詢價吧。
            </p>
            <Button variant="hero" asChild>
              <Link to="/suppliers">
                逛逛供應商
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </Card>
        )}

        {/* Inquiry list */}
        {!isLoading && !isError && totalCount > 0 && (
          <div className="space-y-4">
            {inquiries!.map((inq) => {
              const names = productNames(inq.products);
              const shown = names.slice(0, PRODUCT_CHIP_CAP);
              const overflow = names.length - shown.length;
              return (
                <Card key={inq.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Store className="w-4 h-4 text-primary flex-shrink-0" />
                        <h3 className="font-bold leading-snug">
                          {inq.supplier_name || "未指定供應商"}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        建立於 {formatDateTime(inq.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={inq.status} />
                  </div>

                  {shown.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      {shown.map((name, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {name}
                        </Badge>
                      ))}
                      {overflow > 0 && (
                        <Badge variant="outline" className="text-xs">
                          +{overflow}
                        </Badge>
                      )}
                    </div>
                  )}

                  {inq.message && (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2">
                      {inq.message}
                    </p>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reorderingId !== null}
                    onClick={() => handleReorder(inq)}
                  >
                    <RotateCcw
                      className={`w-4 h-4 mr-2 ${reorderingId === inq.id ? "animate-spin" : ""}`}
                    />
                    {reorderingId === inq.id ? "送出中…" : "再次詢價 (回購)"}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyerPortalPage;
