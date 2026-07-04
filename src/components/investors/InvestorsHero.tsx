import { Progress } from '@/components/ui/progress';
import { STATUS_META, type RoadmapStatus } from './roadmap-config';

interface InvestorsHeroProps {
  overallPercent: number;
  counts: Record<RoadmapStatus, number>;
}

const InvestorsHero = ({ overallPercent, counts }: InvestorsHeroProps) => {
  return (
    <header className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-wrap items-center gap-2.5 mb-10">
        <img src="/icon.png" alt="iFoodmap 食材地圖" className="w-9 h-9 shrink-0" />
        <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
          iFoodmap <span className="text-sm font-normal text-slate-400">食材地圖</span>
        </span>
        <span className="text-[11px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-0.5 whitespace-nowrap">
          Investor Update
        </span>
      </div>

      <p className="text-sm font-medium text-emerald-400 mb-3 tracking-wide">
        Product Roadmap &amp; Progress
      </p>
      <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">系統發展藍圖</h1>
      <p className="text-lg text-slate-400 max-w-2xl mb-10">
        從菜單到食材，AI 驅動的餐飲供應鏈媒合平台。以下即時呈現各系統模組的開發進度。
      </p>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-sm text-slate-400 mb-1">整體完成度</p>
            <p className="text-5xl md:text-6xl font-bold text-emerald-400 tabular-nums">
              {overallPercent}
              <span className="text-2xl md:text-3xl text-emerald-500/70">%</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_META) as RoadmapStatus[]).map((s) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1.5 text-sm border rounded-full px-3 py-1 ${STATUS_META[s].chipClass}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${STATUS_META[s].dotClass}`} />
                {counts[s]} {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </div>
        <Progress value={overallPercent} className="mt-6 h-3 bg-slate-800" />
      </div>
    </header>
  );
};

export default InvestorsHero;
