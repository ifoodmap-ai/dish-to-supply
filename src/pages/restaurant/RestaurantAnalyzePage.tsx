// AI 菜單分析 —— 從原本的訪客首頁搬進餐廳後台。
//
// 重用 Index.tsx 既有的三個元件與狀態機,差別在於:
//   · 不需要 ContactGate(已登入,聯絡資訊在 restaurants 表)
//   · 分析結果可以直接一鍵帶到智慧採購建單

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MenuUpload, { type AnalysisMeta } from "@/components/MenuUpload";
import IngredientAnalysis from "@/components/IngredientAnalysis";
import SupplierMatch from "@/components/SupplierMatch";
import Chatbot from "@/components/Chatbot";
import { useRestaurant } from "@/components/RestaurantRoute";

const scrollTo = (id: string) => {
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, 100);
};

/** 分析結果暫存,讓智慧採購頁可以接手建單 */
export const ANALYSIS_HANDOFF_KEY = "ifm_analysis_handoff";

const RestaurantAnalyzePage = () => {
  const account = useRestaurant();
  const navigate = useNavigate();

  const [ingredients, setIngredients] = useState<string[]>([]);
  const [rawNames, setRawNames] = useState<string[]>([]);
  const [showSuppliers, setShowSuppliers] = useState(false);

  const applyAnalysis = (list: string[], meta: AnalysisMeta) => {
    setIngredients(list);
    setRawNames(meta.names);
    setShowSuppliers(false);
  };

  const handleAnalysisComplete = (list: string[], meta: AnalysisMeta) => {
    applyAnalysis(list, meta);
    scrollTo("analysis-results");
  };

  const handleChatRequirements = (requirements: string[], meta: AnalysisMeta) => {
    applyAnalysis(requirements, meta);
    scrollTo("analysis-results");
  };

  // 已登入,不需要留聯絡資訊就能直接看媒合
  const handleFindSuppliers = () => {
    setShowSuppliers(true);
    scrollTo("supplier-section");
  };

  const handleToPurchase = () => {
    try {
      sessionStorage.setItem(ANALYSIS_HANDOFF_KEY, JSON.stringify(rawNames.length ? rawNames : ingredients));
    } catch { /* 無痕模式寫不進去就算了,採購頁自己會是空的 */ }
    navigate("/restaurant/purchase");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-emerald-600" />
          AI 菜單分析
        </h1>
        <p className="text-slate-500 mt-1">
          上傳 {account.restaurant_name} 的菜單照片,AI 自動辨識菜色並推算需要採購的食材,再媒合最適合的供應商
        </p>
      </div>

      <MenuUpload onAnalysisComplete={handleAnalysisComplete} />

      <div id="analysis-results">
        <IngredientAnalysis ingredients={ingredients} onFindSuppliers={handleFindSuppliers} />
      </div>

      {ingredients.length > 0 && (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-emerald-200 bg-emerald-50/60">
          <div>
            <p className="font-medium text-slate-900">要把這些食材變成採購單嗎?</p>
            <p className="text-sm text-slate-600">帶到智慧採購頁,可調整數量後送出給供應商報價</p>
          </div>
          <Button onClick={handleToPurchase} className="shrink-0">
            帶到智慧採購
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </Card>
      )}

      <div id="supplier-section">
        <SupplierMatch show={showSuppliers} names={rawNames} />
      </div>

      <Chatbot onRequirementsSubmit={handleChatRequirements} />
    </div>
  );
};

export default RestaurantAnalyzePage;
