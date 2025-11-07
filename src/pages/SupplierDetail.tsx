import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, MapPin, Phone, Mail, ArrowLeft, Clock, Package, CheckCircle2, MessageCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const SupplierDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

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
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">產品列表</h2>
                    <Badge variant="outline">{supplier.products.length} 項產品</Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {supplier.products.map((product) => (
                      <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                        <div className="aspect-square overflow-hidden bg-muted">
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                        <div className="p-3 space-y-1">
                          <h3 className="font-semibold">{product.name}</h3>
                          <p className="text-sm text-muted-foreground">{product.desc}</p>
                        </div>
                      </Card>
                    ))}
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
    </div>
  );
};

export default SupplierDetail;
