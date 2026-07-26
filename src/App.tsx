import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import SupplierDetail from "./pages/SupplierDetail";
import NotFound from "./pages/NotFound";
import Architecture from "./pages/Architecture";
import InvestorsPage from "./pages/InvestorsPage";
import JoinSupplierPage from "./pages/JoinSupplierPage";
import SuppliersPage from "./pages/SuppliersPage";
import BuyerPortalPage from "./pages/BuyerPortalPage";
import PriceIndexPage from "./pages/PriceIndexPage";

import AdminRoute from "./components/AdminRoute";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AnalysisListPage from "./pages/admin/AnalysisListPage";
import AnalysisDetailPage from "./pages/admin/AnalysisDetailPage";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage";
import AdminOrderDetailPage from "./pages/admin/AdminOrderDetailPage";
import AdminRoadmapPage from "./pages/admin/AdminRoadmapPage";
import AdminApplicationsPage from "./pages/admin/AdminApplicationsPage";
import AdminMatchingPage from "./pages/admin/AdminMatchingPage";
import AdminForecastPage from "./pages/admin/AdminForecastPage";
import AdminBillingPage from "./pages/admin/AdminBillingPage";
import AdminNotificationsPage from "./pages/admin/AdminNotificationsPage";
// 會員管理
import AdminRestaurantsPage from "./pages/admin/AdminRestaurantsPage";
import AdminSuppliersPage from "./pages/admin/AdminSuppliersPage";
import AdminAccountsPage from "./pages/admin/AdminAccountsPage";
// 資料維護
import AdminIngredientsPage from "./pages/admin/AdminIngredientsPage";
import AdminDishMappingPage from "./pages/admin/AdminDishMappingPage";
import AdminSubstitutesPage from "./pages/admin/AdminSubstitutesPage";
import AdminPricesPage from "./pages/admin/AdminPricesPage";
// 營運與品質
import AdminPipelinePage from "./pages/admin/AdminPipelinePage";
import AdminOrderTimelinePage from "./pages/admin/AdminOrderTimelinePage";
import AdminMatchQualityPage from "./pages/admin/AdminMatchQualityPage";
import AdminAiOpsPage from "./pages/admin/AdminAiOpsPage";
import AdminDisputesPage from "./pages/admin/AdminDisputesPage";
import AdminRevenuePage from "./pages/admin/AdminRevenuePage";
// 成長
import AdminGrowthPage from "./pages/admin/AdminGrowthPage";
import AdminCampaignsPage from "./pages/admin/AdminCampaignsPage";

import SupplierRoute from "./components/SupplierRoute";
import SupplierLayout from "./pages/supplier/SupplierLayout";
import SupplierDashboard from "./pages/supplier/SupplierDashboard";
import SupplierOrdersPage from "./pages/supplier/SupplierOrdersPage";
import SupplierShipmentsPage from "./pages/supplier/SupplierShipmentsPage";
import SupplierCatalogPage from "./pages/supplier/SupplierCatalogPage";
import SupplierQuotesPage from "./pages/supplier/SupplierQuotesPage";
import SupplierLogisticsPage from "./pages/supplier/SupplierLogisticsPage";
import SupplierLeadsPage from "./pages/supplier/SupplierLeadsPage";
import SupplierPricingPage from "./pages/supplier/SupplierPricingPage";
import SupplierForecastPage from "./pages/supplier/SupplierForecastPage";
import SupplierCustomersPage from "./pages/supplier/SupplierCustomersPage";
import SupplierReviewsPage from "./pages/supplier/SupplierReviewsPage";

