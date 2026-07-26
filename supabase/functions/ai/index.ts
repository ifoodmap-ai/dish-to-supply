// Edge Function: ifoodmap AI
// Railway 停機後的常駐 AI 後端 — Gemini 走 REST,service-role 由平台注入。
//
// actions:
//   analyze-menu        菜單圖片 → 食材清單
//   analyze-chat        對話 → 食材清單(可續寫合併)
//   chat                客服對話回覆
//   parse-delivery-note 送貨單拍照 → 品項/數量/單價(收貨對帳)
//   parse-catalog       價目表照片 → 商品目錄(供應商自動上架)
//   dish-ideas          現有食材 + 當季便宜品項 → 新菜建議
//   quote-draft         詢價 + 歷史成交價 → 報價草稿
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

interface Ingredient { name: string; quantity?: string; unit?: string; category?: string }
interface AnalysisResult { summary: string; ingredients: Ingredient[] }

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING", description: "一段繁體中文摘要,描述這份菜單/對話代表的採購需求重點" },
    ingredients: {
      type: "ARRAY",
      description: "餐廳需要採購的食材清單",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "食材名稱(繁體中文)" },
          quantity: { type: "STRING", description: "預估數量,例如 2、1.5、500" },
          unit: { type: "STRING", description: "單位,例如 kg、g、ml、份、包" },
          category: { type: "STRING", description: "分類,例如 肉類、海鮮、蔬菜、調味料、乾貨、其他" }
        },
        required: ["name"],
        propertyOrdering: ["name", "quantity", "unit", "category"]
      }
    }
  },
  required: ["summary", "ingredients"],
  propertyOrdering: ["summary", "ingredients"]
};

// 送貨單辨識 —— 收貨對帳用
const DELIVERY_NOTE_SCHEMA = {
  type: "OBJECT",
  properties: {
    supplier_name: { type: "STRING", description: "送貨單上的供應商名稱,看不到就留空" },
    delivered_at: { type: "STRING", description: "送貨日期,格式 YYYY-MM-DD,看不到就留空" },
    items: {
      type: "ARRAY",
      description: "送貨單上的品項明細",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "品項名稱(繁體中文)" },
          quantity: { type: "NUMBER", description: "數量" },
          unit: { type: "STRING", description: "單位,如 kg、台斤、箱、包" },
          unit_price: { type: "NUMBER", description: "單價,沒有就填 0" },
          amount: { type: "NUMBER", description: "小計金額,沒有就填 0" }
        },
        required: ["name"],
        propertyOrdering: ["name", "quantity", "unit", "unit_price", "amount"]
      }
    },
    total: { type: "NUMBER", description: "總金額,看不到就填 0" }
  },
  required: ["items"],
  propertyOrdering: ["supplier_name", "delivered_at", "items", "total"]
};

// 價目表辨識 —— 供應商自動上架用
const CATALOG_SCHEMA = {
  type: "OBJECT",
  properties: {
    products: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "商品名稱(繁體中文)" },
          category: { type: "STRING", description: "分類:蔬菜/肉品/海鮮/菇類/米麵/豆製品/調味/其他" },
          price: { type: "NUMBER", description: "價格" },
          unit: { type: "STRING", description: "單位,如 kg、台斤、箱" },
          pack_size: { type: "STRING", description: "包裝規格,如 10kg/箱,沒有就留空" }
        },
        required: ["name"],
        propertyOrdering: ["name", "category", "price", "unit", "pack_size"]
      }
    }
  },
  required: ["products"]
};

// 新菜建議 —— 菜色實驗室用
const DISH_IDEAS_SCHEMA = {
  type: "OBJECT",
  properties: {
    dishes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "菜名(繁體中文,要像台灣餐廳會寫的菜名)" },
          description: { type: "STRING", description: "一句話說明賣點" },
          ingredients: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                quantity: { type: "NUMBER", description: "單份用量" },
                unit: { type: "STRING", description: "單位,預設 kg" }
              },
              required: ["name"],
              propertyOrdering: ["name", "quantity", "unit"]
            }
          },
          suggested_price: { type: "NUMBER", description: "建議售價(新台幣)" },
          reason: { type: "STRING", description: "為什麼現在推這道(季節性/成本/客群)" }
        },
        required: ["name", "ingredients"],
        propertyOrdering: ["name", "description", "ingredients", "suggested_price", "reason"]
      }
    }
  },
  required: ["dishes"]
};

