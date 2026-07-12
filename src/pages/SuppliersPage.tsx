import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Store, ArrowRight, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SupplierRow {
  id: string;
  name: string;
  description: string | null;
  contact_email: string | null;
  phone: string | null;
  service_areas: string[] | null;
  is_active?: boolean | null;
}

const fetchSuppliers = async (): Promise<SupplierRow[]> => {
  const { data, error } = (await (supabase as never)
    .from("suppliers")
    .select("*")
    .eq("is_active", true)
    .order("name")) as { data: SupplierRow[] | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  return data ?? [];
};

const SuppliersPage = () => {
  const navigate = useNavigate();
  const { data: suppliers, isLoading, isError } = useQuery({
    queryKey: ["public-suppliers"],
    queryFn: fetchSuppliers,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container px-4 py-12 mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold">合作供應商</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            嚴選優質食材供應商，涵蓋蔬果、肉品、海鮮與乾貨等品類，為您的餐廳找到最合適的採購夥伴。
          </p>
          <div className="pt-2">
            <Button variant="hero" size="lg" asChild>
              <Link to="/join">
                成為供應商
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <Skeleton className="h-6 w-40" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <Skeleton className="h-10 w-full" />
              </Card>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <Card className="p-8 text-center max-w-lg mx-auto">
            <h2 className="text-xl font-bold mb-2">暫時無法載入供應商</h2>
            <p className="text-muted-foreground mb-4">請稍後再試，或直接與我們聯繫。</p>
            <Button onClick={() => navigate(0)}>重新載入</Button>
          </Card>
        )}

        {/* Empty state */}
        {!isLoading && !isError && (suppliers?.length ?? 0) === 0 && (
          <Card className="p-12 text-center max-w-lg mx-auto">
            <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold mb-2">目前尚無上架供應商</h2>
            <p className="text-muted-foreground mb-6">
              我們正在陸續審核合作夥伴，歡迎您搶先加入供應商行列。
            </p>
            <Button variant="hero" asChild>
              <Link to="/join">成為供應商</Link>
            </Button>
          </Card>
        )}

        {/* Supplier grid */}
        {!isLoading && !isError && (suppliers?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {suppliers!.map((s) => (
              <Card
                key={s.id}
                className="p-6 flex flex-col hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold leading-snug">{s.name}</h3>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3 flex-1">
                  {s.description || "此供應商尚未提供介紹。"}
                </p>

                {(s.service_areas?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    {s.service_areas!.map((area, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {area}
                      </Badge>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full mt-auto"
                  onClick={() => navigate(`/supplier/${s.id}`)}
                >
                  查看供應商
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuppliersPage;
