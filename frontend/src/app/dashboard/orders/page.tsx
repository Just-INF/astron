import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  BellRing,
  Check,
  ChefHat,
  CircleDollarSign,
  Clock3,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  X,
} from "lucide-react";
import { DashboardPanel } from "@/components/dashboard/EmptyState";
import { api, apiRequest, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useMenuStore } from "@/stores/useMenuStore";
import type { KitchenItem, Order, OrderItemStatus, Product, ServiceRequest } from "@/types";

type OrdersTab = "requests" | "orders" | "kitchen";

export default function OrdersPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurantId = currentUser?.activeRestaurantId ?? "";
  const role = currentUser?.memberships.find(
    (membership) => membership.restaurantId === restaurantId,
  )?.role;
  const canWaiter = ["owner", "manager", "host", "waiter"].includes(role ?? "");
  const canKitchen = ["owner", "manager", "chef"].includes(role ?? "");
  const canOpen = canWaiter || canKitchen;
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<OrdersTab>(
    role === "chef" ? "kitchen" : searchParams.get("tableId") ? "orders" : "requests",
  );
  const [showHistory, setShowHistory] = useState(false);
  const [showKitchenHistory, setShowKitchenHistory] = useState(false);
  const [orderComposerOpen, setOrderComposerOpen] = useState(false);
  const queryClient = useQueryClient();

  const activeOrders = useQuery({
    queryKey: ["operations", restaurantId, "orders", "active"],
    queryFn: () => api.orders(restaurantId, "active"),
    enabled: Boolean(restaurantId && canOpen),
  });
  const historyOrders = useQuery({
    queryKey: ["operations", restaurantId, "orders", "history"],
    queryFn: () => api.orders(restaurantId, "history"),
    enabled: Boolean(restaurantId && canWaiter && showHistory),
  });
  const requests = useQuery({
    queryKey: ["operations", restaurantId, "requests", showHistory],
    queryFn: () => api.serviceRequests(restaurantId, showHistory ? "history" : "active"),
    enabled: Boolean(restaurantId && canWaiter),
  });
  const kitchen = useQuery({
    queryKey: ["operations", restaurantId, "kitchen", showKitchenHistory],
    queryFn: () => api.kitchen(restaurantId, showKitchenHistory),
    enabled: Boolean(restaurantId && canKitchen),
  });

  function refreshOperations() {
    void queryClient.invalidateQueries({ queryKey: ["operations", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "layout"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics", restaurantId] });
  }

  if (!canOpen)
    return (
      <DashboardPanel>
        <section className="orders-access-state">
          <ReceiptText size={24} />
          <h1>Orders are not available for this role</h1>
          <p>Ask a restaurant owner or manager to grant waiter or kitchen access.</p>
        </section>
      </DashboardPanel>
    );

  return (
    <DashboardPanel>
      <header className="orders-page-heading">
        <div>
          <p className="eyebrow">Live service</p>
          <h1>Orders</h1>
          <p>Coordinate tables, waiter requests, checks, and kitchen progress.</p>
        </div>
        <button className="button" type="button" onClick={refreshOperations}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <div className="orders-tabs" role="tablist" aria-label="Order workspace">
        {canWaiter && (
          <button
            role="tab"
            aria-selected={tab === "requests"}
            className={tab === "requests" ? "active" : ""}
            onClick={() => setTab("requests")}
          >
            <BellRing size={15} /> Requests
            {(requests.data?.length ?? 0) > 0 && <b>{requests.data!.length}</b>}
          </button>
        )}
        {canWaiter && (
          <button
            role="tab"
            aria-selected={tab === "orders"}
            className={tab === "orders" ? "active" : ""}
            onClick={() => {
              setTab("orders");
              setShowHistory(false);
            }}
          >
            <ReceiptText size={15} /> Table orders
          </button>
        )}
        {canKitchen && (
          <button
            role="tab"
            aria-selected={tab === "kitchen"}
            className={tab === "kitchen" ? "active" : ""}
            onClick={() => setTab("kitchen")}
          >
            <ChefHat size={15} /> Kitchen
          </button>
        )}
      </div>

      {tab === "requests" && canWaiter && (
        <RequestsView
          requests={requests.data ?? []}
          pending={requests.isPending}
          error={requests.error}
          history={showHistory}
          onHistory={setShowHistory}
          restaurantId={restaurantId}
          onChanged={refreshOperations}
        />
      )}
      {tab === "orders" && canWaiter && (
        <OrdersView
          orders={showHistory ? (historyOrders.data ?? []) : (activeOrders.data ?? [])}
          pending={showHistory ? historyOrders.isPending : activeOrders.isPending}
          error={showHistory ? historyOrders.error : activeOrders.error}
          history={showHistory}
          onHistory={setShowHistory}
          restaurantId={restaurantId}
          initialTableId={searchParams.get("tableId") ?? ""}
          creating={orderComposerOpen}
          onCreating={setOrderComposerOpen}
          onChanged={refreshOperations}
        />
      )}
      {tab === "kitchen" && canKitchen && (
        <KitchenView
          items={kitchen.data ?? []}
          pending={kitchen.isPending}
          error={kitchen.error}
          restaurantId={restaurantId}
          onChanged={refreshOperations}
          history={showKitchenHistory}
          onHistory={setShowKitchenHistory}
        />
      )}
    </DashboardPanel>
  );
}

function RequestsView({
  requests,
  pending,
  error,
  history,
  onHistory,
  restaurantId,
  onChanged,
}: {
  requests: ServiceRequest[];
  pending: boolean;
  error: unknown;
  history: boolean;
  onHistory: (value: boolean) => void;
  restaurantId: string;
  onChanged: () => void;
}) {
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  async function update(request: ServiceRequest) {
    setWorkingId(request.id);
    setActionError(null);
    try {
      await apiRequest(`/api/restaurants/${restaurantId}/service-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: request.status === "new" ? "acknowledged" : "completed" }),
      });
      onChanged();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : "Request could not be updated.",
      );
      onChanged();
    } finally {
      setWorkingId(null);
    }
  }
  return (
    <section className="operations-section">
      <OperationsToolbar title="Service requests" history={history} onHistory={onHistory} />
      {actionError && (
        <p className="orders-error" role="alert">
          {actionError}
        </p>
      )}
      {pending ? (
        <OperationsLoading />
      ) : error ? (
        <OperationsError error={error} />
      ) : requests.length === 0 ? (
        <OperationsEmpty
          icon={<BellRing size={20} />}
          title={history ? "No completed requests" : "No tables need attention"}
        />
      ) : (
        <div className="request-queue">
          {requests.map((request) => (
            <article className={`service-request-card status-${request.status}`} key={request.id}>
              <header>
                <span>
                  {request.type === "check" ? (
                    <CircleDollarSign size={17} />
                  ) : (
                    <BellRing size={17} />
                  )}
                </span>
                <div>
                  <h3>{request.tableName}</h3>
                  <p>{request.type === "check" ? "Check requested" : "Waiter called"}</p>
                </div>
                <StatusBadge status={request.status} />
              </header>
              <div className="request-meta">
                <span>
                  <Clock3 size={13} /> {elapsed(request.createdAt)}
                </span>
                {request.paymentMethod && <strong>Payment: {request.paymentMethod}</strong>}
              </div>
              {request.notes && <p className="request-notes">“{request.notes}”</p>}
              {request.status !== "completed" && (
                <button
                  className="button button-primary"
                  disabled={workingId === request.id}
                  onClick={() => update(request)}
                >
                  <Check size={14} />{" "}
                  {workingId === request.id
                    ? "Updating…"
                    : request.status === "new"
                      ? "Acknowledge"
                      : "Mark completed"}
                </button>
              )}
              {request.acknowledgedByName && <small>Taken by {request.acknowledgedByName}</small>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function OrdersView({
  orders,
  pending,
  error,
  history,
  onHistory,
  restaurantId,
  initialTableId,
  creating,
  onCreating,
  onChanged,
}: {
  orders: Order[];
  pending: boolean;
  error: unknown;
  history: boolean;
  onHistory: (value: boolean) => void;
  restaurantId: string;
  initialTableId: string;
  creating: boolean;
  onCreating: (value: boolean) => void;
  onChanged: () => void;
}) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [checkOrder, setCheckOrder] = useState<Order | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  async function complete(orderId: string) {
    setCompletingId(orderId);
    setActionError(null);
    try {
      await apiRequest(`/api/restaurants/${restaurantId}/orders/${orderId}/complete`, {
        method: "POST",
      });
      setCheckOrder(null);
      onChanged();
    } catch (completeError) {
      setActionError(
        completeError instanceof Error ? completeError.message : "Order could not be completed.",
      );
    } finally {
      setCompletingId(null);
    }
  }
  return (
    <section className="operations-section">
      <OperationsToolbar title="Table orders" history={history} onHistory={onHistory}>
        {!history && (
          <button className="button button-primary" onClick={() => onCreating(true)}>
            <Plus size={14} /> New order
          </button>
        )}
      </OperationsToolbar>
      {actionError && (
        <p className="orders-error" role="alert">
          {actionError}
        </p>
      )}
      {pending ? (
        <OperationsLoading />
      ) : error ? (
        <OperationsError error={error} />
      ) : orders.length === 0 ? (
        <OperationsEmpty
          icon={<ReceiptText size={20} />}
          title={history ? "No previous orders" : "No active table orders"}
        />
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <header>
                <div>
                  <p>{order.tableName}</p>
                  <h3>{money(order.totalMinor, order.currency)}</h3>
                </div>
                <StatusBadge status={order.status} />
              </header>
              <p className="order-time">
                <Clock3 size={13} /> Opened {elapsed(order.createdAt)}{" "}
                {order.createdByName ? `by ${order.createdByName}` : ""}
              </p>
              {order.notes && <p className="request-notes">Order note: {order.notes}</p>}
              <div className="order-item-progress">
                {order.items.map((item) => (
                  <div key={item.id}>
                    <span>
                      <b>{item.quantity}×</b> {item.productName}
                    </span>
                    <StatusBadge status={item.status} />
                    {item.notes && <small>{item.notes}</small>}
                  </div>
                ))}
              </div>
              {!history && (
                <div className="order-service-actions">
                  <button className="button" type="button" onClick={() => setCheckOrder(order)}>
                    <ReceiptText size={14} /> Present check
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={
                      completingId === order.id ||
                      order.items.some((item) => item.status !== "done")
                    }
                    title={
                      order.items.some((item) => item.status !== "done")
                        ? "All order items must be ready first"
                        : "Close this table without waiting for a guest request"
                    }
                    onClick={() => complete(order.id)}
                  >
                    <Check size={14} /> {completingId === order.id ? "Closing…" : "Close table"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {creating && (
        <OrderComposer
          restaurantId={restaurantId}
          initialTableId={initialTableId}
          onClose={() => onCreating(false)}
          onCreated={() => {
            onCreating(false);
            onChanged();
          }}
        />
      )}
      {checkOrder && (
        <OrderCheck
          order={checkOrder}
          closing={completingId === checkOrder.id}
          onClose={() => setCheckOrder(null)}
          onCloseTable={() => void complete(checkOrder.id)}
        />
      )}
    </section>
  );
}

function OrderCheck({
  order,
  closing,
  onClose,
  onCloseTable,
}: {
  order: Order;
  closing: boolean;
  onClose: () => void;
  onCloseTable: () => void;
}) {
  const readyToClose = order.items.every((item) => item.status === "done");
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !closing) onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closing, onClose]);
  return (
    <div
      className="modal-overlay order-check-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closing) onClose();
      }}
    >
      <section
        className="order-check"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-check-title"
      >
        <header>
          <div>
            <p className="eyebrow">Table check</p>
            <h2 id="order-check-title">{order.tableName}</h2>
            <span>Order {order.id.slice(-8).toUpperCase()}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close check">
            <X size={17} />
          </button>
        </header>
        <div className="order-check-items">
          {order.items.map((item) => (
            <div key={item.id}>
              <span>
                <b>{item.quantity}×</b> {item.productName}
              </span>
              <strong>{money(item.totalMinor, order.currency)}</strong>
            </div>
          ))}
        </div>
        <dl>
          <div>
            <dt>Subtotal</dt>
            <dd>{money(order.subtotalMinor, order.currency)}</dd>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{money(order.taxMinor, order.currency)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{money(order.totalMinor, order.currency)}</dd>
          </div>
        </dl>
        <p className="order-check-note">
          This check can be presented or printed at any time—no guest request is required.
        </p>
        <footer>
          <button className="button" type="button" onClick={() => window.print()}>
            <Printer size={14} /> Print check
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!readyToClose || closing}
            title={!readyToClose ? "All order items must be ready first" : undefined}
            onClick={onCloseTable}
          >
            <Check size={14} /> {closing ? "Closing…" : "Close table"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function OrderComposer({
  restaurantId,
  initialTableId,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  initialTableId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const tables = useLayoutStore((state) => state.tables[restaurantId] ?? []);
  const products = useMenuStore((state) => state.products[restaurantId] ?? []);
  const categories = useMenuStore((state) => state.categories[restaurantId] ?? []);
  const [tableId, setTableId] = useState(initialTableId || tables[0]?.id || "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = products.filter((product) => (quantities[product.id] ?? 0) > 0);
  const selectedCount = selected.reduce(
    (total, product) => total + (quantities[product.id] ?? 0),
    0,
  );
  const grouped = useMemo(
    () =>
      categories
        .map((category) => ({
          category,
          products: products.filter(
            (product) => product.categoryId === category.id && product.isAvailable,
          ),
        }))
        .filter((group) => group.products.length),
    [categories, products],
  );
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, submitting]);
  function change(product: Product, delta: number) {
    setQuantities((current) => ({
      ...current,
      [product.id]: Math.max(0, Math.min(99, (current[product.id] ?? 0) + delta)),
    }));
  }
  async function submit() {
    if (!tableId || selected.length === 0) {
      setError("Choose a table and at least one menu item.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/restaurants/${restaurantId}/orders`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          tableId,
          notes: notes.trim() || undefined,
          items: selected.map((product) => ({
            productId: product.id,
            quantity: quantities[product.id],
            notes: itemNotes[product.id]?.trim() || undefined,
          })),
        }),
      });
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Order could not be created.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="modal-overlay order-composer-overlay" onClick={onClose}>
      <div
        className="order-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-order-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="order-composer-heading">
            <span className="order-composer-mark">
              <ReceiptText size={18} />
            </span>
            <div>
              <p className="eyebrow">Waiter order</p>
              <h2 id="new-order-heading">Take a new order</h2>
              <p>Choose a table, then add items from the live menu.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close order composer">
            <X size={17} />
          </button>
        </header>
        <div className="order-composer-body">
          <div className="composer-table-strip">
            <label>
              <span>Serving table</span>
              <select
                autoFocus
                value={tableId}
                onChange={(event) => setTableId(event.target.value)}
              >
                {tables
                  .filter((table) => table.linked !== false)
                  .map((table) => (
                    <option value={table.id} key={table.id}>
                      {table.name} · {table.capacity} covers
                    </option>
                  ))}
              </select>
            </label>
            <div className={selectedCount ? "composer-selection has-items" : "composer-selection"}>
              <span>Current order</span>
              <strong>{selectedCount}</strong>
              <small>{selectedCount === 1 ? "item" : "items"}</small>
            </div>
          </div>
          <div className="composer-menu">
            {grouped.map(({ category, products: groupProducts }) => (
              <section key={category.id}>
                <header>
                  <h3>{category.name}</h3>
                  <span>{groupProducts.length} available</span>
                </header>
                {groupProducts.map((product) => (
                  <article
                    className={(quantities[product.id] ?? 0) > 0 ? "is-selected" : ""}
                    key={product.id}
                  >
                    <div>
                      <b>{product.name}</b>
                      <small>{product.description}</small>
                    </div>
                    <div className="order-quantity">
                      <button
                        type="button"
                        aria-label={`Remove one ${product.name}`}
                        onClick={() => change(product, -1)}
                        disabled={!quantities[product.id]}
                      >
                        <Minus size={13} />
                      </button>
                      <strong aria-live="polite">{quantities[product.id] ?? 0}</strong>
                      <button
                        type="button"
                        aria-label={`Add one ${product.name}`}
                        onClick={() => change(product, 1)}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    {(quantities[product.id] ?? 0) > 0 && (
                      <input
                        aria-label={`Notes for ${product.name}`}
                        placeholder="Item notes, allergies, doneness…"
                        value={itemNotes[product.id] ?? ""}
                        onChange={(event) =>
                          setItemNotes((current) => ({
                            ...current,
                            [product.id]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </article>
                ))}
              </section>
            ))}
          </div>
          <label className="composer-order-notes">
            <span>
              Order notes <small>optional</small>
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything the kitchen or service team should know…"
            />
          </label>
          {error && (
            <p className="orders-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          <span>
            <b>{selectedCount}</b> {selectedCount === 1 ? "item" : "items"} selected
          </span>
          <div>
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={submitting || selected.length === 0}
              onClick={submit}
            >
              {submitting ? "Submitting…" : "Send to kitchen"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function KitchenView({
  items,
  pending,
  error,
  restaurantId,
  onChanged,
  history,
  onHistory,
}: {
  items: KitchenItem[];
  pending: boolean;
  error: unknown;
  restaurantId: string;
  onChanged: () => void;
  history: boolean;
  onHistory: (value: boolean) => void;
}) {
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const columns: Array<{ status: OrderItemStatus; title: string }> = [
    { status: "not_taken", title: "Not yet taken" },
    { status: "preparing", title: "Preparing" },
    { status: "done", title: "Done" },
  ];
  async function advance(item: KitchenItem) {
    setWorkingId(item.id);
    setActionError(null);
    try {
      if (item.status === "not_taken")
        await apiRequest(`/api/restaurants/${restaurantId}/kitchen/items/${item.id}/claim`, {
          method: "POST",
        });
      else
        await apiRequest(`/api/restaurants/${restaurantId}/kitchen/items/${item.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done" }),
        });
      onChanged();
    } catch (advanceError) {
      setActionError(
        advanceError instanceof Error ? advanceError.message : "Kitchen item could not be updated.",
      );
      onChanged();
    } finally {
      setWorkingId(null);
    }
  }
  if (pending) return <OperationsLoading />;
  if (error) return <OperationsError error={error} />;
  return (
    <section className="operations-section">
      <div className="operations-toolbar">
        <div>
          <p className="eyebrow">Kitchen display</p>
          <h2>{history ? "Completed items" : "Preparation queue"}</h2>
        </div>
        <div>
          <button className={!history ? "active" : ""} onClick={() => onHistory(false)}>
            Active
          </button>
          <button className={history ? "active" : ""} onClick={() => onHistory(true)}>
            Completed
          </button>
        </div>
      </div>
      {actionError && (
        <p className="orders-error" role="alert">
          {actionError}
        </p>
      )}
      <div className="kitchen-board">
        {columns
          .filter((column) => !history || column.status === "done")
          .map((column) => {
            const columnItems = items.filter((item) => item.status === column.status);
            return (
              <section className={`kitchen-column kitchen-${column.status}`} key={column.status}>
                <header>
                  <h3>{column.title}</h3>
                  <b>{columnItems.length}</b>
                </header>
                {columnItems.length === 0 ? (
                  <p className="kitchen-empty">Nothing here</p>
                ) : (
                  columnItems.map((item) => (
                    <article key={item.id}>
                      <div className="kitchen-ticket-top">
                        <strong>{item.tableName}</strong>
                        <span>{elapsed(item.orderCreatedAt)}</span>
                      </div>
                      <h4>
                        {item.quantity}× {item.productName}
                      </h4>
                      {item.notes && <p>{item.notes}</p>}
                      {item.orderNotes && <small>Order: {item.orderNotes}</small>}
                      <footer>
                        {item.assignedChefName ? (
                          <span>
                            <ChefHat size={12} /> {item.assignedChefName}
                          </span>
                        ) : (
                          <span>Unassigned</span>
                        )}
                        {item.status !== "done" && (
                          <button disabled={workingId === item.id} onClick={() => advance(item)}>
                            {workingId === item.id
                              ? "Updating…"
                              : item.status === "not_taken"
                                ? "Claim item"
                                : "Mark done"}
                          </button>
                        )}
                      </footer>
                    </article>
                  ))
                )}
              </section>
            );
          })}
      </div>
    </section>
  );
}

function OperationsToolbar({
  title,
  history,
  onHistory,
  children,
}: {
  title: string;
  history: boolean;
  onHistory: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="operations-toolbar">
      <div>
        <p className="eyebrow">Operations queue</p>
        <h2>{title}</h2>
      </div>
      <div>
        <button className={!history ? "active" : ""} onClick={() => onHistory(false)}>
          Active
        </button>
        <button className={history ? "active" : ""} onClick={() => onHistory(true)}>
          Previous
        </button>
        {children}
      </div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`operations-status status-${status}`}>{status.replaceAll("_", " ")}</span>
  );
}
function OperationsLoading() {
  return (
    <div className="operations-loading">
      <RefreshCw className="spin" size={17} /> Updating live service
    </div>
  );
}
function OperationsError({ error }: { error: unknown }) {
  return (
    <div className="orders-access-state">
      <ReceiptText size={20} />
      <h2>Operations could not be loaded</h2>
      <p>{error instanceof ApiError ? error.message : "Please retry in a moment."}</p>
    </div>
  );
}
function OperationsEmpty({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="operations-empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>Live updates will appear here automatically.</p>
    </div>
  );
}
function elapsed(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return minutes < 1
    ? "just now"
    : minutes < 60
      ? `${minutes}m ago`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
function money(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
}
