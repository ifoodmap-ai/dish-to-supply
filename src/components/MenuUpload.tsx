import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MenuUploadProps {
  onAnalysisComplete: (ingredients: string[]) => void;
}

const MenuUpload = ({ onAnalysisComplete }: MenuUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("檔案大小不能超過 10MB");
        return;
      }
      
      if (!file.type.startsWith("image/")) {
        toast.error("請上傳圖片檔案");
        return;
      }

      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      toast.success("檔案已選取，點擊「開始分析」進行 AI 分析");
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      toast.error("請先選擇菜單圖片");
      return;
    }

    setIsUploading(true);
    
    // 模擬 AI 分析過程
    setTimeout(() => {
      const mockIngredients = [
        "牛肉 2kg",
        "豬肉 1.5kg",
        "雞肉 1kg",
        "新鮮蔬菜 3kg",
        "番茄 1kg",
        "洋蔥 0.5kg",
        "大蒜 0.2kg",
        "橄欖油 500ml",
        "醬油 300ml",
        "米 5kg"
      ];
      
      onAnalysisComplete(mockIngredients);
      setIsUploading(false);
      toast.success("AI 分析完成！");
    }, 3000);
  };

  return (
    <section id="upload-section" className="py-24">
      <div className="container px-4 mx-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              上傳您的菜單
            </h2>
            <p className="text-xl text-muted-foreground">
              支援 JPG、PNG 等常見圖片格式，檔案大小上限 10MB
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
                        <p className="text-xl font-semibold">點擊或拖曳檔案至此</p>
                        <p className="text-muted-foreground">支援 JPG、PNG 格式</p>
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
                      移除
                    </Button>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-accent rounded-lg">
                  <FileImage className="w-6 h-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{selectedFile?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile?.size || 0 / 1024 / 1024).toFixed(2)} MB
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
                      AI 分析中...
                    </>
                  ) : (
                    "開始 AI 分析"
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
