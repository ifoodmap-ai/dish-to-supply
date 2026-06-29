import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { supabase } from "./lib/supabase.js";
import {
  analyzeConversation,
  analyzeMenuImage,
  chatReply,
  isGeminiConfigured,
  type AnalysisResult,
  type Ingredient
} from "./lib/gemini.js";

type Bindings = {
  Variables: {
    requestId: string;
  };
};

const app = new Hono<Bindings>();

const idParamSchema = z.object({
  id: z.string().uuid()
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

const dishSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  cuisine: z.string().optional(),
  ingredients: z.array(z.string().min(1)).optional()
});

const supplySchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().optional(),
  description: z.string().optional()
});

const supplierSchema = z.object({
  name: z.string().min(1),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  website: z.string().url().optional(),
  location: z.string().optional()
});

const inquirySchema = z.object({
  supplier_id: z.number().int(),
  supplier_name: z.string().min(1),
  products: z.array(z.record(z.unknown())).min(1),
  message: z.string().optional(),
  status: z.enum(["pending", "sent", "quoted", "closed"]).default("pending")
});

const routeConfigs = {
  dishes: {
    table: "dishes",
    schema: dishSchema
  },
  supplies: {
    table: "supplies",
    schema: supplySchema
  },
  suppliers: {
    table: "suppliers",
    schema: supplierSchema
  }
} as const;

const jsonError = (message: string, status: 400 | 404 | 500, details?: unknown) => {
  return {
    error: {
      message,
      details
    },
    status
  };
};

const getBearerToken = (authorization: string | undefined) => {
  const [scheme, token] = authorization?.split(" ") ?? [];
  return scheme?.toLowerCase() === "bearer" ? token : undefined;
};

const getAuthenticatedUserId = async (authorization: string | undefined) => {
  const token = getBearerToken(authorization);

  if (!token) {
    return { userId: null, error: "Missing Authorization bearer token" };
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { userId: null, error: error?.message ?? "Invalid Authorization bearer token" };
  }

  return { userId: data.user.id, error: null };
};

app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"]
  })
);

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "dish-to-supply-api",
    requestId: c.get("requestId")
  });
});

for (const [resource, config] of Object.entries(routeConfigs)) {
  app.get(`/api/${resource}`, async (c) => {
    const parsedQuery = paginationSchema.safeParse(c.req.query());

    if (!parsedQuery.success) {
      const { error, status } = jsonError("Invalid query parameters", 400, parsedQuery.error.flatten());
      return c.json(error, status);
    }

    const { limit, offset } = parsedQuery.data;
    const { data, error, count } = await supabase
      .from(config.table)
      .select("*", { count: "exact" })
      .range(offset, offset + limit - 1);

    if (error) {
      const payload = jsonError(`Failed to list ${resource}`, 500, error.message);
      return c.json(payload.error, payload.status);
    }

    return c.json({
      data,
      pagination: {
        limit,
        offset,
        count
      }
    });
  });

  app.get(`/api/${resource}/:id`, async (c) => {
    const parsedParams = idParamSchema.safeParse(c.req.param());

    if (!parsedParams.success) {
      const { error, status } = jsonError("Invalid id parameter", 400, parsedParams.error.flatten());
      return c.json(error, status);
    }

    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .eq("id", parsedParams.data.id)
      .maybeSingle();

    if (error) {
      const payload = jsonError(`Failed to fetch ${resource}`, 500, error.message);
      return c.json(payload.error, payload.status);
    }

    if (!data) {
      const payload = jsonError(`${resource} record not found`, 404);
      return c.json(payload.error, payload.status);
    }

    return c.json({ data });
  });

  app.post(`/api/${resource}`, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = config.schema.safeParse(body);

    if (!parsedBody.success) {
      const { error, status } = jsonError("Invalid request body", 400, parsedBody.error.flatten());
      return c.json(error, status);
    }

    const { data, error } = await supabase
      .from(config.table)
      .insert(parsedBody.data as Record<string, unknown>)
      .select("*")
      .single();

    if (error) {
      const payload = jsonError(`Failed to create ${resource}`, 500, error.message);
      return c.json(payload.error, payload.status);
    }

    return c.json({ data }, 201);
  });
}

