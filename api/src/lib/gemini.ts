import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

// Lazily constructed so the server can still boot (and other routes work) even
// if the Gemini key is missing — the analyze endpoints will surface a clear 503.
let client: GoogleGenAI | null = null;

export const isGeminiConfigured = () => Boolean(apiKey);

const getClient = () => {
  if (!apiKey) {
    throw new Error("Missing required env GEMINI_API_KEY");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
};

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export interface Ingredient {
  name: string;
  quantity?: string;
  unit?: string;
  category?: string;
}

export interface AnalysisResult {
  summary: string;
  ingredients: Ingredient[];
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "一段繁體中文摘要,描述這份菜單/對話代表的採購需求重點"
    },
    ingredients: {
      type: Type.ARRAY,
      description: "餐廳需要採購的食材清單",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "食材名稱(繁體中文)" },
          quantity: { type: Type.STRING, description: "預估數量,例如 2、1.5、500" },
          unit: { type: Type.STRING, description: "單位,例如 kg、g、ml、份、包" },
          category: {
            type: Type.STRING,
            description: "分類,例如 肉類、海鮮、蔬菜、調味料、乾貨、其他"
          }
        },
        required: ["name"],
        propertyOrdering: ["name", "quantity", "unit", "category"]
      }
    }
  },
  required: ["summary", "ingredients"],
  propertyOrdering: ["summary", "ingredients"]
} as const;

const SYSTEM_INSTRUCTION = [
  "你是一個專業的餐飲供應鏈分析助手,服務對象是 ifoodmap(把餐廳菜單需求媒合到食材供應商的平台)。",
  "你的任務:從輸入(菜單圖片或客人對話)中,萃取出餐廳需要採購的食材清單,並寫一段簡短的繁體中文摘要。",
  "規則:",
  "1. ingredients 只列『可採購的原物料/食材』,不要列成品菜名。",
  "2. 數量與單位請依常識合理估計(例如一道牛肉麵需要的牛肉量);無法判斷時 quantity/unit 可留空。",
  "3. name 與 summary 一律使用繁體中文。",
  "4. 嚴格依照指定的 JSON schema 回傳,不要多加任何說明文字。"
].join("\n");

const parseResult = (raw: string): AnalysisResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini 回傳非 JSON 內容: ${raw.slice(0, 200)}`);
  }

  const obj = parsed as Partial<AnalysisResult>;
  const ingredients = Array.isArray(obj.ingredients) ? obj.ingredients : [];

  return {
    summary: typeof obj.summary === "string" ? obj.summary : "",
    ingredients: ingredients
      .filter((i): i is Ingredient => Boolean(i) && typeof i.name === "string" && i.name.trim().length > 0)
      .map((i) => ({
        name: i.name.trim(),
        ...(i.quantity ? { quantity: String(i.quantity) } : {}),
        ...(i.unit ? { unit: String(i.unit) } : {}),
        ...(i.category ? { category: String(i.category) } : {})
      }))
  };
};

const generate = async (
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>
): Promise<AnalysisResult> => {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.2
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini 回傳空白內容");
  }

  return parseResult(text);
};

/** 分析菜單圖片 → 食材清單 + 摘要 */
export const analyzeMenuImage = async (imageBase64: string, mimeType: string): Promise<AnalysisResult> => {
  // Accept both raw base64 and data: URLs
  const data = imageBase64.includes(",") ? imageBase64.slice(imageBase64.indexOf(",") + 1) : imageBase64;

  return generate([
    { text: "這是一張餐廳菜單的照片。請辨識上面的菜色,推算需要採購的食材清單與摘要。" },
    { inlineData: { mimeType, data } }
  ]);
};

/** 分析客人對話 → 採購需求清單 + 摘要 */
export const analyzeConversation = async (transcript: string): Promise<AnalysisResult> => {
  return generate([
    {
      text: [
        "以下是客人與 ifoodmap 客服機器人的對話。請整理出客人實際的食材採購需求,並寫一段摘要。",
        "",
        "=== 對話開始 ===",
        transcript,
        "=== 對話結束 ==="
      ].join("\n")
    }
  ]);
};

/** 一般對話回覆(給 Chatbot 用,非結構化) */
export const chatReply = async (
  history: Array<{ role: "user" | "model"; text: string }>
): Promise<string> => {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    config: {
      systemInstruction: [
        "你是 ifoodmap 的餐飲採購客服助手,協助餐廳老闆描述他們的食材採購需求。",
        "用繁體中文、親切專業地回覆。引導客人講出需要哪些食材、數量,以便後續媒合供應商。",
        "回覆精簡(2-4 句),不要使用 markdown 標題。"
      ].join("\n"),
      temperature: 0.6
    }
  });

  return response.text ?? "";
};
