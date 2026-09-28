// AI 菜單分析 —— 從原本的訪客首頁搬進餐廳後台。
//
// 重用 Index.tsx 的三個元件(傳 compact,走精簡版外觀),差別在於:
//   · 不需要 ContactGate(已登入,聯絡資訊在 restaurants 表)
//   · 分析結果可以直接一鍵帶到智慧採購建單
//
// 業主嫌原本「太複雜」,所以這頁一次只給一個主要動作:
//   還沒分析 → 只有上傳卡
//   分析完   → 上傳卡收起來,換成食材清單 +「帶到智慧採購」(主)/「尋找供應商」(次)
//   找供應商 → 清單下方列出供應商,「尋找供應商」按鈕收起來
//
// AI 助手泡泡掛在 RestaurantLayout(每頁都有)。使用者在任何一頁用泡泡描述需求,泡泡會
//   navigate("/restaurant/analyze", { state: { chatRequirements, chatMeta } })
// 這頁依 location.key 接住、套用,然後把 state 清掉(重新整理或按上一頁才不會重複套用)。

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import MenuUpload, { type AnalysisMeta } from "@/components/MenuUpload";
import IngredientAnalysis from "@/components/IngredientAnalysis";
import SupplierMatch from "@/components/SupplierMatch";

const scrollTo = (id: string) => {
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, 100);
};

/** 分析結果暫存,讓智慧採購頁可以接手建單 */
export const ANALYSIS_HANDOFF_KEY = "ifm_analysis_handoff";

/** 「牛肉 5kg」→「牛肉」:chatMeta.names 被裁掉時,從需求字串推回品名(供應商媒合、採購交接要用) */
const stripQuantity = (s: string) => s.replace(/\s+\d[\d.,/]*\s*[^\s\d]*$/, "").trim() || s.trim();

/**
 * 讀泡泡帶來的 router state。state 可能為了放進 history 被裁剪過,缺的欄位用預設值;
 * 沒有 chatRequirements 這個欄位(不是泡泡帶來的)就回 null,不碰它。
 */
const readChatHandoff = (state: unknown): { requirements: string[]; meta: AnalysisMeta } | null => {
  if (!state || typeof state !== "object" || !("chatRequirements" in state)) return null;
  const { chatRequirements, chatMeta } = state as { chatRequirements?: unknown; chatMeta?: unknown };
  const cleanList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
      : [];

  const requirements = cleanList(chatRequirements);
  const meta = (chatMeta && typeof chatMeta === "object" ? chatMeta : {}) as { analysisId?: unknown; names?: unknown };
  const names = cleanList(meta.names);

  return {
    requirements,
    meta: {
      analysisId: typeof meta.analysisId === "string" ? meta.analysisId : null,
      names: names.length > 0 ? names : requirements.map(stripQuantity),
    },
  };
};

const RestaurantAnalyzePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const handledKey = useRef<string | null>(null);

  const [ingredients, setIngredients] = useState<string[]>([]);
  const [rawNames, setRawNames] = useState<string[]>([]);
  const [showSuppliers, setShowSuppliers] = useState(false);

  const hasResult = ingredients.length > 0;

  // useCallback 只是讓下面接泡泡的 effect 依賴穩定,邏輯跟原本一樣
  const applyAnalysis = useCallback((list: string[], meta: AnalysisMeta) => {
    setIngredients(list);
    setRawNames(meta.names);
    setShowSuppliers(false);
  }, []);

  const handleAnalysisComplete = (list: string[], meta: AnalysisMeta) => {
    applyAnalysis(list, meta);
    scrollTo("analysis-results");
  };

  // AI 助手泡泡用說的描述需求,結果一樣餵進食材分析
  const handleChatRequirements = useCallback((requirements: string[], meta: AnalysisMeta) => {
    applyAnalysis(requirements, meta);
    scrollTo("analysis-results");
  }, [applyAnalysis]);

  // 泡泡從任何一頁帶需求過來(已經在這頁也一樣,只是 location.key 換新)
  useEffect(() => {
    if (handledKey.current === location.key) return;
    handledKey.current = location.key;

    const handoff = readChatHandoff(location.state);
    if (!handoff) return;
    if (handoff.requirements.length > 0) handleChatRequirements(handoff.requirements, handoff.meta);

    // 套用完就清掉,重新整理或按上一頁才不會再套用一次
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: null },
    );
  }, [location.key, location.state, location.pathname, location.search, location.hash, navigate, handleChatRequirements]);

  // 已登入,不需要留聯絡資訊就能直接看媒合
  const handleFindSuppliers = () => {
    setShowSuppliers(true);
    scrollTo("supplier-section");
  };

  const handleReset = () => {
    setIngredients([]);
    setRawNames([]);
    setShowSuppliers(false);
  };

  const handleToPurchase = () => {
    try {
      sessionStorage.setItem(ANALYSIS_HANDOFF_KEY, JSON.stringify(rawNames.length ? rawNames : ingredients));
    } catch { /* 無痕模式寫不進去就算了,採購頁自己會是空的 */ }
    navigate("/restaurant/purchase");
  };

  return (
    <div className="max-w-3xl space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
          <Sparkles className="h-6 w-6 text-emerald-600" />
          AI 菜單分析
        </h1>
        {hasResult && (
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-600">
            <RotateCcw />
            重新上傳
          </Button>
        )}
      </div>

      {!hasResult && <MenuUpload compact onAnalysisComplete={handleAnalysisComplete} />}

      {hasResult && (
        <div id="analysis-results" className="scroll-mt-4">
          <IngredientAnalysis
            compact
            ingredients={ingredients}
            onFindSuppliers={handleFindSuppliers}
            showFindSuppliers={!showSuppliers}
            primaryAction={
              <Button size="lg" className="px-6" onClick={handleToPurchase}>
                帶到智慧採購
                <ArrowRight />
              </Button>
            }
          />
        </div>
      )}

      {showSuppliers && (
        <div id="supplier-section" className="scroll-mt-4">
          <SupplierMatch compact show names={rawNames} />
        </div>
      )}
    </div>
  );
};

export default RestaurantAnalyzePage;