app.get("/api/inquiries", async (c) => {
  const auth = await getAuthenticatedUserId(c.req.header("Authorization"));

  if (!auth.userId) {
    const payload = jsonError("Unauthorized", 400, auth.error);
    return c.json(payload.error, 401);
  }

  const parsedQuery = paginationSchema.safeParse(c.req.query());

  if (!parsedQuery.success) {
    const { error, status } = jsonError("Invalid query parameters", 400, parsedQuery.error.flatten());
    return c.json(error, status);
  }

  const { limit, offset } = parsedQuery.data;
  const { data, error, count } = await supabase
    .from("inquiries")
    .select("*", { count: "exact" })
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    const payload = jsonError("Failed to list inquiries", 500, error.message);
    return c.json(payload.error, payload.status);
  }

  return c.json({
    data,
    pagination: {
      limit,
      offset,
      count
    }
  });
});

app.get("/api/inquiries/:id", async (c) => {
  const auth = await getAuthenticatedUserId(c.req.header("Authorization"));

  if (!auth.userId) {
    const payload = jsonError("Unauthorized", 400, auth.error);
    return c.json(payload.error, 401);
  }

  const parsedParams = idParamSchema.safeParse(c.req.param());

  if (!parsedParams.success) {
    const { error, status } = jsonError("Invalid id parameter", 400, parsedParams.error.flatten());
    return c.json(error, status);
  }

  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", parsedParams.data.id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) {
    const payload = jsonError("Failed to fetch inquiry", 500, error.message);
    return c.json(payload.error, payload.status);
  }

  if (!data) {
    const payload = jsonError("Inquiry not found", 404);
    return c.json(payload.error, payload.status);
  }

  return c.json({ data });
});

app.post("/api/inquiries", async (c) => {
  const auth = await getAuthenticatedUserId(c.req.header("Authorization"));

  if (!auth.userId) {
    const payload = jsonError("Unauthorized", 400, auth.error);
    return c.json(payload.error, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsedBody = inquirySchema.safeParse(body);

  if (!parsedBody.success) {
    const { error, status } = jsonError("Invalid request body", 400, parsedBody.error.flatten());
    return c.json(error, status);
  }

  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      ...parsedBody.data,
      user_id: auth.userId
    })
    .select("*")
    .single();

  if (error) {
    const payload = jsonError("Failed to create inquiry", 500, error.message);
    return c.json(payload.error, payload.status);
  }

  return c.json({ data }, 201);
});

// ---------------------------------------------------------------------------
// AI analysis (Gemini)
// ---------------------------------------------------------------------------

const analyzeMenuSchema = z.object({
  image: z.string().min(1, "image is required (base64 or data URL)"),
  mimeType: z.string().min(1).default("image/jpeg"),
  fileName: z.string().optional()
});

const chatMessageSchema = z.object({
  role: z.enum(["user", "bot", "model"]),
  text: z.string(),
  image: z.string().optional() // 可選：該則訊息附帶的圖片（data URL）
});

const analyzeChatSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).optional(),
  transcript: z.string().min(1).optional(),
  // 若同一 session 已有分析紀錄（例如先上傳了菜單），帶上它的 id：
  // 後端只把對話逐字稿併進該筆，不另開新紀錄。
  analysisId: z.string().uuid().optional()
}).refine((v) => Boolean(v.messages?.length) || Boolean(v.transcript), {
  message: "Provide either messages[] or transcript"
});

const chatReplySchema = z.object({
  messages: z.array(chatMessageSchema).min(1)
});

const buildTranscript = (messages: { role: string; text: string; image?: string }[]) =>
  messages
    .map((m) => `${m.role === "user" ? "客人" : "客服"}: ${m.text || (m.image ? "[圖片]" : "")}`)
    .join("\n");

/**
 * Persist an analysis into analysis_records (status pending_review) so it shows
 * up in the admin review queue. Best-effort: if the table/insert fails we still
 * return the AI result to the caller, but we log + surface the persistence error.
 */
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

  if (error) {
    console.error(`Failed to persist analysis_records (${sourceType}):`, error.message);
    return { analysisId: null as string | null, persistError: error.message };
  }

  return { analysisId: (data as { id: string }).id, persistError: null as string | null };
};

