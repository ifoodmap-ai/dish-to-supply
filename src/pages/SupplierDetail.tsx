import { useParams, useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Star, MapPin, Phone, Mail, ArrowLeft, Clock, Package, CheckCircle2, MessageCircle, Search, ShoppingCart, X, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SupplierDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("全部商品");
  const [cart, setCart] = useState<Array<{ id: number; name: string; desc: string; image: string }>>([]);
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Mock supplier data - in production this would come from an API/database
  const mockSuppliers = [
    {
      id: 1,
      name: "Fresh Harvest Supplies",
      rating: 4.8,
      location: "Downtown District",
      address: "200 Market Street, Downtown District",
      phone: "02-1234-5678",
      email: "contact@freshproduce.com",
      lineId: "freshproduce123",
      taxId: "12345678",
      logo: "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=400",
      verified: true,
      features: ["產地直送", "物美價廉", "品質保證"],
      specialties: ["Organic Vegetables", "Fresh Meat", "Imported Ingredients"],
      categories: ["葉菜類", "瓜果類", "根莖類", "菇類", "豆類"],
      deliveryTime: "24 hours",
      description: "Leading supplier of fresh organic produce with over 15 years of experience. We pride ourselves on quality and timely delivery.",
      certifications: ["ISO 9001", "HACCP", "Organic Certified"],
      minOrder: "$500",
      paymentTerms: "Net 30",
      products: [
        { id: 1, name: "水耕小白菜", image: "https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?w=300", desc: "水耕" },
        { id: 2, name: "茼蒿", image: "https://images.unsplash.com/photo-1590165482129-1b8b27698780?w=300", desc: "一般茼蒿" },
        { id: 3, name: "地瓜葉", image: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=300", desc: "溫室地瓜葉" },
        { id: 4, name: "A菜", image: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=300", desc: "尖/圓" }
      ]
    },
    {
      id: 2,
      name: "Premium Meat Trading",
      rating: 4.9,
      location: "Industrial Zone",
      address: "150 Industrial Road, Industrial Zone",
      phone: "02-8765-4321",
      email: "info@qualitymeat.com",
      lineId: "premiummeat456",
      taxId: "87654321",
      logo: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400",
      verified: true,
      features: ["優質肉品", "冷凍配送", "產地認證"],
      specialties: ["Quality Meat", "Frozen Seafood", "Seasonings"],
      categories: ["肉品類", "海鮮類", "調味料"],
      deliveryTime: "48 hours",
      description: "Specialized in premium quality meats and seafood. Direct partnerships with top farms ensure the best quality products.",
      certifications: ["ISO 22000", "HACCP", "Halal Certified"],
      minOrder: "$800",
      paymentTerms: "Net 45",
      products: [
        { id: 1, name: "台灣豬肉", image: "https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=300", desc: "產地認證" },
        { id: 2, name: "澳洲牛肉", image: "https://images.unsplash.com/photo-1588347818036-8fc540e4a0d0?w=300", desc: "進口牛肉" }
      ]
    },
    {
      id: 3,
      name: "Green Farm Direct",
      rating: 4.7,
      location: "Agricultural District",
      address: "88 Farm Road, Agricultural District",
      phone: "03-9876-5432",
      email: "service@greenfarm.com",
      lineId: "greenfarm789",
      taxId: "11223344",
      logo: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400",
      verified: true,
      features: ["有機認證", "農場直送", "無毒栽種"],
      specialties: ["Organic Vegetables", "Fruits", "Grains"],
      categories: ["有機蔬菜", "水果類", "五穀雜糧"],
      deliveryTime: "24 hours",
      description: "Farm-to-table supplier delivering the freshest organic produce. Supporting local farmers and sustainable agriculture.",
      certifications: ["Organic Certified", "Fair Trade", "Non-GMO"],
      minOrder: "$400",
      paymentTerms: "Net 30",
      products: [
        { id: 1, name: "有機高麗菜", image: "https://images.unsplash.com/photo-1594282801901-6e6c22c6c7e7?w=300", desc: "有機認證" },
        { id: 2, name: "有機番茄", image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300", desc: "溫室栽培" }
      ]
    }
  ];

  const supplier = mockSuppliers.find(s => s.id === Number(id));

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    if (!supplier) return [];
    
    return supplier.products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          product.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "全部商品" || supplier.categories.includes(selectedCategory);
      return matchesSearch && matchesCategory;
    });
  }, [supplier, searchQuery, selectedCategory]);

  const addToCart = (product: typeof supplier.products[0]) => {
    if (cart.find(item => item.id === product.id)) {
      toast({
        title: "已在詢價清單中",
        description: "此商品已經在您的詢價清單中",
      });
      return;
    }
    setCart([...cart, product]);
    toast({
      title: "已加入詢價清單",
      description: `${product.name} 已加入詢價清單`,
    });
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const handleSubmitInquiry = async () => {
    if (cart.length === 0) {
      toast({
        title: "詢價清單為空",
        description: "請先將商品加入詢價清單",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast({
        title: "請先登入",
        description: "您需要登入才能提交詢價",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('inquiries')
        .insert({
          user_id: user.id,
          supplier_id: Number(id),
          supplier_name: supplier!.name,
          products: cart,
          message: inquiryMessage,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "詢價已送出",
        description: "供應商將會收到您的詢價通知",
      });

      setCart([]);
      setInquiryMessage("");
      setDialogOpen(false);
    } catch (error) {
      console.error("Error submitting inquiry:", error);
      toast({
        title: "送出失敗",
        description: "請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!supplier) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Supplier Not Found</h2>
          <Button onClick={() => navigate("/")}>Return Home</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container px-4 py-8 mx-auto max-w-6xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('supplier.back') || 'Back'}
        </Button>

        <div className="space-y-6">
          {/* Header Section with Logo */}
          <Card className="p-8">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Logo */}
              <div className="flex-shrink-0">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden bg-muted">
                  <img 
                    src={supplier.logo} 
                    alt={supplier.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Company Info */}
              <div className="flex-1 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-3xl md:text-4xl font-bold">{supplier.name}</h1>
                      {supplier.verified && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          已驗證
                        </Badge>
                      )}
                    </div>
                    {/* Feature Tags */}
                    <div className="flex flex-wrap gap-2">
                      {supplier.features.map((feature, index) => (
                        <Badge key={index} variant="outline" className="border-primary/30">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button size="lg" variant="hero" className="w-full md:w-auto">
                    <Phone className="w-4 h-4 mr-2" />
                    立即連繫
                  </Button>
                </div>

                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 pt-4 border-t">
                  <div className="flex items-start gap-2">
                    <span className="font-medium min-w-[80px]">公司名稱：</span>
                    <span className="text-muted-foreground">{supplier.name}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium min-w-[80px]">統一編號：</span>
                    <span className="text-muted-foreground">{supplier.taxId}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium min-w-[80px]">公司地址：</span>
                    <span className="text-muted-foreground">{supplier.address}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium min-w-[80px]">聯繫電話：</span>
                    <span className="text-muted-foreground">{supplier.phone}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium min-w-[80px]">Line ID：</span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <MessageCircle className="w-4 h-4" />
                      {supplier.lineId}
                    </span>
                  </div>
                </div>

                {/* Categories */}
                <div className="pt-4 border-t">
                  <div className="flex flex-wrap gap-2">
                    {supplier.categories.map((category, index) => (
                      <Badge key={index} variant="secondary" className="text-sm">
                        {category}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Tabs for Content */}
          <Card className="p-8">
            <Tabs defaultValue="products" className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="products">食材目錄</TabsTrigger>
                <TabsTrigger value="certifications">相關證明</TabsTrigger>
              </TabsList>
              
              <TabsContent value="products" className="mt-6">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Category Sidebar */}
                  <Card className="lg:w-64 p-4 h-fit">
                    <h3 className="font-bold mb-4">所有分類</h3>
                    <div className="space-y-2">
                      <Button
                        variant={selectedCategory === "全部商品" ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setSelectedCategory("全部商品")}
                      >
                        全部商品
                      </Button>
                      {supplier.categories.map((category, index) => (
                        <Button
                          key={index}
                          variant={selectedCategory === category ? "default" : "ghost"}
                          className="w-full justify-start"
                          onClick={() => setSelectedCategory(category)}
                        >
                          {category}
                        </Button>
                      ))}
                    </div>
                  </Card>

                  {/* Products Area */}
                  <div className="flex-1 space-y-6">
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="搜尋產品..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">產品列表</h2>
                      <Badge variant="outline">{filteredProducts.length} 項產品</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredProducts.map((product) => (
                        <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                          <div className="aspect-square overflow-hidden bg-muted">
                            <img 
                              src={product.image} 
                              alt={product.name}
                              className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                            />
                          </div>
                          <div className="p-3 space-y-2">
                            <h3 className="font-semibold">{product.name}</h3>
                            <p className="text-sm text-muted-foreground">{product.desc}</p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full"
                              onClick={() => addToCart(product)}
                            >
                              詢價
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>

                    {filteredProducts.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        沒有找到符合的產品
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="certifications" className="mt-6">
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold">
                    <CheckCircle2 className="w-6 h-6 inline-block mr-2" />
                    認證與證明
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Certifications */}
                    <Card className="p-6">
                      <h3 className="text-xl font-semibold mb-4">公司認證</h3>
                      <div className="space-y-3">
                        {supplier.certifications.map((cert, index) => (
                          <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50">
                            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                            <span className="font-medium">{cert}</span>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* Business Terms */}
                    <Card className="p-6">
                      <h3 className="text-xl font-semibold mb-4">交易條件</h3>
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="font-medium mb-1">最低訂購金額</p>
                          <p className="text-lg text-primary font-semibold">{supplier.minOrder}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="font-medium mb-1">付款條件</p>
                          <p className="text-lg text-primary font-semibold">{supplier.paymentTerms}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="font-medium mb-1">配送時間</p>
                          <p className="text-lg text-primary font-semibold">
                            <Clock className="w-4 h-4 inline mr-1" />
                            {supplier.deliveryTime}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Description */}
                  <Card className="p-6">
                    <h3 className="text-xl font-semibold mb-4">公司簡介</h3>
                    <p className="text-muted-foreground leading-relaxed">{supplier.description}</p>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>

      {/* Floating Cart Button */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-6 right-6 rounded-full shadow-lg h-14 w-14 p-0"
          >
            <ShoppingCart className="w-6 h-6" />
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                {cart.length}
              </span>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>詢價清單</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh]">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                詢價清單是空的
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1">
                        <h4 className="font-semibold">{item.name}</h4>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromCart(item.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          {cart.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <div>
                <label className="text-sm font-medium mb-2 block">備註訊息（選填）</label>
                <Textarea
                  placeholder="請輸入詢價相關訊息或需求..."
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  rows={3}
                />
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmitInquiry}
                disabled={isSubmitting}
              >
                {isSubmitting ? "送出中..." : "送出詢價"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierDetail;
