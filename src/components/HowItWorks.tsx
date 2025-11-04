import { Upload, Sparkles, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import uploadIcon from "@/assets/upload-icon.png";
import aiIcon from "@/assets/ai-icon.png";
import matchIcon from "@/assets/match-icon.png";

const HowItWorks = () => {
  const { t } = useLanguage();
  
  const steps = [
    {
      number: "01",
      title: t('how.step1.title'),
      description: t('how.step1.desc'),
      icon: Upload,
      image: uploadIcon,
      color: "from-primary to-primary-glow"
    },
    {
      number: "02",
      title: t('how.step2.title'),
      description: t('how.step2.desc'),
      icon: Sparkles,
      image: aiIcon,
      color: "from-secondary to-secondary/80"
    },
    {
      number: "03",
      title: t('how.step3.title'),
      description: t('how.step3.desc'),
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
            {t('how.title')}
          </h2>
          <p className="text-xl text-muted-foreground">
            {t('how.subtitle')}
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