app.post("/api/analyze/menu", async (c) => {
  if (!isGeminiConfigured()) {
    return c.json({ message: "AI 服務尚未設定 (GEMINI_API_KEY missing)" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = analyzeMenuSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  try {
    const result = await analyzeMenuImage(parsed.data.image, parsed.data.mimeType);
    const dataUrl = parsed.data.image.startsWith("data:")
      ? parsed.data.image
      : `data:${parsed.data.mimeType};base64,${parsed.data.image}`;
    const { analysisId, persistError } = await persistAnalysis("menu_upload", result, undefined, [dataUrl]);
    return c.json({ data: { analysisId, persistError, ...result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 分析失敗";
    console.error("analyze/menu error:", message);
    return c.json({ message: "AI 分析失敗", details: message }, 502);
  }
});

app.post("/api/analyze/chat", async (c) => {
  if (!isGeminiConfigured()) {
    return c.json({ message: "AI 服務尚未設定 (GEMINI_API_KEY missing)" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = analyzeChatSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  const transcript = parsed.data.transcript ?? buildTranscript(parsed.data.messages ?? []);

  // 同一 session 已有分析紀錄 → 重新萃取整段對話的食材，與既有清單合併去重後更新同一筆
  // （不另開新紀錄；先上傳菜單再追加的情境，原本菜單品項不會被洗掉）
  if (parsed.data.analysisId) {
    try {
      // 1. 取既有紀錄（保留先前已萃取的食材，例如菜單照分析結果）
      const { data: existing } = await supabase
        .from("analysis_records")
        .select("ingredient_list, summary")
        .eq("id", parsed.data.analysisId)
        .maybeSingle();
      const prevIngredients: Ingredient[] = Array.isArray((existing as any)?.ingredient_list)
        ? ((existing as any).ingredient_list as Ingredient[])
        : [];

      // 2. 重新萃取整段對話
      const result = await analyzeConversation(transcript);

      // 3. 合併去重（以食材名稱為鍵，新萃取結果覆蓋舊的同名項目）
      const byName = new Map<string, Ingredient>();
      for (const ing of prevIngredients) {
        if (ing && ing.name) byName.set(ing.name.trim().toLowerCase(), ing);
      }
      for (const ing of result.ingredients) {
        if (ing && ing.name) byName.set(ing.name.trim().toLowerCase(), ing);
      }
      const mergedIngredients = Array.from(byName.values());

      const patch: Record<string, unknown> = {
        transcript,
        ingredient_list: mergedIngredients
      };
      if (result.summary) patch.summary = result.summary;
      if (parsed.data.messages) patch.messages = parsed.data.messages;

      const { error } = await supabase
        .from("analysis_records")
        .update(patch)
        .eq("id", parsed.data.analysisId);

      return c.json({
        data: {
          analysisId: parsed.data.analysisId,
          persistError: error?.message ?? null,
          summary: result.summary,
          ingredients: mergedIngredients
        }
      });
    } catch (error) {
      // 萃取失敗時退回只更新逐字稿/訊息，至少不漏掉對話紀錄
      const patch: Record<string, unknown> = { transcript };
      if (parsed.data.messages) patch.messages = parsed.data.messages;
      const { error: updErr } = await supabase
        .from("analysis_records")
        .update(patch)
        .eq("id", parsed.data.analysisId);
      const message = error instanceof Error ? error.message : "AI 萃取失敗";
      console.error("analyze/chat (append) extract error:", message);
      return c.json({
        data: { analysisId: parsed.data.analysisId, persistError: updErr?.message ?? null, summary: null, ingredients: [] }
      });
    }
  }

  try {
    const result = await analyzeConversation(transcript);
    const { analysisId, persistError } = await persistAnalysis("chatbot", result, transcript, undefined, parsed.data.messages);
    return c.json({ data: { analysisId, persistError, ...result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 分析失敗";
    console.error("analyze/chat error:", message);
    return c.json({ message: "AI 分析失敗", details: message }, 502);
  }
});

app.post("/api/chat", async (c) => {
  if (!isGeminiConfigured()) {
    return c.json({ message: "AI 服務尚未設定 (GEMINI_API_KEY missing)" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = chatReplySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  const history = parsed.data.messages.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    text: m.text
  }));

  try {
    const reply = await chatReply(history);
    return c.json({ data: { reply } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 回覆失敗";
    console.error("chat error:", message);
    return c.json({ message: "AI 回覆失敗", details: message }, 502);
  }
});

app.notFound((c) => {
  return c.json(
    {
      error: {
        message: "Route not found"
      }
    },
    404
  );
});

app.onError((error, c) => {
  console.error(error);

  return c.json(
    {
      error: {
        message: "Internal server error",
        requestId: c.get("requestId")
      }
    },
    500
  );
});

const port = Number.parseInt(process.env.PORT ?? "8787", 10);

serve(
  {
    fetch: app.fetch,
    port
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  }
);
