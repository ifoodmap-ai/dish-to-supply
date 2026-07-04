import { useState } from 'react';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  BLOCKS,
  PHASES,
  STATUS_META,
  type PhaseMeta,
  type RoadmapFeature,
} from './roadmap-config';

interface PhaseTimelineProps {
  features: RoadmapFeature[];
}

const phaseState = (done: number, inProgress: number, total: number) => {
  if (total > 0 && done === total)
    return { label: '已完成', cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' };
  if (done > 0 || inProgress > 0)
    return { label: '進行中', cls: 'bg-amber-500/10 border-amber-400/40 text-amber-300' };
  return { label: '規劃中', cls: 'bg-slate-800/60 border-slate-700 text-slate-400' };
};

const PhaseCard = ({
  phase,
  inPhase,
  index,
}: {
  phase: PhaseMeta;
  inPhase: RoadmapFeature[];
  index: number;
}) => {
  const [open, setOpen] = useState(false);
  const done = inPhase.filter((f) => f.status === 'done').length;
  const inProgress = inPhase.filter((f) => f.status === 'in_progress').length;
  const pct = inPhase.length > 0 ? Math.round((done / inPhase.length) * 100) : 0;
  const state = phaseState(done, inProgress, inPhase.length);

  return (
    <div
      className="relative rounded-xl border border-slate-800 bg-slate-900/60 animate-in fade-in slide-in-from-bottom-3"
      style={{ animationDelay: `${index * 120}ms`, animationFillMode: 'backwards', animationDuration: '600ms' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left p-5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-emerald-400 text-sm font-bold border border-slate-700">
            {phase.phase}
          </span>
          <span className={`text-xs border rounded-full px-2.5 py-0.5 ${state.cls}`}>{state.label}</span>
        </div>
        <p className="text-[11px] text-slate-500 tracking-wide mb-1">{phase.subtitle}</p>
        <h3 className="text-base font-semibold text-white mb-2">{phase.title}</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-4 min-h-[3rem]">{phase.tagline}</p>
        <Progress value={pct} className="h-1.5 bg-slate-800" />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-slate-500 tabular-nums">
            {done}/{inPhase.length} 完成
          </p>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400/90">
            {open ? '收合' : '查看細項'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 -mt-1 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {BLOCKS.map((block) => {
            const items = inPhase
              .filter((f) => f.block === block.key)
              .sort((a, b) => a.sort_order - b.sort_order);
            if (items.length === 0) return null;
            return (
              <div key={block.key} className="border-t border-slate-800 pt-3">
                <p className="text-[11px] font-medium text-slate-500 mb-2">{block.title}</p>
                <ul className="space-y-2">
                  {items.map((f) => {
                    const meta = STATUS_META[f.status];
                    return (
                      <li key={f.id} className="flex items-start gap-2">
                        {f.status === 'done' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
                        ) : (
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${meta.dotClass}`} />
                        )}
                        <span
                          className={`text-xs leading-snug ${
                            f.status === 'done' ? 'text-slate-200' : 'text-slate-400'
                          }`}
                        >
                          {f.title}
                          <span className="text-slate-600"> · {meta.label}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PhaseTimeline = ({ features }: PhaseTimelineProps) => {
  return (
    <section aria-label="發展階段">
      <h2 className="text-2xl font-bold text-white mb-1">發展階段</h2>
      <p className="text-sm text-slate-500 mb-6">Development Phases — 點擊卡片查看完成細項</p>

      <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {/* connecting line (desktop, decorative) */}
        <div aria-hidden className="hidden lg:block absolute top-9 left-8 right-8 h-px bg-slate-800" />

        {PHASES.map((p, idx) => (
          <PhaseCard
            key={p.phase}
            phase={p}
            index={idx}
            inPhase={features.filter((f) => f.phase === p.phase)}
          />
        ))}
      </div>
    </section>
  );
};

export default PhaseTimeline;
