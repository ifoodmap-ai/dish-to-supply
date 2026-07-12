import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Boxes, Building2, ReceiptText, Search, LineChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SupplyRow {
  id: string | number;
  supplier_id: string | number | null;
  name: string | null;
  category: string | null;
  unit: string | null;
  pack_size: string | null;
  price: number | null;
  currency: string | null;
  is_available: boolean | null;
}

interface SupplierRow {
  id: string | number;
  name: string | null;
  is_active?: boolean | null;
}

interface IndexItem {
  name: string;
  category: string;
  min: number;
  avg: number;
  max: number;
  unit: string;
  supplierCount: number;
  quoteCount: number;
}

const fetchSupplies = async (): Promise<SupplyRow[]> => {
  const { data, error } = (await (supabase as never)
    .from("supplies")
    .select("*")
    .eq("is_available", true)) as {
    data: SupplyRow[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return data ?? [];
};

const fetchSuppliers = async (): Promise<SupplierRow[]> => {
  const { data, error } = (await (supabase as never)
    .from("suppliers")
    .select("id, name, is_active")
    .eq("is_active", true)) as {
    data: SupplierRow[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return data ?? [];
};

const formatNT = (value: number): string =>
  `NT$ ${value.toLocaleString("zh-TW", { maximumFractionDigits: 1 })}`;

/** 取出現次數最多者(眾數) */
const mostCommon = (values: string[]): string => {
  const counts = new Map<string, number>();
  let best = "";
  let bestCount = 0;
  values.forEach((v) => {
    const next = (counts.get(v) ?? 0) + 1;
    counts.set(v, next);
    if (next > bestCount) {
      best = v;
      bestCount = next;
    }
  });
  return best;
};

const PriceIndexPage = () => {
  const [keyword, setKeyword] = useState("");

  const suppliesQuery = useQuery({
    queryKey: ["price-index-supplies"],
    queryFn: fetchSupplies,
  });
  const suppliersQuery = useQuery({
    queryKey: ["price-index-suppliers"],
    queryFn: fetchSuppliers,
  });

  const isLoading = suppliesQuery.isLoading || suppliersQuery.isLoading;
  const isError = suppliesQuery.isError;

  const derived = useMemo(() => {
    const supplies = suppliesQuery.data ?? [];
    const activeIds = new Set(
      (suppliersQuery.data ?? []).map((s) => String(s.id))
    );

    // 依品項名稱彙整所有有效報價
    const groups = new Map<
      string,
      {
        prices: number[];
        units: string[];
        categories: string[];
        supplierIds: Set<string>;
      }
    >();

    let quoteCount = 0;
    const quotingSupplierIds = new Set<string>();

    supplies.forEach((s) => {
      const name = s.name?.trim();
      const price = typeof s.price === "number" ? s.price : Number(s.price);
      if (!name || s.price === null || !Number.isFinite(price) || price <= 0) return;

      // 若已取得供應商名單,只採計仍在線上的供應商報價
      const sid = s.supplier_id !== null && s.supplier_id !== undefined ? String(s.supplier_id) : null;
      if (sid && activeIds.size > 0 && !activeIds.has(sid)) return;

      quoteCount += 1;
      if (sid) quotingSupplierIds.add(sid);

      let g = groups.get(name);
      if (!g) {
        g = { prices: [], units: [], categories: [], supplierIds: new Set() };
        groups.set(name, g);
      }
      g.prices.push(price);
      if (s.unit?.trim()) g.units.push(s.unit.trim());
      if (s.category?.trim()) g.categories.push(s.category.trim());
      if (sid) g.supplierIds.add(sid);
    });

    const items: IndexItem[] = [...groups.entries()]
      .map(([name, g]) => {
        const min = Math.min(...g.prices);
        const max = Math.max(...g.prices);
        const avg = g.prices.reduce((a, b) => a + b, 0) / g.prices.length;
        return {
          name,
          category: mostCommon(g.categories) || "其他",
          min,
          avg,
          max,
          unit: mostCommon(g.units) || "—",
          supplierCount: g.supplierIds.size,
          quoteCount: g.prices.length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

    const chartData = [...items]
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10)
      .map((i) => ({
        name: i.name,
        avg: Math.round(i.avg * 10) / 10,
        unit: i.unit,
      }));

    return {
      items,
      chartData,
      quoteCount,
      itemCount: items.length,
      supplierCount:
        quotingSupplierIds.size > 0 ? quotingSupplierIds.size : activeIds.size,
    };
  }, [suppliesQuery.data, suppliersQuery.data]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return derived.items;
    return derived.items.filter(
      (i) =>
        i.name.toLowerCase().includes(kw) ||
        i.category.toLowerCase().includes(kw)
    );
  }, [derived.items, keyword]);

  const kpis = [
    { title: "追蹤品項數", value: derived.itemCount, icon: Boxes },
    { title: "供應商數", value: derived.supplierCount, icon: Building2 },
    { title: "報價筆數", value: derived.quoteCount, icon: ReceiptText },
  ];

  const isEmpty = !isLoading && !isError && derived.items.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container px-4 py-12 mx-auto max-w-6xl">
        {/* Hero */}
        <div className="text-center mb-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <LineChart className="w-4 h-4" />
            公開數據
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">台灣食材價格指數</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            彙整 iFoodmap 平台即時報價，每日更新
          </p>
          <p className="text-xs text-muted-foreground/70">
            價格為平台供應商報價彙整，僅供參考
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {kpis.map(({ title, value, icon: Icon }) => (
            <Card key={title} className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16 mb-1" />
                  ) : (
                    <div className="text-2xl font-bold tabular-nums">
                      {value.toLocaleString("zh-TW")}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground">{title}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Error state */}
        {isError && (
          <Card className="p-8 text-center max-w-lg mx-auto">
            <h2 className="text-xl font-bold mb-2">暫時無法載入價格資料</h2>
            <p className="text-muted-foreground">請稍後再試，或直接與我們聯繫。</p>
          </Card>
        )}

        {/* Loading skeletons */}
        {isLoading && !isError && (
          <div className="space-y-6">
            <Card className="p-6">
              <Skeleton className="h-6 w-48 mb-4" />
              <Skeleton className="h-[320px] w-full" />
            </Card>
            <Card className="p-6 space-y-3">
              <Skeleton className="h-10 w-full max-w-sm" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </Card>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <Card className="p-12 text-center max-w-lg mx-auto">
            <Boxes className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold mb-2">目前尚無公開報價資料</h2>
            <p className="text-muted-foreground">
              供應商報價彙整中，歡迎稍後再回來查看最新的食材價格指數。
            </p>
          </Card>
        )}

        {/* Content */}
        {!isLoading && !isError && derived.items.length > 0 && (
          <div className="space-y-6">
            {/* Top 10 average price chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">平均報價 Top 10</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(240, derived.chartData.length * 36 + 40)}
                >
                  <BarChart
                    data={derived.chartData}
                    layout="vertical"
                    margin={{ left: 24, right: 32, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        `NT$ ${v.toLocaleString("zh-TW")}`
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value: number, _name, props) => [
                        `${formatNT(value)} / ${
                          (props?.payload as { unit?: string })?.unit ?? "單位"
                        }`,
                        "平均價",
                      ]}
                      cursor={{ fill: "rgba(16, 185, 129, 0.08)" }}
                    />
                    <Bar
                      dataKey="avg"
                      fill="#10b981"
                      radius={[0, 4, 4, 0]}
                      name="平均價"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Searchable price table */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle className="text-lg">全品項價格總覽</CardTitle>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="搜尋品項或分類⋯"
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    找不到符合「{keyword}」的品項，換個關鍵字試試。
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>品項</TableHead>
                          <TableHead>分類</TableHead>
                          <TableHead className="text-right">最低價</TableHead>
                          <TableHead className="text-right">平均價</TableHead>
                          <TableHead className="text-right">最高價</TableHead>
                          <TableHead>單位</TableHead>
                          <TableHead className="text-right">供應商數</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((item) => (
                          <TableRow key={item.name} className="hover:bg-muted/40">
                            <TableCell className="font-medium">
                              {item.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs font-normal">
                                {item.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-bold text-emerald-600">
                              {formatNT(item.min)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNT(item.avg)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatNT(item.max)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {item.unit}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {item.supplierCount > 0 ? item.supplierCount : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground/70 mt-4 text-center">
                  價格為平台供應商報價彙整，僅供參考。實際成交價依供應商報價單為準。
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceIndexPage;
