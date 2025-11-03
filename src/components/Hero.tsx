import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const Hero = () => {
  const scrollToUpload = () => {
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/90 to-background"></div>
      </div>
      
      <div className="container relative z-10 px-4 py-16 mx-auto">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-5xl md:text-7xl font-bold leading-tight">
            <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              AI-Powered Analysis
            </span>
            <br />
            Restaurant Menu Ingredients
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            Upload your menu, AI instantly analyzes ingredient requirements, and automatically matches the best suppliers. Making procurement simpler and more efficient.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button 
              variant="hero" 
              size="lg" 
              className="text-lg px-8 py-6"
              onClick={scrollToUpload}
            >
              Start Analysis Now
              <ArrowRight className="ml-2" />
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="text-lg px-8 py-6 border-primary hover:bg-accent"
            >
              Learn More
            </Button>
          </div>
          
          <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">3 Minutes</div>
              <div className="text-muted-foreground">Analysis Complete</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">98%</div>
              <div className="text-muted-foreground">Recognition Accuracy</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">500+</div>
              <div className="text-muted-foreground">Partner Suppliers</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
