import { useState } from "react";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import PartnerBrands from "@/components/PartnerBrands";
import BuyerProfiles from "@/components/BuyerProfiles";
import MenuUpload from "@/components/MenuUpload";
import IngredientAnalysis from "@/components/IngredientAnalysis";
import SupplierMatch from "@/components/SupplierMatch";
import Chatbot from "@/components/Chatbot";
import Footer from "@/components/Footer";

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

  const handleChatRequirements = (requirements: string[]) => {
    setIngredients(requirements);
    setShowSuppliers(true);
    setTimeout(() => {
      document.getElementById("analysis-results")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <div className="min-h-screen">
      <Hero />
      <HowItWorks />
      <PartnerBrands />
      <Chatbot onRequirementsSubmit={handleChatRequirements} />
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
      <BuyerProfiles />
      <Footer />
    </div>
  );
};

export default Index;
