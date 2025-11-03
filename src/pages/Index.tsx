import { useState } from "react";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import MenuUpload from "@/components/MenuUpload";
import IngredientAnalysis from "@/components/IngredientAnalysis";
import SupplierMatch from "@/components/SupplierMatch";

const Index = () => {
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [showSuppliers, setShowSuppliers] = useState(false);

  const handleAnalysisComplete = (analyzedIngredients: string[]) => {
    setIngredients(analyzedIngredients);
    setTimeout(() => {
      document.getElementById("analysis-results")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleFindSuppliers = () => {
    setShowSuppliers(true);
    setTimeout(() => {
      document.getElementById("supplier-section")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <div className="min-h-screen">
      <Hero />
      <HowItWorks />
      <MenuUpload onAnalysisComplete={handleAnalysisComplete} />
      <div id="analysis-results">
        <IngredientAnalysis 
          ingredients={ingredients} 
          onFindSuppliers={handleFindSuppliers}
        />
      </div>
      <div id="supplier-section">
        <SupplierMatch show={showSuppliers} />
      </div>
    </div>
  );
};

export default Index;
