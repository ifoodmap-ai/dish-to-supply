import { useState } from "react";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import PartnerBrands from "@/components/PartnerBrands";
import BuyerProfiles from "@/components/BuyerProfiles";
import MenuUpload, { type AnalysisMeta } from "@/components/MenuUpload";
import IngredientAnalysis from "@/components/IngredientAnalysis";
import SupplierMatch from "@/components/SupplierMatch";
import ContactGate from "@/components/ContactGate";
import Chatbot from "@/components/Chatbot";
import Footer from "@/components/Footer";

const scrollTo = (id: string) => {
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, 100);
};

const Index = () => {
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [rawNames, setRawNames] = useState<string[]>([]);
  const [contactDone, setContactDone] = useState(false);
  const [showContactGate, setShowContactGate] = useState(false);
  const [showSuppliers, setShowSuppliers] = useState(false);

  const applyAnalysis = (analyzedIngredients: string[], meta: AnalysisMeta) => {
    setIngredients(analyzedIngredients);
    setAnalysisId(meta.analysisId);
    setRawNames(meta.names);
  };

  const handleAnalysisComplete = (analyzedIngredients: string[], meta: AnalysisMeta) => {
    applyAnalysis(analyzedIngredients, meta);
    scrollTo("analysis-results");
  };

  const handleFindSuppliers = () => {
    if (!contactDone) {
      setShowContactGate(true);
      scrollTo("contact-gate");
      return;
    }
    setShowSuppliers(true);
    scrollTo("supplier-section");
  };

  const handleContactDone = () => {
    setContactDone(true);
    setShowContactGate(false);
    setShowSuppliers(true);
    scrollTo("supplier-section");
  };

  const handleChatRequirements = (requirements: string[], meta: AnalysisMeta) => {
    applyAnalysis(requirements, meta);
    if (!contactDone) {
      setShowContactGate(true);
    } else {
      setShowSuppliers(true);
    }
    scrollTo("analysis-results");
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
      {showContactGate && !contactDone && (
        <div id="contact-gate">
          <ContactGate
            analysisId={analysisId}
            names={rawNames}
            onDone={handleContactDone}
          />
        </div>
      )}
      <div id="supplier-section">
        <SupplierMatch show={showSuppliers} names={rawNames} />
      </div>
      <BuyerProfiles />
      <Footer />
    </div>
  );
};

export default Index;
