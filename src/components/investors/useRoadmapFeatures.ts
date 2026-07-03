import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FALLBACK_FEATURES, type RoadmapFeature } from './roadmap-config';

interface RoadmapData {
  features: RoadmapFeature[];
  isFallback: boolean;
  lastUpdated: string | null;
}

export const useRoadmapFeatures = () => {
  return useQuery<RoadmapData>({
    queryKey: ['roadmap_features'],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        from: (t: string) => {
          select: (c: string) => {
            order: (c: string, o?: { ascending: boolean }) => Promise<{
              data: RoadmapFeature[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      })
        .from('roadmap_features')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error || !data || data.length === 0) {
        return { features: FALLBACK_FEATURES, isFallback: true, lastUpdated: null };
      }

      const lastUpdated = data.reduce(
        (max, f) => (f.updated_at > max ? f.updated_at : max),
        data[0].updated_at,
      );
      return { features: data, isFallback: false, lastUpdated };
    },
  });
};