// 報價草稿 —— 供應商線上報價用
const QUOTE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unit: { type: "STRING" },
          unit_price: { type: "NUMBER", description: "建議單價" },
          amount: { type: "NUMBER", description: "小計" },
          note: { type: "STRING", description: "定價理由,如「參考近三次成交價」" }
        },
        required: ["name", "unit_price"],
        propertyOrdering: ["name", "quantity", "unit", "unit_price", "amount", "note"]
      }
    },
    total: { type: "NUMBER" },
    message: { type: "STRING", description: "給買家的一段繁體中文報價說明(2-3 句)" }
  },
  required: ["items", "total"],
  propertyOrdering: ["items", "total", "message"]
};

const ANALYSIS_SYSTEM = [
  "你是一個專業的餐飲供應鏈分析助手,服務對象是 ifoodmap(把餐廳菜單需求媒合到食材供應商的平台)。",
  "你的任務:從輸入(菜單圖片或客人對話)中,萃取出餐廳需要採購的食材清單,並寫一段簡短的繁體中文摘要。",
  "規則:",
  "1. ingredients 只列『可採購的原物料/食材』,不要列成品菜名。",
  "2. 數量與單位請依常識合理估計(例如一道牛肉麵需要的牛肉量);無法判斷時 quantity/unit 可留空。",
  "3. name 與 summary 一律使用繁體中文。",
  "4. 嚴格依照指定的 JSON schema 回傳,不要多加任何說明文字。"
].join("\n");

const CHAT_SYSTEM = [
  "你是 ifoodmap 的餐飲採購客服助手,協助餐廳老闆描述他們的食材採購需求。",
  "用繁體中文、親切專業地回覆。引導客人講出需要哪些食材、數量,以便後續媒合供應商。",
  "回覆精簡(2-4 句),不要使用 markdown 標題。"
].join("\n");

type GPart = { text: string } | { inlineData: { mimeType: string; data: string } };

const geminiGenerate = async (
  contents: { role: string; parts: GPart[] }[],
  opts: { system: string; structured: boolean; temperature: number; schema?: unknown; action?: string }
): Promise<string> => {
  const body: Record<string, unknown> = {
    contents,
    systemInstruction: { parts: [{ text: opts.system }] },
    generationConfig: {
      temperature: opts.temperature,
      ...(opts.structured
        ? { responseMimeType: "application/json", responseSchema: opts.schema ?? RESPONSE_SCHEMA }
        : {})
    }
  };
  const startedAt = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify(body)
    }
  );
  const data = await res.json().catch(() => null);
  const latency = Date.now() - startedAt;

  // 用量記錄供 /admin/ai-ops —— 失敗不影響主流程
  const usage = data?.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
  supabase.from("ai_usage").insert({
    action: opts.action ?? "unknown",
    model: MODEL,
    prompt_tokens: usage?.promptTokenCount ?? null,
    completion_tokens: usage?.candidatesTokenCount ?? null,
    latency_ms: latency,
    ok: res.ok,
    error: res.ok ? null : JSON.stringify(data ?? {}).slice(0, 500)
  }).then(() => {}, () => {});

  if (!res.ok) throw new Error(JSON.stringify(data ?? { status: res.status }));
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini 回傳空白內容");
  return text;
};

const parseAnalysis = (raw: string): AnalysisResult => {
  let parsed: Partial<AnalysisResult>;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`Gemini 回傳非 JSON: ${raw.slice(0, 200)}`); }
  const list = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    ingredients: list
      .filter((i): i is Ingredient => Boolean(i) && typeof i.name === "string" && i.name.trim().length > 0)
      .map((i) => ({
        name: i.name.trim(),
        ...(i.quantity ? { quantity: String(i.quantity) } : {}),
        ...(i.unit ? { unit: String(i.unit) } : {}),
        ...(i.category ? { category: String(i.category) } : {})
      }))
  };
};

const buildTranscript = (messages: { role: string; text?: string; image?: string }[]) =>
  messages.map((m) => `${m.role === "user" ? "客人" : "客服"}: ${m.text || (m.image ? "[圖片]" : "")}`).join("\n");

