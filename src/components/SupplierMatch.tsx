import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Phone, Mail } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Supplier {
  id: number;
  name: string;
  rating: number;
  location: string;
  phone: string;
  email: string;
  specialties: string[];
  deliveryTime: string;
}

interface SupplierMatchProps {
  show: boolean;
}

const SupplierMatch = ({ show }: SupplierMatchProps) => {
  const { t } = useLanguage();
  
  if (!show) return null;

  const mockSuppliers: Supplier[] = [
    {
      id: 1,
      name: "Fresh Harvest Supplies",
      rating: 4.8,
      location: "Downtown District",
      phone: "02-1234-5678",
      email: "contact@freshproduce.com",
      specialties: ["Organic Vegetables", "Fresh Meat", "Imported Ingredients"],
      deliveryTime: "24 hours"
    },
    {
      id: 2,
      name: "Premium Meat Trading",
      rating: 4.9,
      location: "Industrial Zone",
      phone: "02-8765-4321",
      email: "info@qualitymeat.com",
      specialties: ["Quality Meat", "Frozen Seafood", "Seasonings"],
      deliveryTime: "48 hours"
    },
    {
      id: 3,
      name: "Green Farm Direct",
      rating: 4.7,
      location: "Agricultural District",
      phone: "03-9876-5432",
      email: "service@greenfarm.com",
      specialties: ["Organic Vegetables", "Fruits", "Grains"],
      deliveryTime: "24 hours"
    }
  ];

  return (
    <section className="py-16 bg-muted/30">
      <div className="container px-4 mx-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              {t('supplier.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('supplier.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockSuppliers.map((supplier) => (
              <Card key={supplier.id} className="p-6 shadow-soft hover:shadow-medium transition-all duration-300 hover:-translate-y-1">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="text-xl font-bold">{supplier.name}</h3>
                      <div className="flex items-center space-x-1 bg-secondary/20 px-2 py-1 rounded-full">
                        <Star className="w-4 h-4 fill-secondary text-secondary" />
                        <span className="text-sm font-semibold text-secondary">{supplier.rating}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                      {supplier.deliveryTime} {t('supplier.delivery')}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start space-x-2 text-muted-foreground">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{supplier.location}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-muted-foreground">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span>{supplier.phone}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-muted-foreground">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{supplier.email}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t('supplier.specialties')}</p>
                    <div className="flex flex-wrap gap-2">
                      {supplier.specialties.map((specialty, index) => (
                        <Badge key={index} variant="outline" className="border-primary/30">
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Button variant="hero" className="w-full">
                    {t('supplier.contact')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SupplierMatch;
