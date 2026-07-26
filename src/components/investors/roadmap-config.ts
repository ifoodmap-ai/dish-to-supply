import { Sparkles, UtensilsCrossed, Truck, Gauge, type LucideIcon } from 'lucide-react';

export type RoadmapStatus = 'done' | 'in_progress' | 'planned';
export type RoadmapBlock = 'ai_matching' | 'restaurant_portal' | 'supplier_portal' | 'procurement';

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

// Order defines the pipeline flow on the map:
//   AI 媒合(需求萃取) → 餐廳端(叫貨收貨) → 供應商端(報價出貨) → 平台營運(監管數據)
export const BLOCKS: BlockMeta[] = [
  { key: 'ai_matching', title: 'AI 媒合引擎', subtitle: 'AI Matching', icon: Sparkles, pipelineLabel: 'AI 媒合' },
  { key: 'restaurant_portal', title: '餐廳端系統', subtitle: 'Restaurant Portal', icon: UtensilsCrossed, pipelineLabel: '餐廳叫貨' },
  { key: 'supplier_portal', title: '供應商系統', subtitle: 'Supplier Portal', icon: Truck, pipelineLabel: '供應商出貨' },
  { key: 'procurement', title: '平台營運後台', subtitle: 'Platform Ops', icon: Gauge, pipelineLabel: '平台營運' },
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
  image_url: string | null = null,
): RoadmapFeature => ({
  id: `fb-${n}`,
  block,
  phase,
  title,
  description,
  status,
  sort_order,
  updated_at: '2026-07-04T00:00:00Z',
  image_url,
});