const persistAnalysis = async (
  sourceType: string,
  result: AnalysisResult,
  transcript?: string,
  images?: string[],
  messages?: unknown[]
) => {
  const { data, error } = await supabase
    .from("analysis_records")
    .insert({
      source_type: sourceType,
      summary: result.summary,
      ingredient_list: result.ingredients,
      transcript: transcript ?? null,
      images: images && images.length ? images : null,
      messages: messages && messages.length ? messages : null,
      status: "pending_review"
    })
    .select("id")
    .single();
  if (error) return { analysisId: null as string | null, persistError: error.message };
  return { analysisId: (data as { id: string }).id, persistError: null as string | null };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);
  if (!GEMINI_KEY) return json({ message: "AI 服務尚未設定 (GEMINI_API_KEY missing)" }, 503);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return json({ message: "action is required" }, 400);

  try {
    // ---------------- analyze-menu ----------------
    if (body.action === "analyze-menu") {
      const image = typeof body.image === "string" ? body.image : "";
      const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
      if (!image) return json({ message: "image is required" }, 400);
      const data = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
      const raw = await geminiGenerate(
        [{ role: "user", parts: [
          { text: "這是一張餐廳菜單的照片。請辨識上面的菜色,推算需要採購的食材清單與摘要。" },
          { inlineData: { mimeType, data } }
        ] }],
        { system: ANALYSIS_SYSTEM, structured: true, temperature: 0.2, action: "analyze-menu" }
      );
      const result = parseAnalysis(raw);
      const dataUrl = image.startsWith("data:") ? image : `data:${mimeType};base64,${image}`;
      const { analysisId, persistError } = await persistAnalysis("menu_upload", result, undefined, [dataUrl]);
      return json({ data: { analysisId, persistError, ...result } });
    }

    // ---------------- analyze-chat ----------------
    if (body.action === "analyze-chat") {
      const messages = Array.isArray(body.messages) ? body.messages as { role: string; text?: string; image?: string }[] : undefined;
      const transcript = typeof body.transcript === "string" && body.transcript
        ? body.transcript
        : messages ? buildTranscript(messages) : "";
      if (!transcript) return json({ message: "Provide messages[] or transcript" }, 400);
      const analysisId = typeof body.analysisId === "string" ? body.analysisId : undefined;

      const extract = async () => parseAnalysis(await geminiGenerate(
        [{ role: "user", parts: [{ text: [
          "以下是客人與 ifoodmap 客服機器人的對話。請整理出客人實際的食材採購需求,並寫一段摘要。",
          "", "=== 對話開始 ===", transcript, "=== 對話結束 ==="
        ].join("\n") }] }],
        { system: ANALYSIS_SYSTEM, structured: true, temperature: 0.2, action: "analyze-chat" }
      ));

      if (analysisId) {
        try {
          const { data: existing } = await supabase
            .from("analysis_records").select("ingredient_list").eq("id", analysisId).maybeSingle();
          const prev: Ingredient[] = Array.isArray(existing?.ingredient_list) ? existing.ingredient_list : [];
          const result = await extract();
          const byName = new Map<string, Ingredient>();
          for (const ing of prev) if (ing?.name) byName.set(ing.name.trim().toLowerCase(), ing);
          for (const ing of result.ingredients) if (ing?.name) byName.set(ing.name.trim().toLowerCase(), ing);
          const merged = [...byName.values()];
          const patch: Record<string, unknown> = { transcript, ingredient_list: merged };
          if (result.summary) patch.summary = result.summary;
          if (messages) patch.messages = messages;
          const { error } = await supabase.from("analysis_records").update(patch).eq("id", analysisId);
          return json({ data: { analysisId, persistError: error?.message ?? null, summary: result.summary, ingredients: merged } });
        } catch (_e) {
          const patch: Record<string, unknown> = { transcript };
          if (messages) patch.messages = messages;
          const { error: updErr } = await supabase.from("analysis_records").update(patch).eq("id", analysisId);
          return json({ data: { analysisId, persistError: updErr?.message ?? null, summary: null, ingredients: [] } });
        }
      }

      const result = await extract();
      const { analysisId: newId, persistError } = await persistAnalysis("chatbot", result, transcript, undefined, messages);
      return json({ data: { analysisId: newId, persistError, ...result } });
    }

    // ---------------- chat ----------------
    if (body.action === "chat") {
      const messages = Array.isArray(body.messages) ? body.messages as { role: string; text?: string }[] : [];
      if (!messages.length) return json({ message: "messages is required" }, 400);
      const contents = messages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text ?? "" }] as GPart[]
      }));
      const reply = await geminiGenerate(contents, { system: CHAT_SYSTEM, structured: false, temperature: 0.6, action: "chat" });
      return json({ data: { reply } });
    }

    // ---------------- parse-delivery-note(收貨對帳)----------------
    if (body.action === "parse-delivery-note") {
      const image = typeof body.image === "string" ? body.image : "";
      const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
      if (!image) return json({ message: "image is required" }, 400);
      const data = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;

      const raw = await geminiGenerate(
        [{ role: "user", parts: [
          { text: "這是一張食材送貨單/出貨單的照片。請逐項辨識上面的品項、數量、單位、單價與小計。數字看不清楚時填 0,不要猜測。" },
          { inlineData: { mimeType, data } }
        ] }],
        { system: "你是食材採購對帳助手。只回傳 JSON,不要說明文字。品名一律繁體中文。", structured: true, temperature: 0.1, schema: DELIVERY_NOTE_SCHEMA, action: "parse-delivery-note" }
      );

      let parsed: { items?: { name?: string; quantity?: number; unit?: string; unit_price?: number; amount?: number }[]; total?: number; supplier_name?: string; delivered_at?: string };
      try { parsed = JSON.parse(raw); } catch { return json({ message: "送貨單辨識失敗", details: raw.slice(0, 200) }, 502); }
      const items = (parsed.items ?? []).filter((i) => i?.name);

      // 有帶 orderId 就跟訂單品項比對出差異
      let discrepancies: { name: string; ordered: number | null; received: number | null; issue: string }[] = [];
      const orderId = typeof body.orderId === "string" ? body.orderId : undefined;
      if (orderId) {
        const { data: order } = await supabase
          .from("supplier_orders").select("ingredient_list").eq("id", orderId).maybeSingle();
        const ordered: { name?: string; quantity?: string | number }[] =
          Array.isArray(order?.ingredient_list) ? order.ingredient_list : [];
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
        for (const o of ordered) {
          if (!o?.name) continue;
          const hit = items.find((i) => norm(i.name!).includes(norm(o.name!)) || norm(o.name!).includes(norm(i.name!)));
          const oq = Number(o.quantity ?? 0);
          if (!hit) {
            discrepancies.push({ name: o.name, ordered: oq || null, received: 0, issue: "未送達" });
          } else if (oq > 0 && Number(hit.quantity ?? 0) > 0 && Math.abs(Number(hit.quantity) - oq) / oq > 0.02) {
            discrepancies.push({
              name: o.name, ordered: oq, received: Number(hit.quantity),
              issue: Number(hit.quantity) < oq ? "數量短少" : "數量超收"
            });
          }
        }
        const extra = items.filter((i) =>
          !ordered.some((o) => o?.name && (norm(i.name!).includes(norm(o.name)) || norm(o.name).includes(norm(i.name!)))));
        discrepancies = discrepancies.concat(
          extra.map((i) => ({ name: i.name!, ordered: null, received: Number(i.quantity ?? 0), issue: "訂單外品項" })));
      }

      return json({ data: {
        supplierName: parsed.supplier_name ?? null,
        deliveredAt: parsed.delivered_at ?? null,
        items, total: Number(parsed.total ?? 0),
        discrepancies, hasDiscrepancy: discrepancies.length > 0
      } });
    }

    // ---------------- parse-catalog(供應商自動上架)----------------
    if (body.action === "parse-catalog") {
      const image = typeof body.image === "string" ? body.image : "";
      const text = typeof body.text === "string" ? body.text : "";
      if (!image && !text) return json({ message: "image or text is required" }, 400);
      const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";

      const parts: GPart[] = [{ text: [
        "以下是一份食材供應商的價目表。請逐項整理成商品目錄:名稱、分類、價格、單位、包裝規格。",
        "價格看不清楚時填 0。名稱一律用繁體中文標準寫法。"
      ].join("\n") }];
      if (image) {
        const data = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
        parts.push({ inlineData: { mimeType, data } });
      }
      if (text) parts.push({ text: `\n=== 價目表內容 ===\n${text}` });

      const raw = await geminiGenerate([{ role: "user", parts }],
        { system: "你是食材供應商上架助手。只回傳 JSON。", structured: true, temperature: 0.1, schema: CATALOG_SCHEMA, action: "parse-catalog" });
      let parsed: { products?: unknown[] };
      try { parsed = JSON.parse(raw); } catch { return json({ message: "價目表辨識失敗" }, 502); }
      return json({ data: { products: Array.isArray(parsed.products) ? parsed.products : [] } });
    }

    // ---------------- dish-ideas(菜色實驗室)----------------
    if (body.action === "dish-ideas") {
      const ingredients = Array.isArray(body.ingredients) ? (body.ingredients as string[]) : [];
      const seasonal = Array.isArray(body.seasonal) ? (body.seasonal as string[]) : [];
      const cuisine = typeof body.cuisine === "string" ? body.cuisine : "台式";
      if (!ingredients.length && !seasonal.length) return json({ message: "ingredients is required" }, 400);

      const raw = await geminiGenerate(
        [{ role: "user", parts: [{ text: [
          `這是一家「${cuisine}」餐廳。請根據以下條件推薦 3 道新菜色:`,
          `- 廚房現有食材:${ingredients.join("、") || "(無)"}`,
          `- 目前當季且價格較低的食材:${seasonal.join("、") || "(無)"}`,
          "",
          "要求:優先使用現有食材以降低備料負擔;至少一道要用到當季便宜食材;",
          "每道菜列出單份食材用量(公斤),並給建議售價(參考台灣一般餐廳行情)。"
        ].join("\n") }] }],
        { system: "你是台灣餐飲研發顧問。只回傳 JSON,菜名要像真的會出現在台灣餐廳菜單上。", structured: true, temperature: 0.8, schema: DISH_IDEAS_SCHEMA, action: "dish-ideas" }
      );
      let parsed: { dishes?: unknown[] };
      try { parsed = JSON.parse(raw); } catch { return json({ message: "新菜建議產生失敗" }, 502); }
      return json({ data: { dishes: Array.isArray(parsed.dishes) ? parsed.dishes : [] } });
    }

    // ---------------- quote-draft(AI 報價草稿)----------------
    if (body.action === "quote-draft") {
      const items = Array.isArray(body.items) ? body.items : [];
      const catalog = Array.isArray(body.catalog) ? body.catalog : [];
      const history = Array.isArray(body.history) ? body.history : [];
      if (!items.length) return json({ message: "items is required" }, 400);

      const raw = await geminiGenerate(
        [{ role: "user", parts: [{ text: [
          "請為以下詢價產生一份報價草稿。",
          "",
          `【客戶需求】\n${JSON.stringify(items, null, 0)}`,
          `\n【我的商品目錄與定價】\n${JSON.stringify(catalog, null, 0)}`,
          `\n【近期成交價參考】\n${JSON.stringify(history, null, 0)}`,
          "",
          "規則:單價必須以我的商品目錄定價為基準(可依數量給合理折扣,但不要低於目錄價 85%);",
          "目錄裡沒有的品項不要自行編價,unit_price 填 0 並在 note 註明「目錄無此品項」。"
        ].join("\n") }] }],
        { system: "你是食材供應商的報價助手。只回傳 JSON,金額務必以提供的目錄價為準,不可憑空捏造。", structured: true, temperature: 0.2, schema: QUOTE_SCHEMA, action: "quote-draft" }
      );
      let parsed: { items?: unknown[]; total?: number; message?: string };
      try { parsed = JSON.parse(raw); } catch { return json({ message: "報價草稿產生失敗" }, 502); }
      return json({ data: {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        total: Number(parsed.total ?? 0),
        message: parsed.message ?? ""
      } });
    }

    return json({ message: `Unknown action: ${body.action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 服務錯誤";
    // 失敗也記一筆,供 /admin/ai-ops 追蹤
    try {
      await supabase.from("ai_usage").insert({
        action: String(body.action), model: MODEL, ok: false, error: message.slice(0, 500)
      });
    } catch { /* 記錄失敗不影響回應 */ }
    return json({ message: "AI 分析失敗", details: message }, 502);
  }
});
