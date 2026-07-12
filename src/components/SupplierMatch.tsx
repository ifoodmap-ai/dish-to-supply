import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, CheckCircle2, PackageSearch, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { matchSuppliers, type MatchedSupplier, type MatchedItem } from "@/lib/api";
import { track } from "@/lib/analytics";

interface SupplierMatchProps {
  show: boolean;
  names: string[];
}

const formatItemChip = (item: MatchedItem): string => {
  const priceInfo = item.price != null ? ` $${item.price}${item.unit ? `/${item.unit}` : ""}` : "";
  return `${item.ingredient} → ${item.name}${priceInfo}`;
};

const ScoreRing = ({ score }: { score: number }) => {
  const clamped = Math.max(0, Math.min(99, Math.round(score)));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative w-16 h-16 flex-shrink-0" aria-label={`媒合分數 ${clamped}`}>
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-muted"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-primary transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-primary leading-none">{clamped}</span>
        <span className="text-[10px] text-muted-foreground leading-none mt-0.5">分</span>
      </div>
    </div>
  );
};

const SupplierMatch = ({ show, names }: SupplierMatchProps) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<MatchedSupplier[]>([]);
  const [loaded, setLoaded] = useState(false);
  const lastFetchKey = useRef<string>("");

  useEffect(() => {
    if (!show || names.length === 0) return;

    const fetchKey = names.join("|");
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;

    let cancelled = false;
    setIsLoading(true);
    setLoaded(false);

    matchSuppliers(names)
      .then((result) => {
        if (cancelled) return;
        const matched = result?.suppliers ?? [];
        setSuppliers(matched);
        setLoaded(true);
        track("match_viewed", { suppliers: matched.length });
      })
      .catch(() => {
        if (cancelled) return;
        // 媒合服務暫時失敗 → 走正向空狀態(需求已在後台留存,專人跟進)
        setSuppliers([]);
        setLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [show, names]);

  if (!show) return null;

  return (
    <section className="py-16 bg-muted/30">
      <div className="container px-4 mx-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">為您媒合的供應商</h2>
            <p className="text-xl text-muted-foreground">
              根據您的食材需求,AI 已從合作供應商中找出最合適的選擇
            </p>
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="p-6 shadow-soft">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1 mr-4">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                      <Skeleton className="w-16 h-16 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                    <Skeleton className="h-10 w-full" />
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!isLoading && loaded && suppliers.length === 0 && (
            <Card className="p-8 md:p-12 shadow-medium max-w-2xl mx-auto text-center">
              <div className="space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
                  <PackageSearch className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold">已收到您的需求</h3>
                <p className="text-lg text-muted-foreground">
                  目前平台上暫無完全符合的供應商,專人將盡快為您媒合,
                  媒合結果與報價會透過您留下的聯絡方式通知您。
                </p>
              </div>
            </Card>
          )}

          {!isLoading && suppliers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {suppliers.map(({ supplier, score, matchedCount, items }) => (
                <Card
                  key={supplier.id}
                  className="p-6 shadow-soft hover:shadow-medium transition-all duration-300 hover:-translate-y-1 flex flex-col"
                >
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <h3 className="text-xl font-bold">{supplier.name}</h3>
                        {supplier.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {supplier.description}
                          </p>
                        )}
                      </div>
                      <ScoreRing score={score} />
                    </div>

                    {supplier.service_areas && supplier.service_areas.length > 0 && (
                      <div className="flex items-start space-x-2">
                        <MapPin className="w-4 h-4 mt-1 flex-shrink-0 text-muted-foreground" />
                        <div className="flex flex-wrap gap-1.5">
                          {supplier.service_areas.map((area, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="bg-primary/10 text-primary hover:bg-primary/20"
                            >
                              {area}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-2 text-sm font-medium text-primary">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>符合 {matchedCount} 項需求</span>
                    </div>

                    {items.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">可供應品項</p>
                        <div className="flex flex-wrap gap-2">
                          {items.slice(0, 6).map((item, index) => (
                            <Badge key={index} variant="outline" className="border-primary/30 font-normal">
                              {formatItemChip(item)}
                            </Badge>
                          ))}
                          {items.length > 6 && (
                            <Badge variant="outline" className="border-primary/30 font-normal">
                              +{items.length - 6} 項
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-auto pt-2">
                      <Button
                        variant="hero"
                        className="w-full"
                        onClick={() => navigate(`/supplier/${supplier.id}`)}
                      >
                        查看供應商並詢價
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SupplierMatch;
