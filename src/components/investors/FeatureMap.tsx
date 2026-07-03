import { useState } from 'react';
import { ArrowRight, ArrowDown, CheckCircle2, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  BLOCKS,
  STATUS_META,
  type BlockMeta,
  type RoadmapFeature,
  type RoadmapStatus,
} from './roadmap-config';

interface FeatureMapProps {
  features: RoadmapFeature[];
}

const Legend = () => (
  <div className="flex flex-wrap items-center gap-4">
    {(Object.keys(STATUS_META) as RoadmapStatus[]).map((s) => (
      <span key={s} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <span className={`inline-block w-2.5 h-2.5 rounded-sm ${STATUS_META[s].dotClass}`} />
        {STATUS_META[s].label}
      </span>
    ))}
  </div>
);

const PipelineStrip = () => (
  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-400 mb-6">
    <span className="text-slate-300">客人需求</span>
    {BLOCKS.map((b) => (
      <span key={b.key} className="inline-flex items-center gap-2">
        <ChevronRight className="w-3.5 h-3.5 text-emerald-500/70" />
        <span className="text-slate-300">{b.pipelineLabel}</span>
      </span>
    ))}
  </div>
);

const FeatureTile = ({ feature, index }: { feature: RoadmapFeature; index: number }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[feature.status];

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className={`text-left rounded-lg border p-3 transition-colors animate-in fade-in zoom-in-95 ${meta.tileClass}`}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'backwards', animationDuration: '500ms' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{feature.title}</p>
        {feature.status === 'done' ? (
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
        ) : (
          <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${meta.dotClass}`} />
        )}
      </div>
      <p className="text-[11px] opacity-70 mt-1">{meta.label}</p>
      {expanded && feature.description && (
        <p className="text-xs opacity-80 mt-2 leading-relaxed animate-in fade-in duration-200">
          {feature.description}
        </p>
      )}
    </button>
  );
};

const BlockZone = ({ block, features }: { block: BlockMeta; features: RoadmapFeature[] }) => {
  const done = features.filter((f) => f.status === 'done').length;
  const Icon = block.icon;

  return (
    <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:p-5 transition-shadow hover:shadow-[0_0_30px_-10px_rgba(16,185,129,0.3)]">
      <div className="flex items-center gap-3 mb-4">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <Icon className="w-5 h-5 text-emerald-400" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white leading-tight">{block.title}</h3>
          <p className="text-[11px] text-slate-500">{block.subtitle}</p>
        </div>
        <Badge variant="outline" className="bg-slate-800/60 border-slate-700 text-slate-300 tabular-nums">
          {done}/{features.length}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {features.map((f, i) => (
          <FeatureTile key={f.id} feature={f} index={i} />
        ))}
      </div>
    </div>
  );
};

const FeatureMap = ({ features }: FeatureMapProps) => {
  return (
    <section aria-label="功能地圖">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-1">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">系統功能地圖</h2>
          <p className="text-sm text-slate-500">Feature Map — 點擊方塊查看說明</p>
        </div>
        <Legend />
      </div>

      <div className="mt-6">
        <PipelineStrip />
        <div className="flex flex-col lg:flex-row items-stretch gap-3">
          {BLOCKS.map((block, i) => {
            const blockFeatures = features
              .filter((f) => f.block === block.key)
              .sort((a, b) => a.sort_order - b.sort_order);
            return (
              <div key={block.key} className="contents">
                {i > 0 && (
                  <div aria-hidden className="flex items-center justify-center py-1 lg:py-0">
                    <ArrowRight className="hidden lg:block w-5 h-5 text-emerald-500/60" />
                    <ArrowDown className="lg:hidden w-5 h-5 text-emerald-500/60" />
                  </div>
                )}
                <BlockZone block={block} features={blockFeatures} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeatureMap;
