import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Ban,
  ArrowUpDown,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { DashboardPanel } from "@/components/dashboard/EmptyState";
import { api } from "@/lib/api/client";
import type { BillingPlanId } from "@/lib/api/client";
import { PlanPickerModal } from "@/components/billing/PlanPickerModal";
import { queryClient } from "@/lib/queryClient";

export default function BillingPage() {
  const subscription = useQuery({ queryKey: ["billing", "subscription"], queryFn: api.billing });
  const plans = useQuery({ queryKey: ["billing", "plans"], queryFn: api.billingPlans });
  const [workingPlan, setWorkingPlan] = useState<BillingPlanId | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const current = subscription.data;
  const subscribed = current?.access === "pro";
  const isCancelled = current?.status === "cancelled";
  const availability = useMemo(
    () =>
      Object.fromEntries((plans.data ?? []).map((plan) => [plan.id, plan.available])) as Partial<
        Record<BillingPlanId, boolean>
      >,
    [plans.data],
  );
  const onLemonEvent = useCallback((event: LemonSqueezyEvent) => {
    if (event.event !== "Checkout.Success") return;
    void queryClient.invalidateQueries({ queryKey: ["billing"] });
  }, []);
  useEffect(() => {
    window.createLemonSqueezy?.();
    window.LemonSqueezy?.Setup({ eventHandler: onLemonEvent });
  }, [onLemonEvent]);

  async function choosePlan(plan: BillingPlanId) {
    if (subscribed) {
      setChangingPlan(true);
      setError(null);
      setSuccess(null);
      try {
        await api.billingChangePlan(plan);
        setShowPlans(false);
        setSuccess("Plan change submitted. It may take a moment to reflect.");
        void queryClient.invalidateQueries({ queryKey: ["billing"] });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Plan change could not be completed.");
      } finally {
        setChangingPlan(false);
      }
      return;
    }
    setWorkingPlan(plan);
    setError(null);
    try {
      const { url } = await api.billingCheckout(plan);
      setShowPlans(false);
      if (!window.LemonSqueezy)
        throw new Error("Secure checkout is still loading. Please try again.");
      window.LemonSqueezy.Url.Open(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be opened.");
    } finally {
      setWorkingPlan(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    setSuccess(null);
    try {
      await api.billingCancel();
      setConfirmCancel(false);
      setSuccess("Subscription will be cancelled at the end of the billing period.");
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation could not be completed.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleResume() {
    setResuming(true);
    setError(null);
    setSuccess(null);
    try {
      await api.billingResume();
      setSuccess("Subscription resumed successfully.");
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resume subscription.");
    } finally {
      setResuming(false);
    }
  }

  return (
    <DashboardPanel>
      <header className="module-page-heading account-module-heading">
        <p className="eyebrow">Billing</p>
        <h1>
          Simple billing,
          <br />
          <em>without surprises.</em>
        </h1>
        <p>Subscriptions and invoices are securely managed through Lemon Squeezy.</p>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="form-success" role="status">
          {success}
        </p>
      )}
      {subscription.isPending ? (
        <main className="state-loading">
          <RefreshCw size={18} /> Loading billing status
        </main>
      ) : subscription.isError ? (
        <main className="state-loading">
          <p>{subscription.error.message}</p>
          <button className="button button-primary" onClick={() => subscription.refetch()}>
            Retry
          </button>
        </main>
      ) : (
        <section className="billing-overview">
          <article className="billing-plan-card">
            <div>
              <p className="eyebrow">Current plan</p>
              <h2>
                {subscribed
                  ? (current.planName ?? "Astron subscription")
                  : "No active subscription"}
              </h2>
              <p>
                {subscribed
                  ? `Status: ${current.status.replaceAll("_", " ")}`
                  : "Compare every Astron plan before opening secure checkout."}
              </p>
            </div>
            <ul>
              <li>
                <Check size={14} /> Restaurant operations workspace
              </li>
              <li>
                <Check size={14} /> Team, menu and reservation tools
              </li>
              <li>
                <Check size={14} /> Secure hosted billing
              </li>
            </ul>
            {!subscribed && !isCancelled && (
              <button className="button button-primary" onClick={() => setShowPlans(true)}>
                View plans <ExternalLink size={14} />
              </button>
            )}
            {isCancelled && !subscribed && (
              <button className="button button-primary" onClick={() => setShowPlans(true)}>
                Resubscribe <ExternalLink size={14} />
              </button>
            )}
            {subscribed && (
              <div className="billing-plan-actions">
                {isCancelled ? (
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={resuming}
                    onClick={handleResume}
                  >
                    {resuming ? (
                      <><LoaderCircle className="spin" size={15} /> Resuming</>
                    ) : (
                      <><RotateCcw size={14} /> Resume subscription</>
                    )}
                  </button>
                ) : !confirmCancel ? (
                  <>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={changingPlan}
                      onClick={() => setShowPlans(true)}
                    >
                      {changingPlan ? (
                        <><LoaderCircle className="spin" size={15} /> Changing plan</>
                      ) : (
                        <><ArrowUpDown size={14} /> Change plan</>
                      )}
                    </button>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                    >
                      <Ban size={14} /> Cancel subscription
                    </button>
                  </>
                ) : (
                  <div className="cancel-confirm">
                    <span>Cancel at period end?</span>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={cancelling}
                      onClick={handleCancel}
                    >
                      {cancelling ? (
                        <><LoaderCircle className="spin" size={15} /> Cancelling</>
                      ) : (
                        "Yes, cancel"
                      )}
                    </button>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={cancelling}
                      onClick={() => setConfirmCancel(false)}
                    >
                      Keep plan
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
          <article className="payment-card">
            <header>
              <span>
                <CreditCard size={18} />
              </span>
              <div>
                <p className="eyebrow">Payment method</p>
                <h2>
                  {current?.cardLastFour
                    ? `${current.cardBrand ?? "Card"} ending in ${current.cardLastFour}`
                    : "Managed securely"}
                </h2>
              </div>
            </header>
            <dl>
              <div>
                <dt>Subscription status</dt>
                <dd>{current?.status ?? "Inactive"}</dd>
              </div>
              <div>
                <dt>Renews</dt>
                <dd>{current?.renewsAt ? new Date(current.renewsAt).toLocaleDateString() : "—"}</dd>
              </div>
              {current?.endsAt && (
                <div>
                  <dt>Ends</dt>
                  <dd>{new Date(current.endsAt).toLocaleDateString()}</dd>
                </div>
              )}
              <div>
                <dt>Mode</dt>
                <dd>{current?.testMode ? "Test" : "Live"}</dd>
              </div>
            </dl>
          </article>
        </section>
      )}
      <section className="invoice-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Receipts</p>
            <h2>Payment records</h2>
          </div>
        </div>
        <p className="no-filter-results">
          Lemon Squeezy sends payment receipts directly to your billing email.
        </p>
      </section>
      <PlanPickerModal
        open={showPlans}
        availability={availability}
        workingPlan={subscribed ? changingPlan ? (current.plan === "free" ? "house" : current.plan) : null : workingPlan}
        onClose={() => !workingPlan && !changingPlan && setShowPlans(false)}
        onChoose={(plan) => void choosePlan(plan)}
      />
    </DashboardPanel>
  );
}
