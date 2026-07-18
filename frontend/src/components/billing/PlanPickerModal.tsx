import { AnimatePresence, motion } from "framer-motion";
import { Check, Crown, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { BillingPlanId } from "@/lib/api/client";

export const billingPlans: Array<{
  id: BillingPlanId;
  name: string;
  price: number;
  description: string;
  featured?: boolean;
  features: string[];
}> = [
  {
    id: "table",
    name: "The Table",
    price: 79,
    description: "A complete digital room for an independent restaurant.",
    features: [
      "1 restaurant workspace",
      "Digital menu studio",
      "Reservations and guest experience",
      "Up to 20 tables",
      "3 team members",
    ],
  },
  {
    id: "house",
    name: "The House",
    price: 159,
    description: "The full operating rhythm, with intelligence built in.",
    featured: true,
    features: [
      "1 restaurant workspace",
      "Everything in The Table",
      "Unlimited tables and advanced floor planning",
      "Orders, service requests and Nora",
      "Analytics and up to 50 team members",
    ],
  },
  {
    id: "group",
    name: "The Group",
    price: 299,
    description: "Shared control for hospitality groups with several locations.",
    features: [
      "Up to 5 restaurant workspaces",
      "Everything in The House",
      "Group-level visibility",
      "Priority support",
      "Up to 250 team members per restaurant",
    ],
  },
];

export function PlanPickerModal({
  open,
  availability,
  workingPlan,
  onClose,
  onChoose,
}: {
  open: boolean;
  availability: Partial<Record<BillingPlanId, boolean>>;
  workingPlan: BillingPlanId | null;
  onClose: () => void;
  onChoose: (plan: BillingPlanId) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !workingPlan) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open, workingPlan]);

  return (
    <AnimatePresence>
      {open && (
        <div className="plan-modal-layer">
          <motion.button
            className="plan-modal-scrim"
            aria-label="Close plan selection"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.section
            className="plan-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-modal-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <header>
              <div>
                <p className="eyebrow">
                  <Sparkles size={12} /> Choose your room
                </p>
                <h2 id="plan-modal-title">A plan shaped around service.</h2>
                <p>
                  Select a plan, then complete payment securely in the Lemon Squeezy checkout
                  overlay.
                </p>
              </div>
              <button ref={closeRef} type="button" aria-label="Close" onClick={onClose}>
                <X size={18} />
              </button>
            </header>
            <div className="plan-modal-grid">
              {billingPlans.map((plan) => {
                const available = availability[plan.id] ?? false;
                const loading = workingPlan === plan.id;
                return (
                  <article className={plan.featured ? "featured" : ""} key={plan.id}>
                    {plan.featured && (
                      <span className="plan-best">
                        <Crown size={12} /> Recommended
                      </span>
                    )}
                    <div className="plan-name">
                      <span>{plan.name}</span>
                      <b>
                        €{plan.price}
                        <small>/month</small>
                      </b>
                    </div>
                    <p>{plan.description}</p>
                    <ul>
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <Check size={13} /> {feature}
                        </li>
                      ))}
                    </ul>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={!available || Boolean(workingPlan)}
                      onClick={() => onChoose(plan.id)}
                    >
                      {loading ? (
                        <>
                          <LoaderCircle className="spin" size={15} /> Preparing checkout
                        </>
                      ) : available ? (
                        `Choose ${plan.name}`
                      ) : (
                        "Connect variant to enable"
                      )}
                    </button>
                  </article>
                );
              })}
            </div>
            <footer>
              <span>Secure checkout by Lemon Squeezy</span>
              <span>Cancel anytime · Access follows subscription status</span>
            </footer>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}
