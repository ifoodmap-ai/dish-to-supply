import { Link } from "react-router-dom";
import { Lock, FileText, HelpCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const Footer = () => {
  const { language } = useLanguage();
  const isZh = language === "zh";

  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">

          {/* Col 1: Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🍽️</span>
              <span className="text-white font-bold text-lg tracking-tight">ifoodmap</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              {isZh
                ? "AI 食材媒合平台\n讓菜單自動變成採購訂單"
                : "AI-powered ingredient matching\nthat turns menus into purchase orders"}
            </p>
          </div>

          {/* Col 2: Product */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">
              {isZh ? "產品" : "Product"}
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="#how-it-works"
                  className="flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  <HelpCircle size={14} />
                  {isZh ? "使用說明" : "How It Works"}
                </a>
              </li>
              <li>
                <Link
                  to="/architecture"
                  className="flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  <FileText size={14} />
                  {isZh ? "架構說明" : "Architecture"}
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Internal Systems */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">
              {isZh ? "內部系統" : "Internal"}
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  to="/admin"
                  className="flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors group"
                >
                  <Lock size={14} className="text-emerald-600 group-hover:text-emerald-400 transition-colors" />
                  <span>{isZh ? "管理員後台" : "Admin Portal"}</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/supplier"
                  className="flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors group"
                >
                  <Lock size={14} className="text-emerald-600 group-hover:text-emerald-400 transition-colors" />
                  <span>{isZh ? "供應商後台" : "Supplier Portal"}</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>© 2026 ifoodmap. {isZh ? "版權所有" : "All rights reserved."}</span>
          <span className="text-slate-600">dish-to-supply · Powered by AI</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
