// Edge Function: ifoodmap AI(菜單分析 / 對話萃取 / 客服回覆)
// Railway 停機後的常駐 AI 後端 — Gemini 走 REST,service-role 由平台注入。
// actions: analyze-menu | analyze-chat | chat
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
  opts: { system: string; structured: boolean; temperature: number }
): Promise<string> => {
  const body: Record<string, unknown> = {
    contents,
    systemInstruction: { parts: [{ text: opts.system }] },
    generationConfig: {
      temperature: opts.temperature,
      ...(opts.structured ? { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA } : {})
    }
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify(body)
    }
  );
  const data = await res.json().catch(() => null);
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
        { system: ANALYSIS_SYSTEM, structured: true, temperature: 0.2 }
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
        { system: ANALYSIS_SYSTEM, structured: true, temperature: 0.2 }
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
      const reply = await geminiGenerate(contents, { system: CHAT_SYSTEM, structured: false, temperature: 0.6 });
      return json({ data: { reply } });
    }

    return json({ message: `Unknown action: ${body.action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 服務錯誤";
    return json({ message: "AI 分析失敗", details: message }, 502);
  }
});
