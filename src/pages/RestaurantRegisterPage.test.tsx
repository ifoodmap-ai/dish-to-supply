import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RestaurantRegistrationError,
  type RestaurantRegistrationInput,
} from "@/lib/restaurant-registration";
import RestaurantRegisterPage from "./RestaurantRegisterPage";
import LoginPortal from "./LoginPortal";

const { navigate, registerRestaurant, toastSuccess } = vi.hoisted(() => ({
  navigate: vi.fn(),
  registerRestaurant: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/lib/restaurant-registration", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/restaurant-registration")
  >("@/lib/restaurant-registration");
  return {
    ...actual,
    registerRestaurant,
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: "zh",
    setLanguage: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

const VALID_INPUT: RestaurantRegistrationInput = {
  restaurantName: "好食餐廳",
  contactName: "王小明",
  phone: "0912345678",
  email: "owner@example.com",
  password: "password123",
  confirmPassword: "password123",
  terms: true,
};

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

const renderPage = () =>
  render(
    <MemoryRouter>
      <RestaurantRegisterPage />
    </MemoryRouter>,
  );

const fillValidForm = async () => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("餐廳名稱"), VALID_INPUT.restaurantName);
  await user.type(
    screen.getByLabelText("聯絡人姓名"),
    VALID_INPUT.contactName,
  );
  await user.type(screen.getByLabelText("聯絡電話"), VALID_INPUT.phone);
  await user.type(screen.getByLabelText("Email"), VALID_INPUT.email);
  await user.type(screen.getByLabelText("密碼"), VALID_INPUT.password);
  await user.type(
    screen.getByLabelText("確認密碼"),
    VALID_INPUT.confirmPassword,
  );
  await user.click(screen.getByRole("checkbox", { name: "同意服務條款" }));
  return user;
};

describe("RestaurantRegisterPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    registerRestaurant.mockReset();
    toastSuccess.mockReset();
  });

  it("renders every registration field and the login entry", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "免費建立餐廳帳號" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("餐廳名稱")).toHaveAttribute(
      "autocomplete",
      "organization",
    );
    expect(screen.getByLabelText("聯絡人姓名")).toHaveAttribute(
      "autocomplete",
      "name",
    );
    expect(screen.getByLabelText("聯絡電話")).toHaveAttribute(
      "autocomplete",
      "tel",
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("密碼")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("確認密碼")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(
      screen.getByRole("checkbox", { name: "同意服務條款" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "登入平台" }),
    ).toHaveAttribute("href", "/");
  });

  it("shows adjacent validation errors and focuses the first invalid field", async () => {
    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: "建立餐廳帳號" }),
    );

    const restaurantName = screen.getByLabelText("餐廳名稱");
    expect(restaurantName).toHaveFocus();
    expect(restaurantName).toHaveAttribute("aria-invalid", "true");
    expect(restaurantName).toHaveAccessibleDescription(
      "餐廳名稱需為 2 至 100 個字元",
    );
    expect(registerRestaurant).not.toHaveBeenCalled();
  });

  it("guards duplicate submission and disables the button while pending", async () => {
    let resolveRegistration!: (value: { restaurantId: string }) => void;
    registerRestaurant.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegistration = resolve;
        }),
    );
    renderPage();
    await fillValidForm();

    const form = screen
      .getByRole("button", { name: "建立餐廳帳號" })
      .closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(registerRestaurant).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "正在建立帳號" }),
    ).toBeDisabled();

    resolveRegistration({ restaurantId: crypto.randomUUID() });
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it("toasts and navigates to the restaurant dashboard after success", async () => {
    registerRestaurant.mockResolvedValue({
      restaurantId: crypto.randomUUID(),
    });
    renderPage();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("餐廳帳號已建立", {
        description: "歡迎加入 iFoodmap，現在開始設定你的採購流程。",
      });
      expect(navigate).toHaveBeenCalledWith("/restaurant", { replace: true });
    });
    expect(registerRestaurant).toHaveBeenCalledWith(
      expect.anything(),
      VALID_INPUT,
    );
  });

  it("shows an existing-email alert with a login action and clears passwords", async () => {
    registerRestaurant.mockRejectedValue(
      new RestaurantRegistrationError("EMAIL_EXISTS"),
    );
    renderPage();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

    const alert = await screen.findByRole("alert", {
      name: "此 Email 已經註冊",
    });
    expect(alert).toBeInTheDocument();
    expect(
      within(alert).getByRole("link", { name: "登入平台" }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByLabelText("餐廳名稱")).toHaveValue(
      VALID_INPUT.restaurantName,
    );
    expect(screen.getByLabelText("密碼")).toHaveValue("");
    expect(screen.getByLabelText("確認密碼")).toHaveValue("");
  });

  it("explains when email confirmation is required without navigating", async () => {
    registerRestaurant.mockRejectedValue(
      new RestaurantRegistrationError("EMAIL_CONFIRMATION_REQUIRED"),
    );
    renderPage();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

    expect(
      await screen.findByText(
        "目前需要先完成 Email 驗證；驗證信與啟用時間依系統設定而定。",
      ),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("密碼")).toHaveValue("");
  });

  it.each(["ONBOARDING_FAILED", "UNKNOWN"] as const)(
    "shows a safe message for %s, preserves non-password fields, and clears passwords",
    async (code) => {
      registerRestaurant.mockRejectedValue(
        new RestaurantRegistrationError(code, "database raw internal detail"),
      );
      renderPage();
      const user = await fillValidForm();

      await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

      expect(
        await screen.findByText("帳號建立未完成，請稍後再試或聯絡客服協助。"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("database raw internal detail"),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("餐廳名稱")).toHaveValue(
        VALID_INPUT.restaurantName,
      );
      expect(screen.getByLabelText("聯絡人姓名")).toHaveValue(
        VALID_INPUT.contactName,
      );
      expect(screen.getByLabelText("密碼")).toHaveValue("");
      expect(screen.getByLabelText("確認密碼")).toHaveValue("");
    },
  );

  it("maps an unexpected network failure to the safe message", async () => {
    registerRestaurant.mockRejectedValue(
      new Error("fetch failed at https://internal.example"),
    );
    renderPage();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

    expect(
      await screen.findByText("帳號建立未完成，請稍後再試或聯絡客服協助。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("fetch failed at https://internal.example"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue(VALID_INPUT.email);
    expect(screen.getByLabelText("密碼")).toHaveValue("");
  });
});

describe("LoginPortal restaurant signup entry", () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  it("links restaurant users to self-service registration", async () => {
    render(
      <MemoryRouter>
        <LoginPortal />
      </MemoryRouter>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /我是餐廳/ }),
    );

    expect(
      screen.getByRole("link", { name: "免費建立餐廳帳號" }),
    ).toHaveAttribute("href", "/register/restaurant");
  });
});
