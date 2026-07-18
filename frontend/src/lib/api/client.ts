export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787").replace(
  /\/$/,
  "",
);

export type NoraStreamEvent =
  | { type: "session"; conversationId: string }
  | { type: "assistant_start"; id: string; createdAt: string }
  | { type: "activity"; label: string }
  | { type: "delta"; delta: string }
  | { type: "reset" }
  | { type: "done"; message: NoraServerMessage; proposals: NoraProposal[] }
  | { type: "error"; message: string };

async function noraChatStream(
  id: string,
  content: string,
  conversationId: string,
  onEvent: (event: NoraStreamEvent) => void,
) {
  const response = await fetch(`${API_BASE_URL}/api/restaurants/${id}/nora/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ content, conversationId }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: ApiErrorBody } | null;
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "NORA_STREAM_FAILED",
      payload?.error?.message ?? `Nora request failed (${response.status}).`,
    );
  }
  if (!response.body) throw new Error("This browser did not provide Nora's response stream.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as NoraStreamEvent;
    onEvent(event);
    if (event.type === "error") throw new Error(event.message);
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
    if (done) break;
  }
  if (buffer) consume(buffer);
}

export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: ApiErrorBody;
    } | null;
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? `Request failed (${response.status}).`,
      error?.fieldErrors,
    );
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export const api = {
  me: () => apiRequest<import("@/types").UserSession | null>("/api/me"),
  restaurants: () =>
    apiRequest<Array<import("@/types").Restaurant & { role: string }>>("/api/me/restaurants"),
  login: (email: string, password: string) =>
    apiRequest<import("@/types").UserSession & { needsOnboarding: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    apiRequest<import("@/types").UserSession>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  verifyEmail: (token: string) =>
    apiRequest<import("@/types").UserSession>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  resendVerification: (email: string) =>
    apiRequest<{ accepted: boolean }>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  logout: () => apiRequest<void>("/api/auth/logout", { method: "POST" }),
  forgotPassword: (email: string) =>
    apiRequest<{ accepted: boolean }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    apiRequest<import("@/types").UserSession>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<void>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  sessions: () => apiRequest<AccountSession[]>("/api/me/sessions"),
  revokeSession: (sessionId: string) =>
    apiRequest<void>(`/api/me/sessions/${sessionId}`, { method: "DELETE" }),
  billing: () => apiRequest<BillingSubscription>("/api/billing/subscription"),
  billingPlans: () =>
    apiRequest<Array<{ id: BillingPlanId; available: boolean }>>("/api/billing/plans"),
  billingCheckout: (plan: BillingPlanId = "house") =>
    apiRequest<{ url: string }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  billingCancel: () =>
    apiRequest<{ accepted: boolean }>("/api/billing/cancel", { method: "POST" }),
  billingResume: () =>
    apiRequest<{ accepted: boolean }>("/api/billing/resume", { method: "POST" }),
  billingChangePlan: (plan: BillingPlanId) =>
    apiRequest<{ accepted: boolean }>("/api/billing/change-plan", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  createRestaurant: (details: import("@/types").OnboardingDetails) =>
    apiRequest<import("@/types").Restaurant>("/api/restaurants", {
      method: "POST",
      body: JSON.stringify(details),
    }),
  updateMe: (details: { name: string; email: string }) =>
    apiRequest<import("@/types").UserSession>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(details),
    }),
  updateRestaurant: (id: string, patch: Partial<import("@/types").Restaurant>) =>
    apiRequest<import("@/types").Restaurant>(`/api/restaurants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  invite: (
    id: string,
    email: string,
    role: Exclude<import("@/types").MembershipRole, "owner"> = "viewer",
  ) =>
    apiRequest<{ id: string; email: string }>(`/api/restaurants/${id}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  restaurantMembers: (id: string) =>
    apiRequest<import("@/types").RestaurantMember[]>(`/api/restaurants/${id}/members`),
  transferRestaurantOwnership: (id: string, newOwnerId: string, password: string) =>
    apiRequest<{ restaurantId: string; ownerId: string }>(
      `/api/restaurants/${id}/transfer-ownership`,
      {
        method: "POST",
        body: JSON.stringify({ newOwnerId, password }),
      },
    ),
  deleteRestaurant: (id: string, password: string, confirmation: string) =>
    apiRequest<void>(`/api/restaurants/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ password, confirmation }),
    }),
  menu: (id: string) => apiRequest<MenuPayload>(`/api/restaurants/${id}/menu`),
  publicMenu: (id: string) => apiRequest<PublicMenuPayload>(`/api/public/restaurants/${id}/menu`),
  layout: (id: string) => apiRequest<LayoutPayload>(`/api/restaurants/${id}/layout`),
  floorPlanTheme: (id: string) =>
    apiRequest<import("@/types").FloorPlanTheme>(`/api/restaurants/${id}/floor-plan-theme/draft`),
  reservations: (id: string) =>
    apiRequest<import("@/types").Reservation[]>(`/api/restaurants/${id}/reservations`),
  reservationSettings: (id: string) =>
    apiRequest<import("@/types").ReservationSettings>(
      `/api/restaurants/${id}/reservation-settings`,
    ),
  reservationTheme: (id: string) =>
    apiRequest<import("@/types").ReservationTheme>(
      `/api/restaurants/${id}/reservation-theme/draft`,
    ),
  bookingConfig: (id: string, tableCode?: string) =>
    apiRequest<BookingConfig>(
      `/api/public/restaurants/${id}/booking-config${tableCode ? `?tableCode=${encodeURIComponent(tableCode)}` : ""}`,
    ),
  orders: (id: string, view: "active" | "history" = "active", tableId?: string) =>
    apiRequest<import("@/types").Order[]>(
      `/api/restaurants/${id}/orders?view=${view}${tableId ? `&tableId=${encodeURIComponent(tableId)}` : ""}`,
    ),
  serviceRequests: (id: string, view: "active" | "history" | "all" = "active") =>
    apiRequest<import("@/types").ServiceRequest[]>(
      `/api/restaurants/${id}/service-requests?view=${view}`,
    ),
  kitchen: (id: string, history = false) =>
    apiRequest<import("@/types").KitchenItem[]>(
      `/api/restaurants/${id}/kitchen?view=${history ? "history" : "active"}`,
    ),
  tableSession: (id: string, tableCode: string, guestSessionId: string) =>
    apiRequest<TableSessionPayload>(
      `/api/public/restaurants/${id}/table-session?tableCode=${encodeURIComponent(tableCode)}&guestSessionId=${encodeURIComponent(guestSessionId)}`,
    ),
  noraCurrentConversation: (id: string) =>
    apiRequest<NoraConversation | null>(`/api/restaurants/${id}/nora/conversations/current`),
  noraConversations: (id: string) =>
    apiRequest<NoraConversationSummary[]>(`/api/restaurants/${id}/nora/conversations`),
  noraConversation: (id: string, conversationId: string) =>
    apiRequest<NoraConversation>(`/api/restaurants/${id}/nora/conversations/${conversationId}`),
  createNoraConversation: (id: string) =>
    apiRequest<NoraConversationSummary>(`/api/restaurants/${id}/nora/conversations`, {
      method: "POST",
    }),
  deleteNoraConversation: (id: string, conversationId: string) =>
    apiRequest<void>(`/api/restaurants/${id}/nora/conversations/${conversationId}`, {
      method: "DELETE",
    }),
  noraChatStream,
  noraPendingProposals: (id: string) =>
    apiRequest<NoraProposal[]>(`/api/restaurants/${id}/nora/proposals/pending`),
  noraConfirmProposal: (id: string, proposalId: string) =>
    apiRequest<NoraProposal>(`/api/restaurants/${id}/nora/proposals/${proposalId}/confirm`, {
      method: "POST",
    }),
  noraRejectProposal: (id: string, proposalId: string) =>
    apiRequest<NoraProposal>(`/api/restaurants/${id}/nora/proposals/${proposalId}/reject`, {
      method: "POST",
    }),
  mcpKeys: (id: string) => apiRequest<McpKey[]>(`/api/restaurants/${id}/mcp/keys`),
  createMcpKey: (id: string, name: string) =>
    apiRequest<McpKey & { token: string }>(`/api/restaurants/${id}/mcp/keys`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  revokeMcpKey: (id: string, keyId: string) =>
    apiRequest<void>(`/api/restaurants/${id}/mcp/keys/${keyId}`, { method: "DELETE" }),
};

