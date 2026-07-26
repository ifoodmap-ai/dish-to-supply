export interface RestaurantRegistrationInput {
  restaurantName: string;
  contactName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
}

export type RegistrationErrors = Partial<
  Record<keyof RestaurantRegistrationInput, string>
>;

export const REGISTRATION_ERROR_CODES = {
  EMAIL_EXISTS: "EMAIL_EXISTS",
  EMAIL_CONFIRMATION_REQUIRED: "EMAIL_CONFIRMATION_REQUIRED",
  SESSION_EMAIL_MISMATCH: "SESSION_EMAIL_MISMATCH",
  ONBOARDING_FAILED: "ONBOARDING_FAILED",
  UNKNOWN: "UNKNOWN",
} as const;

export type RestaurantRegistrationErrorCode =
  (typeof REGISTRATION_ERROR_CODES)[keyof typeof REGISTRATION_ERROR_CODES];

interface AuthError {
  code?: string;
  message?: string;
  status?: number;
}

interface AuthUser {
  identities?: readonly unknown[] | null;
}

interface AuthResult {
  data: {
    user: AuthUser | null;
    session: unknown | null;
  };
  error: AuthError | null;
}

interface RegistrationSession {
  user: {
    email?: string | null;
  };
}

interface SessionResult {
  data: {
    session: RegistrationSession | null;
  };
  error: AuthError | null;
}

interface RpcResult {
  data: string | null;
  error: { message?: string } | null;
}

export interface RestaurantRegistrationClient {
  auth: {
    getSession(): PromiseLike<SessionResult>;
    signUp(credentials: {
      email: string;
      password: string;
      options: {
        data: {
          display_name: string;
        };
      };
    }): PromiseLike<AuthResult>;
  };
  rpc(
    functionName: "create_restaurant_onboarding",
    args: {
      p_name: string;
      p_contact_name?: string | null;
      p_contact_phone?: string | null;
    },
  ): PromiseLike<RpcResult>;
}

const ERROR_MESSAGES: Record<RestaurantRegistrationErrorCode, string> = {
  EMAIL_EXISTS: "請確認你的 Email",
  EMAIL_CONFIRMATION_REQUIRED: "請確認你的 Email",
  SESSION_EMAIL_MISMATCH: "目前登入帳號與註冊 Email 不一致",
  ONBOARDING_FAILED: "餐廳帳號建立失敗，請稍後再試",
  UNKNOWN: "註冊失敗，請稍後再試",
};

export class RestaurantRegistrationError extends Error {
  readonly code: RestaurantRegistrationErrorCode;

  constructor(
    code: RestaurantRegistrationErrorCode,
    message = ERROR_MESSAGES[code],
  ) {
    super(message);
    this.name = "RestaurantRegistrationError";
    this.code = code;
  }
}

export class RestaurantRegistrationValidationError extends Error {
  readonly fieldErrors: RegistrationErrors;

