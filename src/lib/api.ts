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

const post = async <T>(path: string, body: unknown): Promise<T> => {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_URL is not configured");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
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
  return post<AnalysisResult>("/api/analyze/menu", {
    image,
    mimeType: file.type || "image/jpeg",
    fileName: file.name
  });
};

/** Extract purchasing requirements from a chat transcript (creates a pending analysis record). */
export const analyzeChat = (messages: { role: "user" | "bot"; text: string }[]): Promise<AnalysisResult> =>
  post<AnalysisResult>("/api/analyze/chat", { messages });

/** Get a conversational assistant reply for the chatbot. */
export const chatReply = (messages: { role: "user" | "bot"; text: string }[]): Promise<{ reply: string }> =>
  post<{ reply: string }>("/api/chat", { messages });

/** Format an ingredient object into a display string like "牛肉 2kg". */
export const formatIngredient = (i: Ingredient): string => {
  const qty = [i.quantity, i.unit].filter(Boolean).join("");
  return qty ? `${i.name} ${qty}` : i.name;
};