export async function uploadMedia(restaurantId: string, file: File): Promise<string> {
  const uploaded = await apiRequest<{ id: string; url: string }>(
    `/api/restaurants/${restaurantId}/uploads?filename=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    },
  );
  return uploaded.url;
}

export interface MenuPayload {
  restaurant: Pick<
    import("@/types").Restaurant,
    "id" | "name" | "logoUrl" | "cuisineType" | "currency" | "language" | "timezone"
  >;
  categories: import("@/types").MenuCategory[];
  products: import("@/types").Product[];
  taxCategories: import("@/types").TaxCategory[];
  theme: import("@/types").GuestMenuTheme;
  themeRevision: number;
  versions: import("@/types").ThemeVersion[];
}
export interface PublicMenuPayload extends MenuPayload {
  restaurant: MenuPayload["restaurant"];
}
export type BillingPlanId = "table" | "house" | "group";
export type BillingPlanTier = "free" | BillingPlanId;
export type BillingFeature =
  | "menu"
  | "reservations"
  | "floorPlan"
  | "orders"
  | "nora"
  | "analytics"
  | "multiRestaurant";
export interface BillingSubscription {
  status: string;
  planName: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  testMode: boolean;
  portalUrl: string | null;
  access: "free" | "pro";
  plan: BillingPlanTier;
  limits: { restaurants: number; membersPerRestaurant: number; tablesPerRestaurant: number | null };
  features: BillingFeature[];
}
export interface AccountSession {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}
export interface LayoutPayload {
  revision: number;
  tables: import("@/types").DiningTable[];
  walls: import("@/types").WallGeometry[];
  zones: import("@/types").FloorZone[];
  updatedAt: string;
}
export interface BookingConfig {
  restaurant: import("@/types").Restaurant;
  settings: import("@/types").ReservationSettings;
  theme: import("@/types").ReservationTheme;
  floorPlanTheme: import("@/types").FloorPlanTheme | null;
  layout: Pick<LayoutPayload, "tables" | "walls" | "zones">;
  preselectedTableId: string | null;
}

export interface TableSessionPayload {
  table: Pick<import("@/types").DiningTable, "id" | "name" | "status">;
  features: { callWaiter: boolean; requestCheck: boolean };
  requests: Array<{
    id: string;
    type: import("@/types").ServiceRequestType;
    status: import("@/types").ServiceRequestStatus;
    paymentMethod: import("@/types").PaymentMethod | null;
    createdAt: string;
    acknowledgedAt: string | null;
  }>;
  orders: Array<{
    id: string;
    status: import("@/types").OrderStatus;
    totalMinor: number;
    currency: string;
    createdAt: string;
    items: Array<{
      id: string;
      productName: string;
      quantity: number;
      status: import("@/types").OrderItemStatus;
    }>;
  }>;
}

export interface NoraProposal {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  status: "pending" | "confirmed" | "rejected" | "executed" | "failed";
  createdAt: string;
}
export interface NoraServerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
export interface NoraConversationSummary {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface NoraConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: NoraServerMessage[];
  proposals: NoraProposal[];
}
export interface McpKey {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
}
