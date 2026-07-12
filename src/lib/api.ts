// Thin client for the ifoodmap backend API (Railway). The backend holds the
// Gemini API key and Supabase service-role key — never call Gemini from here.
//
// Set VITE_API_URL to the Railway public URL of the `api` service, e.g.
//   VITE_API_URL=https://ifoodmap-api-production.up.railway.app

export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export interface Ingredient {
  name: string;
  quantity?: string;
  unit?: string;
  category?: string;
}

export interface AnalysisResult {
  analysisId: string | null;
  persistError: string | null;
  summary: string;
  ingredients: Ingredient[];
}

interface ApiError {
  message?: string;
  details?: unknown;
}

// AI endpoints run on the Supabase Edge Function `ai` (Railway-independent).
const AI_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai`;

const aiCall = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const res = await fetch(AI_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify(payload)
  });

  const json = (await res.json().catch(() => null)) as { data?: T } & ApiError | null;

  if (!res.ok || !json) {
    throw new Error(json?.message ?? `Request failed (${res.status})`);
  }

  return json.data as T;
};

/** Read a File as a base64 string (no data: prefix). */
export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Analyze a menu image → ingredient list + summary (creates a pending analysis record). */
export const analyzeMenu = async (file: File): Promise<AnalysisResult> => {
  const image = await fileToBase64(file);
  return aiCall<AnalysisResult>({
    action: "analyze-menu",
    image,
    mimeType: file.type || "image/jpeg",
    fileName: file.name
  });
};

/** Extract purchasing requirements from a chat transcript (creates a pending analysis record). */
export const analyzeChat = (messages: { role: "user" | "bot"; text: string }[]): Promise<AnalysisResult> =>
  aiCall<AnalysisResult>({ action: "analyze-chat", messages });

/** Get a conversational assistant reply for the chatbot. */
export const chatReply = (messages: { role: "user" | "bot"; text: string }[]): Promise<{ reply: string }> =>
  aiCall<{ reply: string }>({ action: "chat", messages });

export interface MatchedItem {
  ingredient: string;
  name: string;
  price: number | null;
  unit: string | null;
  pack_size: string | null;
}

export interface MatchedSupplier {
  supplier: {
    id: string;
    name: string;
    description: string | null;
    service_areas: string[] | null;
  };
  score: number;
  matchedCount: number;
  items: MatchedItem[];
}

export interface MatchResult {
  requested: string[];
  suppliers: MatchedSupplier[];
}

interface SupplierListRow {
  id: string;
  name: string;
  description: string | null;
  service_areas: string[] | null;
  is_active?: boolean | null;
}

interface SupplyListRow {
  id: string;
  supplier_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: string | null;
  price: number | null;
  is_available?: boolean | null;
}

// Public catalog reads go straight to Supabase (anon SELECT policies on
// active suppliers / available supplies) — independent of backend deploys.
import { supabase } from "@/integrations/supabase/client";

const getCatalog = async <T>(table: string, availCol: string): Promise<T[]> => {
  const { data, error } = (await (supabase as never as {
    from: (t: string) => {
      select: (c: string) => { eq: (col: string, v: boolean) => Promise<{ data: T[] | null; error: { message: string } | null }> };
    };
  })
    .from(table)
    .select("*")
    .eq(availCol, true)) as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  return data ?? [];
};

const normalizeName = (s: string) =>
  s.toLowerCase().replace(/\s+/g, "").replace(/[（(].*?[)）]/g, "");

/**
 * Match analyzed ingredient names against real suppliers.
 * Catalog comes from the public list endpoints; the ranking (base 70 +
 * price competitiveness ≤25 + availability 5) runs locally so matching
 * works even while backend deploys are frozen.
 */
export const matchSuppliers = async (ingredients: string[]): Promise<MatchResult> => {
  const [suppliers, supplies] = await Promise.all([
    getCatalog<SupplierListRow>("suppliers", "is_active"),
    getCatalog<SupplyListRow>("supplies", "is_available")
  ]);

  const active = new Map(suppliers.filter((s) => s.is_active !== false).map((s) => [s.id, s]));
  const available = supplies.filter((s) => s.is_available !== false);

  type Hit = { ingredient: string; supply: SupplyListRow };
  const hits: Hit[] = [];
  for (const raw of ingredients) {
    const wn = normalizeName(raw);
    if (!wn) continue;
    for (const s of available) {
      const sn = normalizeName(s.name);
      if (sn.includes(wn) || wn.includes(sn)) hits.push({ ingredient: raw, supply: s });
    }
  }

  const cheapest = new Map<string, number>();
  for (const h of hits) {
    if (h.supply.price == null) continue;
    const cur = cheapest.get(h.ingredient);
    if (cur == null || Number(h.supply.price) < cur) cheapest.set(h.ingredient, Number(h.supply.price));
  }

  const bySupplier = new Map<string, Hit[]>();
  for (const h of hits) {
    if (!active.has(h.supply.supplier_id)) continue;
    bySupplier.set(h.supply.supplier_id, [...(bySupplier.get(h.supply.supplier_id) ?? []), h]);
  }

  const ranked: MatchedSupplier[] = [...bySupplier.entries()]
    .map(([sid, group]) => {
      let priceScore = 0;
      let priced = 0;
      for (const h of group) {
        const min = cheapest.get(h.ingredient);
        if (min != null && h.supply.price != null && Number(h.supply.price) > 0) {
          priceScore += (min / Number(h.supply.price)) * 25;
          priced += 1;
        }
      }
      const sup = active.get(sid)!;
      return {
        supplier: {
          id: sup.id,
          name: sup.name,
          description: sup.description,
          service_areas: sup.service_areas
        },
        score: Math.min(Math.round(70 + (priced > 0 ? priceScore / priced : 12) + 5), 99),
        matchedCount: new Set(group.map((g) => g.ingredient)).size,
        items: group.map((g) => ({
          ingredient: g.ingredient,
          name: g.supply.name,
          price: g.supply.price,
          unit: g.supply.unit,
          pack_size: g.supply.pack_size
        }))
      };
    })
    .sort((a, b) => b.score - a.score || b.matchedCount - a.matchedCount);

  return { requested: ingredients, suppliers: ranked };
};

/** Format an ingredient object into a display string like "牛肉 2kg". */
export const formatIngredient = (i: Ingredient): string => {
  const qty = [i.quantity, i.unit].filter(Boolean).join("");
  return qty ? `${i.name} ${qty}` : i.name;
};
