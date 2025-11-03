import { Upload, Sparkles, Users } from "lucide-react";
import uploadIcon from "@/assets/upload-icon.png";
import aiIcon from "@/assets/ai-icon.png";
import matchIcon from "@/assets/match-icon.png";

const HowItWorks = () => {
  const steps = [
    {
      number: "01",
      title: "上傳菜單",
      description: "支援圖片格式，一鍵上傳您的餐廳菜單",
      icon: Upload,
      image: uploadIcon,
      color: "from-primary to-primary-glow"
    },
    {
      number: "02",
      title: "AI 智能分析",
      description: "先進的 AI 技術即時識別菜單中的所有食材需求",
      icon: Sparkles,
      image: aiIcon,
      color: "from-secondary to-secondary/80"
    },
    {
      number: "03",
      title: "供應商媒合",
      description: "自動配對最適合的食材供應商，提供最佳報價",
      icon: Users,
      image: matchIcon,
      color: "from-primary to-primary-glow"
    }
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container px-4 mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-4xl md:text-5xl font-bold">
            運作流程
          </h2>
          <p className="text-xl text-muted-foreground">
            三個簡單步驟，輕鬆完成食材採購媒合
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div 
              key={index}
              className="relative group"
            >
              <div className="bg-card rounded-2xl p-8 shadow-soft hover:shadow-medium transition-all duration-300 hover:-translate-y-2 border border-border">
                <div className="space-y-6">
                  <div className="flex items-start justify-between">
                    <span className={`text-6xl font-bold bg-gradient-to-br ${step.color} bg-clip-text text-transparent`}>
                      {step.number}
                    </span>
                    <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
                      <step.icon className="w-8 h-8 text-primary" />
                    </div>
                  </div>
                  
                  <div className="w-20 h-20 mx-auto">
                    <img 
                      src={step.image} 
                      alt={step.title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold">{step.title}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              </div>
              
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-4 transform translate-x-full -translate-y-1/2 z-10">
                  <div className="w-8 h-0.5 bg-gradient-to-r from-primary to-transparent"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
