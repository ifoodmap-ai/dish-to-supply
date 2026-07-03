import { Progress } from '@/components/ui/progress';
import { PHASES, type RoadmapFeature } from './roadmap-config';

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

const PhaseTimeline = ({ features }: PhaseTimelineProps) => {
  return (
    <section aria-label="發展階段">
      <h2 className="text-2xl font-bold text-white mb-1">發展階段</h2>
      <p className="text-sm text-slate-500 mb-6">Development Phases</p>

      <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* connecting line (desktop, decorative) */}
        <div aria-hidden className="hidden lg:block absolute top-9 left-8 right-8 h-px bg-slate-800" />

        {PHASES.map((p, idx) => {
          const inPhase = features.filter((f) => f.phase === p.phase);
          const done = inPhase.filter((f) => f.status === 'done').length;
          const inProgress = inPhase.filter((f) => f.status === 'in_progress').length;
          const pct = inPhase.length > 0 ? Math.round((done / inPhase.length) * 100) : 0;
          const state = phaseState(done, inProgress, inPhase.length);

          return (
            <div
              key={p.phase}
              className="relative rounded-xl border border-slate-800 bg-slate-900/60 p-5 animate-in fade-in slide-in-from-bottom-3"
              style={{ animationDelay: `${idx * 120}ms`, animationFillMode: 'backwards', animationDuration: '600ms' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-emerald-400 text-sm font-bold border border-slate-700">
                  {p.phase}
                </span>
                <span className={`text-xs border rounded-full px-2.5 py-0.5 ${state.cls}`}>{state.label}</span>
              </div>
              <p className="text-[11px] text-slate-500 tracking-wide mb-1">{p.subtitle}</p>
              <h3 className="text-base font-semibold text-white mb-2">{p.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4 min-h-[3rem]">{p.tagline}</p>
              <Progress value={pct} className="h-1.5 bg-slate-800" />
              <p className="text-xs text-slate-500 mt-2 tabular-nums">
                {done}/{inPhase.length} 完成
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default PhaseTimeline;
