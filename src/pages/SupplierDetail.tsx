import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Phone, Mail, ArrowLeft, Clock, Package, CheckCircle2 } from "lucide-react";
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
      phone: "02-1234-5678",
      email: "contact@freshproduce.com",
      specialties: ["Organic Vegetables", "Fresh Meat", "Imported Ingredients"],
      deliveryTime: "24 hours",
      description: "Leading supplier of fresh organic produce with over 15 years of experience. We pride ourselves on quality and timely delivery.",
      certifications: ["ISO 9001", "HACCP", "Organic Certified"],
      minOrder: "$500",
      paymentTerms: "Net 30"
    },
    {
      id: 2,
      name: "Premium Meat Trading",
      rating: 4.9,
      location: "Industrial Zone",
      phone: "02-8765-4321",
      email: "info@qualitymeat.com",
      specialties: ["Quality Meat", "Frozen Seafood", "Seasonings"],
      deliveryTime: "48 hours",
      description: "Specialized in premium quality meats and seafood. Direct partnerships with top farms ensure the best quality products.",
      certifications: ["ISO 22000", "HACCP", "Halal Certified"],
      minOrder: "$800",
      paymentTerms: "Net 45"
    },
    {
      id: 3,
      name: "Green Farm Direct",
      rating: 4.7,
      location: "Agricultural District",
      phone: "03-9876-5432",
      email: "service@greenfarm.com",
      specialties: ["Organic Vegetables", "Fruits", "Grains"],
      deliveryTime: "24 hours",
      description: "Farm-to-table supplier delivering the freshest organic produce. Supporting local farmers and sustainable agriculture.",
      certifications: ["Organic Certified", "Fair Trade", "Non-GMO"],
      minOrder: "$400",
      paymentTerms: "Net 30"
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
          {/* Header Section */}
          <Card className="p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl md:text-4xl font-bold">{supplier.name}</h1>
                  <div className="flex items-center space-x-1 bg-secondary/20 px-3 py-1 rounded-full">
                    <Star className="w-5 h-5 fill-secondary text-secondary" />
                    <span className="text-lg font-semibold text-secondary">{supplier.rating}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 text-base px-3 py-1">
                  <Clock className="w-4 h-4 mr-1" />
                  {supplier.deliveryTime} {t('supplier.delivery')}
                </Badge>
              </div>
              <Button size="lg" variant="hero" className="w-full md:w-auto">
                <Mail className="w-4 h-4 mr-2" />
                {t('supplier.contact')}
              </Button>
            </div>
          </Card>

          {/* Description */}
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-4">About</h2>
            <p className="text-muted-foreground text-lg leading-relaxed">{supplier.description}</p>
          </Card>

          {/* Contact Information */}
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start space-x-3">
                <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-1">Location</p>
                  <p className="text-muted-foreground">{supplier.location}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Phone className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-1">Phone</p>
                  <p className="text-muted-foreground">{supplier.phone}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-1">Email</p>
                  <p className="text-muted-foreground truncate">{supplier.email}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Specialties */}
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-4">
              <Package className="w-6 h-6 inline-block mr-2" />
              {t('supplier.specialties')}
            </h2>
            <div className="flex flex-wrap gap-3">
              {supplier.specialties.map((specialty, index) => (
                <Badge key={index} variant="outline" className="border-primary/30 text-base px-4 py-2">
                  {specialty}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Certifications & Terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-8">
              <h2 className="text-2xl font-bold mb-4">
                <CheckCircle2 className="w-6 h-6 inline-block mr-2" />
                Certifications
              </h2>
              <div className="space-y-2">
                {supplier.certifications.map((cert, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="text-muted-foreground">{cert}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-8">
              <h2 className="text-2xl font-bold mb-4">Business Terms</h2>
              <div className="space-y-4">
                <div>
                  <p className="font-medium mb-1">Minimum Order</p>
                  <p className="text-muted-foreground text-lg">{supplier.minOrder}</p>
                </div>
                <div>
                  <p className="font-medium mb-1">Payment Terms</p>
                  <p className="text-muted-foreground text-lg">{supplier.paymentTerms}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupplierDetail;
