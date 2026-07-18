import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  BellRing,
  Check,
  CreditCard,
  MessageSquareText,
  ReceiptText,
  X,
} from "lucide-react";
import { api, apiRequest } from "@/lib/api/client";
import type { PaymentMethod, ServiceRequestType } from "@/types";

function guestSession(restaurantId: string, tableCode: string) {
  const key = `astron_table_session:${restaurantId}:${tableCode}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
    const value = crypto.randomUUID();
    localStorage.setItem(key, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

export function PublicTableActions({
  restaurantId,
  tableCode,
}: {
  restaurantId: string;
  tableCode: string;
}) {
  const [sessionId] = useState(() => guestSession(restaurantId, tableCode));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<ServiceRequestType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const query = useQuery({
    queryKey: ["table-session", restaurantId, tableCode, sessionId],
    queryFn: () => api.tableSession(restaurantId, tableCode, sessionId),
    refetchInterval: 4_000,
    retry: 1,
  });

  async function send(type: ServiceRequestType, method: PaymentMethod | null = paymentMethod) {
    if (type === "check" && !method) {
      setError("Choose card or cash before requesting the check.");
      return;
    }
    setSubmitting(type);
    setError(null);
    setMessage(null);
    try {
      const result = await apiRequest<{ duplicate: boolean; status: string }>(
        `/api/public/restaurants/${restaurantId}/table-requests`,
        {
          method: "POST",
          body: JSON.stringify({
            tableCode,
            guestSessionId: sessionId,
            type,
            paymentMethod: type === "check" ? method : undefined,
            notes: notes.trim() || undefined,
          }),
        },
      );
      setMessage(
        result.duplicate
          ? "Already in the staff queue."
          : type === "check"
            ? "Check requested."
            : "Waiter called.",
      );
      setNotes("");
      setNotesOpen(false);
      setCheckOpen(false);
      await query.refetch();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The request could not be sent.");
    } finally {
      setSubmitting(null);
    }
  }

  if (query.isPending)
    return <div className="floating-pillbox is-loading">Connecting table service…</div>;
  if (query.isError || !query.data) return null;
  const data = query.data;
  const waiterRequest = data.requests.find((request) => request.type === "waiter_call");
  const checkRequest = data.requests.find((request) => request.type === "check");
  if (!data.features.callWaiter && !data.features.requestCheck && !data.orders.length) return null;

  function choosePayment(method: PaymentMethod) {
    setPaymentMethod(method);
    void send("check", method);
  }

  return (
    <div className="floating-pillbox">
      {(notesOpen || checkOpen) && (
        <div className="pillbox-popover">
          {checkOpen ? (
            <>
              <header>
                <div>
                  <span>Request check</span>
                  <b>How would you like to pay?</b>
                </div>
                <button
                  type="button"
                  aria-label="Close payment choices"
                  onClick={() => setCheckOpen(false)}
                >
                  <X size={14} />
                </button>
              </header>
              <div className="pillbox-payment" role="group" aria-label="Payment method">
                <button
                  type="button"
                  onClick={() => choosePayment("card")}
                  disabled={submitting !== null}
                >
                  <span>
                    <CreditCard size={19} />
                  </span>
                  <b>Card</b>
                  <small>Pay by card</small>
                </button>
                <button
                  type="button"
                  onClick={() => choosePayment("cash")}
                  disabled={submitting !== null}
                >
                  <span>
                    <Banknote size={19} />
                  </span>
                  <b>Cash</b>
                  <small>Pay with cash</small>
                </button>
              </div>
            </>
          ) : (
            <>
              <header>
                <div>
                  <span>Service note</span>
                  <b>Add a note for the team</b>
                </div>
                <button type="button" aria-label="Close note" onClick={() => setNotesOpen(false)}>
                  <X size={14} />
                </button>
              </header>
              <div className="pillbox-notes">
                <input
                  autoFocus
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={1000}
                  placeholder="Water, allergy, seating request…"
                />
              </div>
            </>
          )}
        </div>
      )}
      {(message || error) && (
        <p
          className={`pillbox-msg ${error ? "error" : "success"}`}
          role={error ? "alert" : "status"}
        >
          {!error && <Check size={12} />}
          {error ?? message}
        </p>
      )}
      <div className="pillbox-shell">
        <div className="pillbox-table" title={`${data.table.name} · ${data.table.status}`}>
          <span>{data.table.name.replace(/^table\s*/i, "") || data.table.name.slice(0, 2)}</span>
          <i className={`status-${data.table.status}`} />
        </div>
        <div className="pillbox-actions">
          {data.features.callWaiter && (
            <button
              className={`pillbox-action ${waiterRequest ? "is-complete" : ""}`}
              type="button"
              disabled={Boolean(waiterRequest) || submitting !== null}
              onClick={() => void send("waiter_call")}
            >
              <span>{waiterRequest ? <Check size={17} /> : <BellRing size={17} />}</span>
              <b>{waiterRequest ? requestLabel(waiterRequest.status) : "Call waiter"}</b>
            </button>
          )}
          {data.features.requestCheck && (
            <button
              className={`pillbox-action ${checkRequest ? "is-complete" : ""}`}
              type="button"
              disabled={Boolean(checkRequest) || submitting !== null}
              onClick={() => {
                setNotesOpen(false);
                setCheckOpen(true);
                setError(null);
              }}
            >
              <span>{checkRequest ? <Check size={17} /> : <ReceiptText size={17} />}</span>
              <b>{checkRequest ? requestLabel(checkRequest.status) : "Request check"}</b>
            </button>
          )}
        </div>
        <button
          className={`pillbox-note-toggle ${notes.trim() ? "has-note" : ""}`}
          type="button"
          onClick={() => {
            setCheckOpen(false);
            setNotesOpen((value) => !value);
          }}
          aria-label="Add a note"
        >
          <MessageSquareText size={16} />
        </button>
      </div>
    </div>
  );
}

function requestLabel(status: string) {
  return status === "acknowledged" ? "Acknowledged" : "Request sent";
}
