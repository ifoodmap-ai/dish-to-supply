import { describe, expect, it, vi } from "vitest";

import type { supabase } from "../integrations/supabase/client";

import {
  RestaurantRegistrationError,
  RestaurantRegistrationValidationError,
  registerRestaurant,
  validateRestaurantRegistration,
  type RestaurantRegistrationInput,
} from "./restaurant-registration";

const VALID_INPUT: RestaurantRegistrationInput = {
  restaurantName: "美味餐廳",
  contactName: "王小明",
  phone: "+886 912-345-678",
  email: "owner@example.com",
  password: "password123",
  confirmPassword: "password123",
  terms: true,
};

const UUID = "123e4567-e89b-12d3-a456-426614174000";

// Compile-time contract: the real generated Supabase client must be accepted.
const registerWithRealClient = (client: typeof supabase) =>
  registerRestaurant(client, VALID_INPUT);
void registerWithRealClient;

const createClient = () => {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: null },
    error: null,
  });
  const signUp = vi.fn().mockResolvedValue({
    data: {
      user: { identities: [{ id: "identity-id" }] },
      session: { access_token: "token" },
    },
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue({ data: UUID, error: null });

  return {
    client: {
      auth: { getSession, signUp },
      rpc,
    },
    getSession,
    signUp,
    rpc,
  };
};

describe("validateRestaurantRegistration", () => {
  it("accepts valid input", () => {
    expect(validateRestaurantRegistration(VALID_INPUT)).toEqual({});
  });

  it.each([
    [" ", "restaurantName"],
    ["一", "restaurantName"],
    ["餐".repeat(101), "restaurantName"],
    [" ", "contactName"],
    ["人".repeat(81), "contactName"],
    ["", "phone"],
    ["1234567", "phone"],
    ["1".repeat(16), "phone"],
    ["0912.345.678", "phone"],
    ["0912abc5678", "phone"],
    ["not-an-email", "email"],
    ["owner@example", "email"],
    ["1234567", "password"],
  ])("rejects %j for %s", (value, field) => {
    const input = { ...VALID_INPUT, [field]: value };

    expect(validateRestaurantRegistration(input)).toHaveProperty(field);
  });

  it("requires password confirmation to match", () => {
    expect(
      validateRestaurantRegistration({
        ...VALID_INPUT,
        confirmPassword: "different-password",
      }),
    ).toHaveProperty("confirmPassword");
  });

  it("accepts an exactly 8-character password with matching confirmation", () => {
    const password = "12345678";

    expect(
      validateRestaurantRegistration({
        ...VALID_INPUT,
        password,
        confirmPassword: password,
      }),
    ).not.toHaveProperty("password");
  });

  it("requires terms acceptance", () => {
    expect(
      validateRestaurantRegistration({ ...VALID_INPUT, terms: false }),
    ).toHaveProperty("terms");
  });

  it("counts only digits when validating a formatted phone number", () => {
    expect(
      validateRestaurantRegistration({
        ...VALID_INPUT,
        phone: " (+886) 912-345-678 ",
      }),
    ).not.toHaveProperty("phone");
  });

  it.each([
    ["restaurantName", "餐廳", false],
    ["restaurantName", "餐".repeat(100), false],
    ["restaurantName", "一", true],
    ["restaurantName", "餐".repeat(101), true],
    ["contactName", "人".repeat(80), false],
    ["contactName", "人".repeat(81), true],
    ["phone", "1".repeat(8), false],
    ["phone", "1".repeat(15), false],
    ["phone", "1".repeat(7), true],
    ["phone", "1".repeat(16), true],
  ])(
    "enforces the exact %s boundary for a value of length %i",
    (field, value, shouldHaveError) => {
      const errors = validateRestaurantRegistration({
        ...VALID_INPUT,
        [field]: value,
      });

      expect(field in errors).toBe(shouldHaveError);
    },
  );
});

describe("registerRestaurant", () => {
  it("validates before making an auth or RPC call", async () => {
    const { client, getSession, signUp, rpc } = createClient();

    await expect(
      registerRestaurant(client, { ...VALID_INPUT, restaurantName: "一" }),
    ).rejects.toMatchObject({
      name: "RestaurantRegistrationValidationError",
      fieldErrors: { restaurantName: expect.any(String) },
    });

    expect(getSession).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("signs up with normalized email and trimmed display name", async () => {
    const { client, signUp } = createClient();

    await registerRestaurant(client, {
      ...VALID_INPUT,
      contactName: "  王小明  ",
      email: "  OWNER@Example.COM  ",
    });

    expect(signUp).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: VALID_INPUT.password,
      options: { data: { display_name: "王小明" } },
    });
  });

  it("maps a normal signup without a session to confirmation required", async () => {
    const { client, signUp, rpc } = createClient();
    signUp.mockResolvedValue({
      data: {
        user: { identities: [{ id: "identity-id" }] },
        session: null,
      },
      error: null,
    });

    await expect(registerRestaurant(client, VALID_INPUT)).rejects.toMatchObject({
      name: "RestaurantRegistrationError",
      code: "EMAIL_CONFIRMATION_REQUIRED",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { code: "user_already_exists", message: "User already registered" },
    { status: 422, message: "A user with this email address has already been registered" },
  ])("maps an explicit existing-email auth error", async (authError) => {
    const { client, signUp } = createClient();
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: authError,
    });

    await expect(registerRestaurant(client, VALID_INPUT)).rejects.toMatchObject({
      code: "EMAIL_EXISTS",
    });
  });

  it("maps Supabase's empty-identities existing-user response to email exists", async () => {
    const { client, signUp } = createClient();
    signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    });

    await expect(registerRestaurant(client, VALID_INPUT)).rejects.toMatchObject({
      code: "EMAIL_EXISTS",
    });
  });

  it("maps a rejected existing-email auth error to email exists", async () => {
    const { client, signUp } = createClient();
    signUp.mockRejectedValue(new Error("User already registered"));

    await expect(registerRestaurant(client, VALID_INPUT)).rejects.toMatchObject({
      code: "EMAIL_EXISTS",
    });
  });

  it("calls onboarding RPC with only approved trimmed fields", async () => {
    const { client, rpc } = createClient();

    await registerRestaurant(client, {
      ...VALID_INPUT,
      restaurantName: "  美味餐廳  ",
      contactName: "  王小明  ",
      phone: "  +886 912-345-678  ",
    });

    expect(rpc).toHaveBeenCalledWith("create_restaurant_onboarding", {
      p_name: "美味餐廳",
      p_contact_name: "王小明",
      p_contact_phone: "+886 912-345-678",
    });
    expect(Object.keys(rpc.mock.calls[0][1])).toEqual([
      "p_name",
      "p_contact_name",
      "p_contact_phone",
    ]);
  });

  it("maps RPC failures without leaking internal details", async () => {
    const { client, rpc } = createClient();
    rpc.mockResolvedValue({
      data: null,
      error: { message: "relation private_table does not exist" },
    });

    let caught: unknown;
    try {
      await registerRestaurant(client, VALID_INPUT);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RestaurantRegistrationError);
    expect(caught).toMatchObject({ code: "ONBOARDING_FAILED" });
    expect((caught as Error).message).not.toContain("private_table");
  });

  it.each([
    {
      name: "a rejected getSession call",
      configure: ({
        getSession,
      }: ReturnType<typeof createClient>) =>
        getSession.mockRejectedValue(
          new Error("session failed at https://auth.internal.example"),
        ),
      expectedCode: "UNKNOWN",
    },
    {
      name: "a resolved getSession error",
      configure: ({
        getSession,
      }: ReturnType<typeof createClient>) =>
        getSession.mockResolvedValue({
          data: { session: null },
          error: {
            message: "session failed at https://auth.internal.example",
          },
        }),
      expectedCode: "UNKNOWN",
    },
    {
      name: "a rejected signUp call",
      configure: ({ signUp }: ReturnType<typeof createClient>) =>
        signUp.mockRejectedValue(
          new Error("signup failed at https://auth.internal.example"),
        ),
      expectedCode: "UNKNOWN",
    },
    {
      name: "an ordinary resolved signUp error",
      configure: ({ signUp }: ReturnType<typeof createClient>) =>
        signUp.mockResolvedValue({
          data: { user: null, session: null },
          error: {
            message: "signup failed at https://auth.internal.example",
          },
        }),
      expectedCode: "UNKNOWN",
    },
    {
      name: "a rejected RPC call",
      configure: ({ rpc }: ReturnType<typeof createClient>) =>
        rpc.mockRejectedValue(
          new Error("database failed at https://db.internal.example"),
        ),
      expectedCode: "ONBOARDING_FAILED",
    },
  ])(
    "maps $name to a typed generic error without leaking details",
    async ({ configure, expectedCode }) => {
      const clientState = createClient();
      configure(clientState);

      let caught: unknown;
      try {
        await registerRestaurant(clientState.client, VALID_INPUT);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(RestaurantRegistrationError);
      expect(caught).toMatchObject({ code: expectedCode });
      expect((caught as Error).message).not.toContain("internal.example");
      expect((caught as Error).message).not.toContain("https://");
    },
  );

  it("returns the UUID restaurant ID", async () => {
    const { client } = createClient();

    await expect(registerRestaurant(client, VALID_INPUT)).resolves.toEqual({
      restaurantId: UUID,
    });
  });

  it("maps an invalid RPC result to onboarding failed", async () => {
    const { client, rpc } = createClient();
    rpc.mockResolvedValue({ data: "not-a-uuid", error: null });

    await expect(registerRestaurant(client, VALID_INPUT)).rejects.toMatchObject({
      code: "ONBOARDING_FAILED",
    });
  });

  it("retries idempotent onboarding directly when a session already exists", async () => {
    const { client, getSession, signUp, rpc } = createClient();
    getSession.mockResolvedValue({
      data: { session: { access_token: "existing-token" } },
      error: null,
    });

    await expect(registerRestaurant(client, VALID_INPUT)).resolves.toEqual({
      restaurantId: UUID,
    });
    expect(signUp).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("exposes typed validation errors for UI field mapping", () => {
    const error = new RestaurantRegistrationValidationError({
      email: "請輸入有效的 Email",
    });

    expect(error.fieldErrors.email).toBe("請輸入有效的 Email");
  });
});