  constructor(fieldErrors: RegistrationErrors) {
    super("請檢查註冊資料");
    this.name = "RestaurantRegistrationValidationError";
    this.fieldErrors = fieldErrors;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARACTERS_PATTERN = /^[\d\s+()-]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codePointLength = (value: string): number => Array.from(value).length;

export const validateRestaurantRegistration = (
  input: RestaurantRegistrationInput,
): RegistrationErrors => {
  const errors: RegistrationErrors = {};
  const restaurantName = input.restaurantName.trim();
  const contactName = input.contactName.trim();
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();
  const phoneDigitCount = phone.replace(/\D/g, "").length;
  const restaurantNameLength = codePointLength(restaurantName);
  const contactNameLength = codePointLength(contactName);

  if (restaurantNameLength < 2 || restaurantNameLength > 100) {
    errors.restaurantName = "餐廳名稱需為 2 至 100 個字元";
  }

  if (!contactName) {
    errors.contactName = "請輸入聯絡人姓名";
  } else if (contactNameLength > 80) {
    errors.contactName = "聯絡人姓名不可超過 80 個字元";
  }

  if (
    !phone ||
    phone.length > 30 ||
    !PHONE_CHARACTERS_PATTERN.test(phone) ||
    phoneDigitCount < 8 ||
    phoneDigitCount > 15
  ) {
    errors.phone = "請輸入包含 8 至 15 位數字的有效電話";
  }

  if (!EMAIL_PATTERN.test(email)) {
    errors.email = "請輸入有效的 Email";
  }

  if (input.password.length < 8) {
    errors.password = "密碼至少需要 8 個字元";
  }

  if (input.confirmPassword !== input.password) {
    errors.confirmPassword = "兩次輸入的密碼不一致";
  }

  if (!input.terms) {
    errors.terms = "請先同意服務條款";
  }

  return errors;
};

const isExistingUserError = (error: AuthError): boolean => {
  const code = error.code?.toLowerCase();
  if (code === "user_already_exists" || code === "email_exists") {
    return true;
  }

  const message = error.message ?? "";
  return /already (?:been )?registered|already exists|user.+exists/i.test(
    message,
  );
};

const runOnboarding = async (
  client: RestaurantRegistrationClient,
  input: RestaurantRegistrationInput,
): Promise<{ restaurantId: string }> => {
  let result: RpcResult;
  try {
    result = await client.rpc("create_restaurant_onboarding", {
      p_name: input.restaurantName.trim(),
      p_contact_name: input.contactName.trim(),
      p_contact_phone: input.phone.trim(),
    });
  } catch {
    throw new RestaurantRegistrationError("ONBOARDING_FAILED");
  }

  if (
    result.error ||
    typeof result.data !== "string" ||
    !UUID_PATTERN.test(result.data)
  ) {
    throw new RestaurantRegistrationError("ONBOARDING_FAILED");
  }

  return { restaurantId: result.data };
};

export const registerRestaurant = async (
  client: RestaurantRegistrationClient,
  input: RestaurantRegistrationInput,
): Promise<{ restaurantId: string }> => {
  const fieldErrors = validateRestaurantRegistration(input);
  if (Object.keys(fieldErrors).length > 0) {
    throw new RestaurantRegistrationValidationError(fieldErrors);
  }

  let sessionResult: SessionResult;
  try {
    sessionResult = await client.auth.getSession();
  } catch {
    throw new RestaurantRegistrationError("UNKNOWN");
  }

  if (sessionResult.error) {
    throw new RestaurantRegistrationError("UNKNOWN");
  }

  if (sessionResult.data.session) {
    const sessionEmail = sessionResult.data.session.user.email
      ?.trim()
      .toLowerCase();
    const submittedEmail = input.email.trim().toLowerCase();
    if (!sessionEmail || sessionEmail !== submittedEmail) {
      throw new RestaurantRegistrationError("SESSION_EMAIL_MISMATCH");
    }

    return runOnboarding(client, input);
  }

  let authResult: AuthResult;
  try {
    authResult = await client.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        data: {
          display_name: input.contactName.trim(),
        },
      },
    });
  } catch (error) {
    throw new RestaurantRegistrationError(
      error instanceof Error && isExistingUserError(error)
        ? "EMAIL_EXISTS"
        : "UNKNOWN",
    );
  }

  if (authResult.error) {
    throw new RestaurantRegistrationError(
      isExistingUserError(authResult.error) ? "EMAIL_EXISTS" : "UNKNOWN",
    );
  }

  if (
    !authResult.data.session &&
    authResult.data.user &&
    Array.isArray(authResult.data.user.identities) &&
    authResult.data.user.identities.length === 0
  ) {
    throw new RestaurantRegistrationError("EMAIL_EXISTS");
  }

  if (!authResult.data.session) {
    throw new RestaurantRegistrationError("EMAIL_CONFIRMATION_REQUIRED");
  }

  return runOnboarding(client, input);
};
