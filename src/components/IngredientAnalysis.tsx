import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShoppingCart } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface IngredientAnalysisProps {
  ingredients: string[];
  onFindSuppliers: () => void;
}

const IngredientAnalysis = ({ ingredients, onFindSuppliers }: IngredientAnalysisProps) => {
  const { t } = useLanguage();
  
  if (ingredients.length === 0) return null;

  return (
    <section className="py-16">
      <div className="container px-4 mx-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              {t('analysis.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              AI has identified the following ingredient requirements
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
