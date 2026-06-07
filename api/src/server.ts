import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { supabase } from "./lib/supabase.js";

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
