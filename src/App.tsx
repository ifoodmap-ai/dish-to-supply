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
import AdminRoute from "./components/AdminRoute";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AnalysisListPage from "./pages/admin/AnalysisListPage";
import AnalysisDetailPage from "./pages/admin/AnalysisDetailPage";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage";
import AdminOrderDetailPage from "./pages/admin/AdminOrderDetailPage";
import AdminRoadmapPage from "./pages/admin/AdminRoadmapPage";
import SupplierRoute from "./components/SupplierRoute";
import SupplierLayout from "./pages/supplier/SupplierLayout";
import SupplierOrdersPage from "./pages/supplier/SupplierOrdersPage";
import SupplierShipmentsPage from "./pages/supplier/SupplierShipmentsPage";
import SupplierCatalogPage from "./pages/supplier/SupplierCatalogPage";

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
            <Route path="/supplier/:id" element={<SupplierDetail />} />
            <Route path="/architecture" element={<Architecture />} />
            <Route path="/investors" element={<InvestorsPage />} />
            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="analyses" element={<AnalysisListPage />} />
              <Route path="analyses/:id" element={<AnalysisDetailPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="orders/:id" element={<AdminOrderDetailPage />} />
              <Route path="roadmap" element={<AdminRoadmapPage />} />
            </Route>
            <Route path="/supplier" element={<SupplierRoute><SupplierLayout /></SupplierRoute>}>
              <Route index element={<SupplierOrdersPage />} />
              <Route path="catalog" element={<SupplierCatalogPage />} />
              <Route path="shipments" element={<SupplierShipmentsPage />} />
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
