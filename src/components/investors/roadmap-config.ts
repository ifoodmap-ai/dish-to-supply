import { Sparkles, ClipboardCheck, Truck, type LucideIcon } from 'lucide-react';

export type RoadmapStatus = 'done' | 'in_progress' | 'planned';
export type RoadmapBlock = 'ai_matching' | 'procurement' | 'supplier_portal';

export interface RoadmapFeature {
  id: string;
  block: RoadmapBlock;
  phase: number;
  title: string;
  description: string | null;
  status: RoadmapStatus;
  sort_order: number;
  updated_at: string;
  image_url?: string | null;
}

export interface PhaseMeta {
  phase: number;
  title: string;
  subtitle: string;
  tagline: string;
}

export const PHASES: PhaseMeta[] = [
  { phase: 1, title: '核心體驗與 AI 基礎', subtitle: 'Phase 1 · Foundation', tagline: 'AI 需求萃取 + 審核後台,打通從對話到採購單的第一哩路' },
  { phase: 2, title: '採購營運閉環', subtitle: 'Phase 2 · Operations', tagline: '訂單派發 → 供應商接單 → 出貨回報,完整供應鏈閉環' },
  { phase: 3, title: '智慧媒合與交易', subtitle: 'Phase 3 · Marketplace', tagline: '自動推薦、比價、報價與金流,平台開始產生交易價值' },
  { phase: 4, title: '規模化與生態系', subtitle: 'Phase 4 · Scale', tagline: '數據儀表板、通知與評價體系,建立網路效應' },
];

export interface BlockMeta {
  key: RoadmapBlock;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  pipelineLabel: string;
}

// Order defines the pipeline flow on the map: AI 媒合 → 採購 → 供應商
export const BLOCKS: BlockMeta[] = [
  { key: 'ai_matching', title: 'AI 媒合功能', subtitle: 'AI Matching', icon: Sparkles, pipelineLabel: 'AI 媒合' },
  { key: 'procurement', title: '採購系統', subtitle: 'Procurement', icon: ClipboardCheck, pipelineLabel: '採購審核' },
  { key: 'supplier_portal', title: '供應商系統', subtitle: 'Supplier Portal', icon: Truck, pipelineLabel: '供應商出貨' },
];

export interface StatusMeta {
  label: string;
  dotClass: string;
  tileClass: string;
  chipClass: string;
}

export const STATUS_META: Record<RoadmapStatus, StatusMeta> = {
  done: {
    label: '已完成',
    dotClass: 'bg-emerald-400',
    tileClass: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-50 hover:bg-emerald-500/25',
    chipClass: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  },
  in_progress: {
    label: '開發中',
    dotClass: 'bg-amber-400 animate-pulse',
    tileClass: 'bg-amber-500/10 border-amber-400/40 text-amber-50 hover:bg-amber-500/20',
    chipClass: 'bg-amber-500/10 border-amber-400/40 text-amber-300',
  },
  planned: {
    label: '規劃中',
    dotClass: 'border border-slate-500 bg-transparent',
    tileClass: 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800',
    chipClass: 'bg-slate-800/60 border-slate-700 text-slate-400',
  },
};

const fb = (
  n: number,
  block: RoadmapBlock,
  phase: number,
  title: string,
  description: string,
  status: RoadmapStatus,
  sort_order: number,
): RoadmapFeature => ({
  id: `fb-${n}`,
  block,
  phase,
  title,
  description,
  status,
  sort_order,
  updated_at: '2026-07-02T00:00:00Z',
});

