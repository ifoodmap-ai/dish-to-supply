import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

interface Buyer {
  id: string;
  name: string;
  logo: string;
  location: string;
  experience: number;
  rating: number;
  expertise: string[];
  markets: string[];
  brands: string[];
}

const mockBuyers: Buyer[] = [
  {
    id: "1",
    name: "鼎泰豐國際",
    logo: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&h=200&fit=crop",
    location: "台北",
    experience: 15,
    rating: 95,
    expertise: ["中式料理", "麵點", "小籠包"],
    markets: ["台灣", "日本", "美國"],
    brands: ["統一", "大成", "卜蜂", "聯華"]
  },
  {
    id: "2",
    name: "王品餐飲集團",
    logo: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200&h=200&fit=crop",
    location: "台中",
    experience: 20,
    rating: 92,
    expertise: ["西式餐飲", "牛排", "火鍋"],
    markets: ["台灣", "中國", "香港"],
    brands: ["台畜", "義美", "桂冠", "福壽"]
  },
  {
    id: "3",
    name: "饗賓餐旅集團",
    logo: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=200&h=200&fit=crop",
    location: "高雄",
    experience: 12,
    rating: 90,
    expertise: ["自助餐", "國際料理", "宴會餐飲"],
    markets: ["台灣"],
    brands: ["味丹", "泰山", "愛之味", "黑橋牌"]
  }
];

const BuyerProfiles = () => {
  const { t } = useLanguage();

  return (
    <section className="py-16 bg-gradient-to-b from-background to-muted/20">
      <div className="container px-4 mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              {t('buyers.title')}
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t('buyers.subtitle')}
          </p>
        </div>

        <div className="max-w-7xl mx-auto relative px-16">
          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {mockBuyers.map((buyer) => (
                <CarouselItem key={buyer.id} className="pl-4 md:basis-1/2 lg:basis-1/3">
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        {/* Logo */}
                        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary/20">
                          <img 
                            src={buyer.logo} 
                            alt={buyer.name}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {/* Name and Location */}
                        <div>
                          <h3 className="text-xl font-semibold mb-2">{buyer.name}</h3>
                          <div className="flex items-center justify-center gap-1 text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            <span className="text-sm">{buyer.location}</span>
                          </div>
                        </div>

                        {/* Experience and Rating */}
                        <div className="w-full grid grid-cols-2 gap-4 py-4 border-y border-border">
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">
                              {t('buyers.experience')}
                            </div>
                            <div className="text-lg font-semibold">{buyer.experience} {t('buyers.years')}</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">
                              {t('buyers.rating')}
                            </div>
                            <div className="flex items-center justify-center gap-1">
                              <Star className="w-4 h-4 fill-primary text-primary" />
                              <span className="text-lg font-semibold">{buyer.rating}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Expertise */}
                        <div className="w-full">
                          <div className="text-sm text-muted-foreground mb-2">
                            {t('buyers.expertise')}
                          </div>
                          <div className="flex flex-wrap gap-2 justify-center">
                            {buyer.expertise.map((item, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Markets */}
                        <div className="w-full">
                          <div className="text-sm text-muted-foreground mb-2">
                            {t('buyers.markets')}
                          </div>
                          <div className="text-sm font-medium">
                            {buyer.markets.join(' | ')}
                          </div>
                        </div>

                        {/* Brands */}
                        <div className="w-full">
                          <div className="text-sm text-muted-foreground mb-2">
                            {t('buyers.brands')}
                          </div>
                          <div className="flex flex-wrap gap-2 justify-center text-xs text-muted-foreground">
                            {buyer.brands.map((brand, index) => (
                              <span key={index}>{brand}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-0" />
            <CarouselNext className="right-0" />
          </Carousel>
        </div>
      </div>
    </section>
  );
};

export default BuyerProfiles;
