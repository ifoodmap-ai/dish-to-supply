import type { ReactNode } from "react";

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mb-10">
    <h2 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">{title}</h2>
    {children}
  </div>
);

const Tag = ({ color, children }: { color: string; children: ReactNode }) => (
  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${color}`}>{children}</span>
);

const Table = ({ headers, rows }: { headers: string[]; rows: (string | ReactNode)[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
      <thead className="bg-gray-50">
        <tr>
          {headers.map((h) => (
            <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-600 border-b border-gray-200">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
            {row.map((cell, j) => (
              <td key={j} className="px-4 py-2.5 text-gray-700 align-top">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function Architecture() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🍽️</span>
            <span className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full">ifoodmap · 內部架構文件</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">後台系統架構規劃</h1>
          <p className="text-gray-500 text-sm">dish-to-supply — Admin Dashboard + Supplier Portal + AI Analysis Layer</p>
        </div>

        {/* Data Flow */}
        <Section title="資料流程">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-col items-center gap-0">
              {[
                { icon: "💬", label: "客人 Chatbot 對話", sub: "或菜單圖片上傳", color: "bg-blue-50 border-blue-200 text-blue-800" },
                null,
                { icon: "🤖", label: "AI 自動分析", sub: "對話摘要 + 食材清單", color: "bg-purple-50 border-purple-200 text-purple-800" },
                null,
                { icon: "📋", label: "分析紀錄 (analysis_records)", sub: "狀態：待審核", color: "bg-yellow-50 border-yellow-200 text-yellow-800" },
                null,
                { icon: "👨‍💼", label: "管理員審核", sub: "查看摘要 → 選擇供應商 → 核准", color: "bg-orange-50 border-orange-200 text-orange-800" },
                null,
                { icon: "📦", label: "供應商訂單 (supplier_orders)", sub: "推送給對應供應商", color: "bg-green-50 border-green-200 text-green-800" },
                null,
                { icon: "🚚", label: "供應商確認出貨", sub: "出貨紀錄 (supplier_shipments)", color: "bg-teal-50 border-teal-200 text-teal-800" },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} className="flex flex-col items-center my-0.5">
                    <div className="w-0.5 h-5 bg-gray-300"></div>
                    <div className="w-2 h-2 border-r-2 border-b-2 border-gray-300 rotate-45 -mt-1"></div>
                  </div>
                ) : (
                  <div key={i} className={`w-full max-w-md border rounded-lg px-5 py-3 ${item.color}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{item.icon}</span>
                      <div>
                        <div className="font-medium text-sm">{item.label}</div>
                        <div className="text-xs opacity-70 mt-0.5">{item.sub}</div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </Section>

        {/* Database */}
        <Section title="資料庫新增表格">
          <Table
            headers={["表格", "用途", "主要欄位"]}
            rows={[
              ["chat_sessions", "Chatbot 對話紀錄", "messages (jsonb), status, analysis_id"],
              ["analysis_records", "統一的 AI 分析結果（來源：chatbot / 菜單上傳）", "summary, ingredient_list (jsonb), status, reviewed_by"],
              ["supplier_orders", "管理員審核後發給供應商的訂單", "analysis_id, supplier_id, ingredient_list (快照), status, sent_at"],
              ["supplier_shipments", "供應商確認出貨的紀錄", "order_id, shipped_at, tracking_info (jsonb), confirmed_by"],
              ["supplier_accounts", "供應商帳號（連結 Supabase auth）", "user_id, supplier_id, is_active"],
            ]}
          />
          <div className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
            所有新表格沿用現有 RLS 模式：管理員透過 <code className="bg-gray-200 px-1 rounded">is_admin()</code> JWT metadata 判斷；供應商透過 <code className="bg-gray-200 px-1 rounded">supplier_accounts</code> 對應關係控制存取。
          </div>
        </Section>

        {/* AI Layer */}
        <Section title="AI 分析層">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="font-medium text-purple-800 mb-2 text-sm">analyzeChat(messages[])</div>
                <div className="text-xs text-purple-600">輸入 Chatbot 對話記錄<br/>→ 輸出：摘要 + 食材清單</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="font-medium text-purple-800 mb-2 text-sm">analyzeMenuImage(imageUrl)</div>
                <div className="text-xs text-purple-600">輸入菜單圖片 URL<br/>→ 輸出：菜品列表 + 食材清單</div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              兩個具體實作：<code className="bg-gray-100 px-1 rounded">OpenAIAnalysisService</code>、<code className="bg-gray-100 px-1 rounded">GeminiAnalysisService</code>
              <br/>透過環境變數 <code className="bg-gray-100 px-1 rounded">AI_PROVIDER=openai | gemini</code> 切換，不需改程式碼。
            </div>
          </div>
        </Section>

        {/* API Routes */}
        <Section title="新增 API 路由">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Tag color="bg-red-100 text-red-700">Admin</Tag>
                <span>需管理員身份</span>
              </div>
              <Table
                headers={["方法", "路徑", "說明"]}
                rows={[
                  [<Tag color="bg-green-100 text-green-700">GET</Tag>, "/api/admin/analyses", "所有分析紀錄（支援狀態篩選）"],
                  [<Tag color="bg-blue-100 text-blue-700">POST</Tag>, "/api/admin/analyses/:id/approve", "審核通過 → 建立 supplier_order"],
                  [<Tag color="bg-blue-100 text-blue-700">POST</Tag>, "/api/admin/analyses/:id/reject", "退回（含備註）"],
                  [<Tag color="bg-green-100 text-green-700">GET</Tag>, "/api/admin/supplier-orders", "所有供應商訂單"],
                  [<Tag color="bg-green-100 text-green-700">GET</Tag>, "/api/admin/dashboard", "統計數字（待審核數、今日訂單等）"],
                ]}
              />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Tag color="bg-teal-100 text-teal-700">Supplier</Tag>
                <span>需供應商帳號身份</span>
              </div>
              <Table
                headers={["方法", "路徑", "說明"]}
                rows={[
                  [<Tag color="bg-green-100 text-green-700">GET</Tag>, "/api/supplier/orders", "我的收單列表"],
                  [<Tag color="bg-blue-100 text-blue-700">POST</Tag>, "/api/supplier/orders/:id/ship", "確認出貨 → 建立 shipment"],
                  [<Tag color="bg-green-100 text-green-700">GET</Tag>, "/api/supplier/shipments", "我的出貨歷史"],
                ]}
              />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Tag color="bg-purple-100 text-purple-700">AI</Tag>
                <span>分析觸發</span>
              </div>
              <Table
                headers={["方法", "路徑", "說明"]}
                rows={[
                  [<Tag color="bg-blue-100 text-blue-700">POST</Tag>, "/api/analyse/chat", "觸發分析指定 chat_session"],
                  [<Tag color="bg-blue-100 text-blue-700">POST</Tag>, "/api/analyse/menu", "觸發分析指定 menu_upload"],
                ]}
              />
            </div>
          </div>
        </Section>

        {/* Frontend */}
        <Section title="前端頁面結構">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span>👨‍💼</span>
                <span className="font-medium text-gray-800">管理員後台 /admin/*</span>
              </div>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">›</span><div><code className="bg-gray-100 px-1 rounded text-xs">AdminLayout.tsx</code><span className="ml-1">側邊欄導覽</span></div></li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">›</span><div><code className="bg-gray-100 px-1 rounded text-xs">AnalysisListPage.tsx</code><span className="ml-1">分析紀錄列表</span></div></li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">›</span><div><code className="bg-gray-100 px-1 rounded text-xs">AnalysisDetailPage.tsx</code><span className="ml-1">審核頁（摘要 + 食材清單 + 選供應商）</span></div></li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">›</span><div><code className="bg-gray-100 px-1 rounded text-xs">SupplierOrdersPage.tsx</code><span className="ml-1">已發出的訂單</span></div></li>
              </ul>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span>🏭</span>
                <span className="font-medium text-gray-800">供應商後台 /supplier/*</span>
              </div>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">›</span><div><code className="bg-gray-100 px-1 rounded text-xs">SupplierLayout.tsx</code><span className="ml-1">供應商專屬 layout</span></div></li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">›</span><div><code className="bg-gray-100 px-1 rounded text-xs">SupplierOrdersPage.tsx</code><span className="ml-1">收單列表（待確認 / 已出貨）</span></div></li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">›</span><div><code className="bg-gray-100 px-1 rounded text-xs">SupplierShipmentsPage.tsx</code><span className="ml-1">出貨歷史</span></div></li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">›</span><div><code className="bg-gray-100 px-1 rounded text-xs">SupplierRoute.tsx</code><span className="ml-1">Auth guard（驗供應商身份）</span></div></li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Implementation Order */}
        <Section title="實作順序">
          <div className="space-y-2">
            {[
              { step: 1, label: "資料庫 Migration", desc: "新增 5 張表格 + RLS 政策", status: "todo" },
              { step: 2, label: "AI 分析抽象層", desc: "Mock 實作先讓流程跑通，後期接真實 API", status: "todo" },
              { step: 3, label: "Hono API 路由", desc: "Admin + Supplier + Analyse 端點", status: "todo" },
              { step: 4, label: "管理員後台前端", desc: "Layout → 分析列表 → 審核詳情頁", status: "todo" },
              { step: 5, label: "供應商後台前端", desc: "Layout → 收單 → 出貨確認", status: "todo" },
              { step: 6, label: "Auth Guards + 路由", desc: "AdminRoute、SupplierRoute 元件", status: "todo" },
              { step: 7, label: "接入真實 AI Provider", desc: "OpenAI 或 Gemini，替換 mock", status: "todo" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">{item.step}</div>
                <div>
                  <div className="font-medium text-gray-800 text-sm">{item.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Tech Stack */}
        <Section title="技術棧">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "前端", value: "React + TypeScript + Vite" },
              { label: "UI", value: "Tailwind CSS + shadcn/ui" },
              { label: "後端", value: "Node.js + Hono" },
              { label: "資料庫", value: "Supabase (PostgreSQL + RLS)" },
              { label: "部署（前端）", value: "Vercel" },
              { label: "部署（API）", value: "Railway" },
              { label: "AI（待定）", value: "OpenAI GPT-4o / Gemini" },
              { label: "Auth", value: "Supabase Auth" },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-gray-400 mb-1">{item.label}</div>
                <div className="text-sm font-medium text-gray-700">{item.value}</div>
              </div>
            ))}
          </div>
        </Section>

        <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
          ifoodmap · 內部架構文件 · 僅供團隊參考
        </div>
      </div>
    </div>
  );
}