// Bundled snapshot of the seed data — rendered if the DB fetch fails or the
// table is empty, so investors never see a broken/blank page.
export const FALLBACK_FEATURES: RoadmapFeature[] = [
  fb(1, 'ai_matching', 1, '公開官網與供應商展示', '品牌官網、平台介紹、合作供應商展示與供應商詳情頁', 'done', 1),
  fb(2, 'ai_matching', 1, 'AI 菜單圖片辨識', '上傳菜單照片,Gemini Vision 自動辨識菜色並推算採購食材', 'done', 2),
  fb(3, 'ai_matching', 1, '對話式需求萃取', '客人用聊天描述需求,AI 自動整理成標準採購清單', 'done', 3),
  fb(4, 'ai_matching', 1, '結構化食材清單', '品名/數量/單位/分類標準化輸出,可直接轉為採購單', 'done', 4),
  fb(5, 'ai_matching', 1, '對話自動重新萃取與合併', '對話持續進行時,自動更新並合併食材清單,不漏任何需求', 'done', 5),
  fb(6, 'ai_matching', 1, 'AI 客服對話機器人', '全天候智慧客服,引導客人講清楚採購需求', 'done', 6),
  fb(7, 'ai_matching', 3, '供應商自動推薦排序', '依品項、地區與供應能力,自動排序最適合的供應商', 'in_progress', 7),
  fb(8, 'ai_matching', 3, '媒合信心分數', '每筆媒合附上 AI 信心分數,輔助審核決策', 'planned', 8),
  fb(9, 'ai_matching', 3, '多供應商比價引擎', '同一食材多家供應商報價自動比較,幫買家省成本', 'planned', 9),
  fb(10, 'ai_matching', 4, '需求預測與備貨建議', '依歷史訂單預測採購需求,提前給供應商備貨建議', 'planned', 10),
  fb(11, 'procurement', 1, '分析紀錄後台管理', '所有 AI 分析需求集中列表、狀態分類與追蹤', 'done', 1),
  fb(12, 'procurement', 1, '需求審核流程', '管理員審核 AI 分析結果,一鍵批准發送或拒絕', 'done', 2),
  fb(13, 'procurement', 1, '完整對話紀錄檢視', '聊天室式圖文穿插紀錄,圖片燈箱放大檢視', 'done', 3),
  fb(14, 'procurement', 1, '買家聯絡資訊管理', '訂單與分析詳情整合買家聯絡方式,方便跟進', 'done', 4),
  fb(15, 'procurement', 2, '供應商訂單建立與發送', '審核通過即自動建立訂單並推送給對應供應商', 'done', 5),
  fb(16, 'procurement', 2, '訂單列表/明細/搜尋', '訂單全生命週期管理,支援搜尋與明細檢視', 'done', 6),
  fb(17, 'procurement', 3, '線上報價回覆', '供應商線上回報價格,買家即時比較確認', 'in_progress', 7),
  fb(18, 'procurement', 3, '下單與付款金流', '線上下單、金流串接與交易保障', 'planned', 8),
  fb(19, 'procurement', 4, '對帳與電子發票', '自動對帳結算、電子發票開立', 'planned', 9),
  fb(20, 'procurement', 4, '營運數據儀表板', 'GMV、媒合率、回購率等核心指標即時儀表板', 'planned', 10),
  fb(21, 'supplier_portal', 1, 'Email＋密碼會員認證', '安全的帳號註冊、登入與權限控管', 'done', 1),
  fb(22, 'supplier_portal', 1, '角色導向登入', '管理員/供應商登入後自動導向各自專屬後台', 'done', 2),
  fb(23, 'supplier_portal', 2, '供應商接單列表', '供應商專屬入口,即時查看平台派發的新訂單', 'done', 3),
  fb(24, 'supplier_portal', 2, '確認出貨流程', '一鍵確認出貨並回報平台,流程透明', 'done', 4),
  fb(25, 'supplier_portal', 2, '出貨紀錄查詢', '歷史出貨紀錄與追蹤資訊完整保存', 'done', 5),
  fb(26, 'supplier_portal', 3, '供應商商品目錄管理', '供應商自主上架、管理商品品項與價格', 'in_progress', 6),
  fb(27, 'supplier_portal', 3, '物流追蹤', '出貨後物流狀態即時追蹤與異常提醒', 'planned', 7),
  fb(28, 'supplier_portal', 4, 'LINE 即時通知', '新訂單、出貨提醒即時 LINE 推播', 'planned', 8),
  fb(29, 'supplier_portal', 4, '供應商評價系統', '買家評價供應商,建立平台信任機制', 'planned', 9),
];
