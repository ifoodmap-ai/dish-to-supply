import { useState } from 'react';
import { ArrowRight, ArrowDown, CheckCircle2, ChevronRight, ImageOff, ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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

const FeatureTile = ({
  feature,
  index,
  onOpen,
}: {
  feature: RoadmapFeature;
  index: number;
  onOpen: (f: RoadmapFeature) => void;
}) => {
  const meta = STATUS_META[feature.status];

  return (
    <button
      type="button"
      onClick={() => onOpen(feature)}
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
      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] opacity-70">{meta.label}</p>
        {feature.image_url && (
          <ImageIcon className="w-3 h-3 opacity-50" aria-label="有畫面截圖" />
        )}
      </div>
    </button>
  );
};

const BlockZone = ({
  block,
  features,
  onOpen,
}: {
  block: BlockMeta;
  features: RoadmapFeature[];
  onOpen: (f: RoadmapFeature) => void;
}) => {
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
          <FeatureTile key={f.id} feature={f} index={i} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
};

const FeatureModal = ({
  feature,
  onClose,
}: {
  feature: RoadmapFeature | null;
  onClose: () => void;
}) => {
  const meta = feature ? STATUS_META[feature.status] : null;

  return (
    <Dialog open={!!feature} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 text-slate-100 p-0 overflow-hidden">
        {feature && meta && (
          <div>
            <div className="p-5 border-b border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-0.5 ${meta.chipClass}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${meta.dotClass}`} />
                  {meta.label}
                </span>
                <span className="text-xs text-slate-500">Phase {feature.phase}</span>
              </div>
              <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
              {feature.description && (
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{feature.description}</p>
              )}
            </div>
            <div className="bg-slate-950/60 p-5">
              {feature.image_url ? (
                <img
                  src={feature.image_url}
                  alt={feature.title}
                  className="w-full rounded-lg border border-slate-800"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-600 border border-dashed border-slate-700 rounded-lg">
                  {feature.status === 'done' ? (
                    <>
                      <ImageOff className="w-8 h-8" />
                      <p className="text-sm">尚未上傳畫面截圖</p>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-8 h-8" />
                      <p className="text-sm">
                        {feature.status === 'in_progress' ? '功能開發中' : '功能規劃中'}，畫面即將推出
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const FeatureMap = ({ features }: FeatureMapProps) => {
  const [selected, setSelected] = useState<RoadmapFeature | null>(null);

  return (
    <section aria-label="功能地圖">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-1">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">系統功能地圖</h2>
          <p className="text-sm text-slate-500">Feature Map — 點擊方塊查看畫面與說明</p>
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
                <BlockZone block={block} features={blockFeatures} onOpen={setSelected} />
              </div>
            );
          })}
        </div>
      </div>

      <FeatureModal feature={selected} onClose={() => setSelected(null)} />
    </section>
  );
};

export default FeatureMap;