// Bundled snapshot of the seed data — rendered if the DB fetch fails or the
// table is empty, so investors never see a broken/blank page.
export const FALLBACK_FEATURES: RoadmapFeature[] = [
  fb(1, 'ai_matching', 1, '公開官網與供應商展示', '品牌官網、平台介紹、合作供應商展示與供應商詳情頁', 'done', 1, '/roadmap/home.png'),
  fb(2, 'ai_matching', 1, 'AI 菜單圖片辨識', '上傳菜單照片,Gemini Vision 自動辨識菜色並推算採購食材', 'done', 2, '/roadmap/menu-upload.png'),
  fb(3, 'ai_matching', 1, '對話式需求萃取', '客人用聊天描述需求,AI 自動整理成標準採購清單', 'done', 3, '/roadmap/chatbot.png'),
  fb(4, 'ai_matching', 1, '結構化食材清單', '品名/數量/單位/分類標準化輸出,可直接轉為採購單', 'done', 4, '/roadmap/analysis-detail.png'),
  fb(5, 'ai_matching', 1, '對話自動重新萃取與合併', '對話持續進行時,自動更新並合併食材清單,不漏任何需求', 'done', 5, '/roadmap/analysis-detail.png'),
  fb(6, 'ai_matching', 1, 'AI 客服對話機器人', '全天候智慧客服,引導客人講清楚採購需求', 'done', 6, '/roadmap/chatbot.png'),
  fb(7, 'ai_matching', 3, '供應商自動推薦排序', '依品項、地區與供應能力,自動排序最適合的供應商', 'done', 7, '/roadmap/feat-matching.png'),
  fb(8, 'ai_matching', 3, '媒合信心分數', '每筆媒合附上 AI 信心分數,輔助審核決策', 'done', 8, '/roadmap/feat-matching.png'),
  fb(9, 'ai_matching', 3, '多供應商比價引擎', '同一食材多家供應商報價自動比較,幫買家省成本', 'done', 9, '/roadmap/feat-matching.png'),
  fb(10, 'ai_matching', 4, '需求預測與備貨建議', '依歷史訂單預測採購需求,提前給供應商備貨建議', 'done', 10, '/roadmap/feat-forecast.png'),
  fb(11, 'ai_matching', 1, '買家聯絡資訊擷取', 'AI 分析完成後引導買家留下店名與 LINE/手機,需求不再流失,自動進入後台跟進', 'done', 11, '/roadmap/feat-contact-gate.png'),
  fb(12, 'ai_matching', 3, '買家端即時媒合結果', '買家當場看到真實供應商排名:媒合分數、符合品項數、可供應品項與價格', 'done', 12, '/roadmap/feat-real-match.png'),
  fb(13, 'restaurant_portal', 4, '買家採購入口', '買家帳號:歷史需求、收到的報價、一鍵回購', 'done', 13, '/roadmap/feat-buyer-portal.png'),
  fb(14, 'procurement', 1, '分析紀錄後台管理', '所有 AI 分析需求集中列表、狀態分類與追蹤', 'done', 1, '/roadmap/admin-analyses.png'),
  fb(15, 'procurement', 1, '需求審核流程', '管理員審核 AI 分析結果,一鍵批准發送或拒絕', 'done', 2, '/roadmap/analysis-detail.png'),
  fb(16, 'procurement', 1, '完整對話紀錄檢視', '聊天室式圖文穿插紀錄,圖片燈箱放大檢視', 'done', 3, '/roadmap/analysis-detail.png'),
  fb(17, 'procurement', 1, '買家聯絡資訊管理', '訂單與分析詳情整合買家聯絡方式,方便跟進', 'done', 4, '/roadmap/analysis-detail.png'),
  fb(18, 'procurement', 2, '供應商訂單建立與發送', '審核通過即自動建立訂單並推送給對應供應商', 'done', 5, '/roadmap/admin-orders.png'),
  fb(19, 'procurement', 2, '訂單列表/明細/搜尋', '訂單全生命週期管理,支援搜尋與明細檢視', 'done', 6, '/roadmap/admin-orders.png'),
  fb(20, 'procurement', 3, '線上報價回覆', '供應商線上回報價格,買家即時比較確認', 'done', 7, '/roadmap/feat-quotes.png'),
  fb(21, 'procurement', 3, '下單與付款金流', '線上下單、金流串接與交易保障(沙盒示範版已完成,實際上線待串接金流商)', 'in_progress', 8, '/roadmap/feat-billing.png'),
  fb(22, 'procurement', 4, '對帳與電子發票', '自動對帳結算、電子發票開立(沙盒示範版已完成,實際上線待串接發票商)', 'in_progress', 9, '/roadmap/feat-billing.png'),
  fb(23, 'procurement', 4, '營運數據儀表板', 'GMV、媒合率、回購率等核心指標即時儀表板', 'done', 10, '/roadmap/admin-dashboard.png'),
  fb(24, 'procurement', 3, '入駐申請審核工作流', '後台審核供應商申請,一鍵核准自動建立帳號與供應商資料', 'done', 11, '/roadmap/feat-applications.png'),
  fb(25, 'procurement', 4, '產品轉換漏斗分析', '內建事件追蹤:分析→留聯絡→看媒合→詢價全漏斗即時可視', 'done', 12, '/roadmap/feat-funnel.png'),
  fb(26, 'procurement', 4, '食材價格指數', '彙整平台報價形成台灣食材價格指數,公開發布建立資料資產', 'done', 13, '/roadmap/feat-price-index.png'),
  fb(27, 'supplier_portal', 1, 'Email＋密碼會員認證', '安全的帳號註冊、登入與權限控管', 'done', 1, '/roadmap/auth.png'),
  fb(28, 'supplier_portal', 1, '角色導向登入', '管理員/供應商登入後自動導向各自專屬後台', 'done', 2, '/roadmap/auth.png'),
  fb(29, 'supplier_portal', 2, '供應商接單列表', '供應商專屬入口,即時查看平台派發的新訂單', 'done', 3, '/roadmap/supplier-orders.png'),
  fb(30, 'supplier_portal', 2, '確認出貨流程', '一鍵確認出貨並回報平台,流程透明', 'done', 4, '/roadmap/supplier-orders.png'),
  fb(31, 'supplier_portal', 2, '出貨紀錄查詢', '歷史出貨紀錄與追蹤資訊完整保存', 'done', 5, '/roadmap/supplier-shipments.png'),
  fb(32, 'supplier_portal', 3, '供應商商品目錄管理', '供應商自主上架、管理商品品項與價格', 'done', 6, '/roadmap/supplier-catalog.png'),
  fb(33, 'supplier_portal', 3, '物流追蹤', '出貨後物流狀態即時追蹤與異常提醒', 'done', 7, '/roadmap/feat-logistics.png'),
  fb(34, 'supplier_portal', 4, 'LINE 即時通知', '新訂單、出貨提醒即時 LINE 推播(沙盒示範版已完成,實際上線待 LINE 官方帳號串接)', 'in_progress', 8, '/roadmap/feat-notifications.png'),
  fb(35, 'supplier_portal', 4, '供應商評價系統', '買家評價供應商,建立平台信任機制', 'done', 9, '/roadmap/supplier-reviews.png'),
  fb(36, 'supplier_portal', 3, '供應商自助入駐', '公開申請頁,供應商自助送件,免費上架', 'done', 10, '/roadmap/feat-join.png'),
  fb(37, 'supplier_portal', 3, '供應商公開目錄', '買家可瀏覽全部合作供應商與真實商品型錄', 'done', 11, '/roadmap/feat-suppliers-dir.png'),
];
