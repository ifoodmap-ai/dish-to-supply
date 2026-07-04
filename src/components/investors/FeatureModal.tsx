import { ImageOff, ImageIcon } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { STATUS_META, type RoadmapFeature } from './roadmap-config';

interface FeatureModalProps {
  feature: RoadmapFeature | null;
  onClose: () => void;
}

const FeatureModal = ({ feature, onClose }: FeatureModalProps) => {
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

export default FeatureModal;