import RestaurantRoute from "./components/RestaurantRoute";
import RestaurantLayout from "./pages/restaurant/RestaurantLayout";
import RestaurantDashboard from "./pages/restaurant/RestaurantDashboard";
import RestaurantMenuPage from "./pages/restaurant/RestaurantMenuPage";
import RestaurantPurchasePage from "./pages/restaurant/RestaurantPurchasePage";
import RestaurantOrdersPage from "./pages/restaurant/RestaurantOrdersPage";
import RestaurantCostsPage from "./pages/restaurant/RestaurantCostsPage";
import RestaurantSuppliersPage from "./pages/restaurant/RestaurantSuppliersPage";
import RestaurantLabPage from "./pages/restaurant/RestaurantLabPage";
import RestaurantTeamPage from "./pages/restaurant/RestaurantTeamPage";
import RestaurantSettingsPage from "./pages/restaurant/RestaurantSettingsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/join" element={<JoinSupplierPage />} />
            <Route path="/my" element={<BuyerPortalPage />} />
            <Route path="/price-index" element={<PriceIndexPage />} />
            <Route path="/supplier/:id" element={<SupplierDetail />} />
            <Route path="/architecture" element={<Architecture />} />
            <Route path="/investors" element={<InvestorsPage />} />

            {/* 餐廳後台 */}
            <Route path="/restaurant" element={<RestaurantRoute><RestaurantLayout /></RestaurantRoute>}>
              <Route index element={<RestaurantDashboard />} />
              <Route path="menu" element={<RestaurantMenuPage />} />
              <Route path="purchase" element={<RestaurantPurchasePage />} />
              <Route path="orders" element={<RestaurantOrdersPage />} />
              <Route path="costs" element={<RestaurantCostsPage />} />
              <Route path="suppliers" element={<RestaurantSuppliersPage />} />
              <Route path="lab" element={<RestaurantLabPage />} />
              <Route path="team" element={<RestaurantTeamPage />} />
              <Route path="settings" element={<RestaurantSettingsPage />} />
            </Route>

            {/* 平台營運後台 */}
            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="pipeline" element={<AdminPipelinePage />} />
              <Route path="analyses" element={<AnalysisListPage />} />
              <Route path="analyses/:id" element={<AnalysisDetailPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="orders/:id" element={<AdminOrderDetailPage />} />
              <Route path="orders/:id/timeline" element={<AdminOrderTimelinePage />} />
              <Route path="matching" element={<AdminMatchingPage />} />
              <Route path="forecast" element={<AdminForecastPage />} />
              {/* 會員 */}
              <Route path="restaurants" element={<AdminRestaurantsPage />} />
              <Route path="suppliers" element={<AdminSuppliersPage />} />
              <Route path="applications" element={<AdminApplicationsPage />} />
              <Route path="accounts" element={<AdminAccountsPage />} />
              {/* 資料維護 */}
              <Route path="ingredients" element={<AdminIngredientsPage />} />
              <Route path="dishes" element={<AdminDishMappingPage />} />
              <Route path="substitutes" element={<AdminSubstitutesPage />} />
              <Route path="prices" element={<AdminPricesPage />} />
              {/* 品質與財務 */}
              <Route path="match-quality" element={<AdminMatchQualityPage />} />
              <Route path="ai-ops" element={<AdminAiOpsPage />} />
              <Route path="disputes" element={<AdminDisputesPage />} />
              <Route path="revenue" element={<AdminRevenuePage />} />
              <Route path="billing" element={<AdminBillingPage />} />
              {/* 成長 */}
              <Route path="growth" element={<AdminGrowthPage />} />
              <Route path="campaigns" element={<AdminCampaignsPage />} />
              <Route path="notifications" element={<AdminNotificationsPage />} />
              <Route path="roadmap" element={<AdminRoadmapPage />} />
            </Route>

            {/* 供應商後台 */}
            <Route path="/supplier" element={<SupplierRoute><SupplierLayout /></SupplierRoute>}>
              <Route index element={<SupplierDashboard />} />
              <Route path="leads" element={<SupplierLeadsPage />} />
              <Route path="orders" element={<SupplierOrdersPage />} />
              <Route path="quotes" element={<SupplierQuotesPage />} />
              <Route path="catalog" element={<SupplierCatalogPage />} />
              <Route path="pricing" element={<SupplierPricingPage />} />
              <Route path="forecast" element={<SupplierForecastPage />} />
              <Route path="customers" element={<SupplierCustomersPage />} />
              <Route path="logistics" element={<SupplierLogisticsPage />} />
              <Route path="shipments" element={<SupplierShipmentsPage />} />
              <Route path="reviews" element={<SupplierReviewsPage />} />
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
