import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface MenuUploadProps {
  onAnalysisComplete: (ingredients: string[]) => void;
}

const MenuUpload = ({ onAnalysisComplete }: MenuUploadProps) => {
  const { t } = useLanguage();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size cannot exceed 10MB");
        return;
      }
      
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file");
        return;
      }

      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      toast.success("File selected");
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      toast.error("Please select a menu image first");
      return;
    }

    setIsUploading(true);
    
    // Simulate AI analysis process
    setTimeout(() => {
      const mockIngredients = [
        "Beef 2kg",
        "Pork 1.5kg",
        "Chicken 1kg",
        "Fresh Vegetables 3kg",
        "Tomatoes 1kg",
        "Onions 0.5kg",
        "Garlic 0.2kg",
        "Olive Oil 500ml",
        "Soy Sauce 300ml",
        "Rice 5kg"
      ];
      
      onAnalysisComplete(mockIngredients);
      setIsUploading(false);
      toast.success("AI analysis complete!");
    }, 3000);
  };

  return (
    <section id="upload-section" className="py-24">
      <div className="container px-4 mx-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              {t('upload.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('upload.subtitle')}
            </p>
          </div>

          <Card className="p-8 md:p-12 shadow-medium">
            {!previewUrl ? (
              <div className="space-y-6">
                <label htmlFor="menu-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed border-primary/30 rounded-2xl p-12 hover:border-primary/60 hover:bg-accent/50 transition-all duration-300 text-center">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="w-10 h-10 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-semibold">{t('upload.drag')}</p>
                        <p className="text-muted-foreground">{t('upload.or')}</p>
                        <Button variant="outline" size="lg" type="button">
                          <FileImage className="mr-2 h-5 w-5" />
                          {t('upload.select')}
                        </Button>
                        <p className="text-sm text-muted-foreground">{t('upload.support')}</p>
                      </div>
                    </div>
                  </div>
                </label>
                <input
                  id="menu-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative rounded-xl overflow-hidden">
                  <img 
                    src={previewUrl} 
                    alt="Menu preview" 
                    className="w-full h-auto max-h-[500px] object-contain bg-muted"
                  />
                  <div className="absolute top-4 right-4">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl("");
                      }}
                    >
                      {t('upload.remove')}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-accent rounded-lg">
                  <FileImage className="w-6 h-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{selectedFile?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {((selectedFile?.size || 0) / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <Button
                  variant="hero"
                  size="lg"
                  className="w-full text-lg py-6"
                  onClick={handleAnalyze}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t('upload.analyzing')}
                    </>
                  ) : (
                    t('upload.analyze')
                  )}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
};

export default MenuUpload;
