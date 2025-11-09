import { useLanguage } from "@/contexts/LanguageContext";
import useEmblaCarousel from 'embla-carousel-react';
import AutoScroll from 'embla-carousel-auto-scroll';
import freshDirect from "@/assets/brands/fresh-direct.png";
import farmFresh from "@/assets/brands/farm-fresh.png";
import qualityFoods from "@/assets/brands/quality-foods.png";
import greenValley from "@/assets/brands/green-valley.png";
import metroFoods from "@/assets/brands/metro-foods.png";
import pacificSupply from "@/assets/brands/pacific-supply.png";
import starMarket from "@/assets/brands/star-market.png";
import bestChoice from "@/assets/brands/best-choice.png";

const PartnerBrands = () => {
  const { t } = useLanguage();
  
  const brands = [
    { name: "Fresh Direct", logo: freshDirect },
    { name: "Farm Fresh", logo: farmFresh },
    { name: "Quality Foods", logo: qualityFoods },
    { name: "Green Valley", logo: greenValley },
    { name: "Metro Foods", logo: metroFoods },
    { name: "Pacific Supply", logo: pacificSupply },
    { name: "Star Market", logo: starMarket },
    { name: "Best Choice", logo: bestChoice },
    // Duplicate for seamless loop
    { name: "Fresh Direct", logo: freshDirect },
    { name: "Farm Fresh", logo: farmFresh },
    { name: "Quality Foods", logo: qualityFoods },
    { name: "Green Valley", logo: greenValley },
  ];

  const [emblaRef] = useEmblaCarousel(
    { 
      loop: true,
      align: 'start',
      dragFree: true,
    },
    [AutoScroll({ playOnInit: true, speed: 1 })]
  );

  return (
    <section className="py-16 bg-background border-y border-border">
      <div className="container px-4 mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            {t('partners.title')}
          </h2>
        </div>
        
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {brands.map((brand, index) => (
              <div
                key={index}
                className="flex-[0_0_200px] min-w-0 px-8"
              >
                <div className="flex items-center justify-center h-24 opacity-60 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0">
                  <img
                    src={brand.logo}
                    alt={brand.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PartnerBrands;
