import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShoppingCart, Store } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface IngredientAnalysisProps {
  ingredients: string[];
  onFindSuppliers: () => void;
  /**
   * 精簡版(餐廳後台「AI 菜單分析」用):拿掉行銷頁的大標題與大留白,食材改成可換行的小標籤,
   * 文案一律繁中。不傳 = 原本訪客首頁的樣子,完全不變。
   */
  compact?: boolean;
  /** 只在 compact 時有作用:按鈕列最前面的主要動作(例如「帶到智慧採購」) */
  primaryAction?: React.ReactNode;
  /** 只在 compact 時有作用:false = 收起「尋找供應商」按鈕(例如供應商已經列出來了)。預設 true */
  showFindSuppliers?: boolean;
}

const IngredientAnalysis = ({
  ingredients,
  onFindSuppliers,
  compact = false,
  primaryAction,
  showFindSuppliers = true,
}: IngredientAnalysisProps) => {
  const { t } = useLanguage();
  
  if (ingredients.length === 0) return null;

  if (compact) {
    return (
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="text-lg font-semibold">已識別 {ingredients.length} 項食材</h2>
        </div>

        <ul className="flex flex-wrap gap-2">
          {ingredients.map((ingredient, index) => (
            <li key={index} className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium">
              {ingredient}
            </li>
          ))}
        </ul>

        {(primaryAction || showFindSuppliers) && (
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
            {primaryAction}
            {showFindSuppliers && (
              <Button variant="outline" size="lg" className="px-6" onClick={onFindSuppliers}>
                <Store />
                尋找供應商
              </Button>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <section className="py-16">
      <div className="container px-4 mx-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              {t('analysis.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('analysis.subtitle')}
            </p>
          </div>

          <Card className="p-8 shadow-medium">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ingredients.map((ingredient, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-3 p-4 bg-accent rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="font-medium">{ingredient}</span>
                  </div>
                ))}
              </div>

              <div className="pt-6 border-t border-border">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-center sm:text-left">
                    <p className="text-sm text-muted-foreground">Total Identified</p>
                    <p className="text-2xl font-bold text-primary">{ingredients.length} Ingredients</p>
                  </div>
                  <Button
                    variant="hero"
                    size="lg"
                    onClick={onFindSuppliers}
                    className="text-lg px-8 py-6"
                  >
                    <ShoppingCart className="mr-2" />
                    {t('analysis.find')}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default IngredientAnalysis;
