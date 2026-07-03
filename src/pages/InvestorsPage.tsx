import { useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import InvestorsHero from '@/components/investors/InvestorsHero';
import PhaseTimeline from '@/components/investors/PhaseTimeline';
import FeatureMap from '@/components/investors/FeatureMap';
import { useRoadmapFeatures } from '@/components/investors/useRoadmapFeatures';
import type { RoadmapStatus } from '@/components/investors/roadmap-config';

const InvestorsPage = () => {
  const { data, isLoading } = useRoadmapFeatures();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'ifoodmap 系統發展藍圖';
    // Unlisted page: keep it out of search engines
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      document.head.removeChild(meta);
    };
  }, []);

  const stats = useMemo(() => {
    const features = data?.features ?? [];
    const counts: Record<RoadmapStatus, number> = { done: 0, in_progress: 0, planned: 0 };
    features.forEach((f) => {
      counts[f.status] += 1;
    });
    const overallPercent =
      features.length > 0 ? Math.round((counts.done / features.length) * 100) : 0;
    return { counts, overallPercent };
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-16 space-y-14 md:space-y-20">
        {isLoading || !data ? (
          <div className="space-y-8" aria-busy="true">
            <Skeleton className="h-10 w-64 bg-slate-800" />
            <Skeleton className="h-40 w-full bg-slate-800" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-48 bg-slate-800" />
              ))}
            </div>
            <Skeleton className="h-96 w-full bg-slate-800" />
          </div>
        ) : (
          <>
            <InvestorsHero overallPercent={stats.overallPercent} counts={stats.counts} />
            <PhaseTimeline features={data.features} />
            <FeatureMap features={data.features} />
            <footer className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
              <span>ifoodmap © 2026 — 本頁進度即時同步於系統開發狀態</span>
              {!data.isFallback && data.lastUpdated && (
                <span>最後更新:{new Date(data.lastUpdated).toLocaleString('zh-TW')}</span>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

export default InvestorsPage;
