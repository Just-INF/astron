import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";

const tiers = [
  {
    name: "The Table",
    note: "For a first, considered room.",
    monthly: 79,
    details: ["One restaurant", "Digital menu studio", "Up to 20 tables"],
  },
  {
    name: "The House",
    note: "For the whole service rhythm.",
    monthly: 159,
    details: ["Everything in The Table", "Spatial floor planning", "Nora, your service assistant"],
    featured: true,
  },
  {
    name: "The Group",
    note: "For places with more than one address.",
    monthly: 299,
    details: ["Up to five restaurants", "Group-level insight", "Priority guidance"],
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <div className="pricing-area">
      <div className="billing-toggle" role="group" aria-label="Billing period">
        <button className={!annual ? "selected" : ""} onClick={() => setAnnual(false)}>
          Monthly
        </button>
        <button className={annual ? "selected" : ""} onClick={() => setAnnual(true)}>
          Annual <span>save 15%</span>
        </button>
      </div>
      <div className="price-grid">
        {tiers.map((tier) => {
          const price = annual ? Math.round(tier.monthly * 0.85) : tier.monthly;
          return (
            <article className={`price-card ${tier.featured ? "featured" : ""}`} key={tier.name}>
              <div>
                {tier.featured && <p className="recommended">Most considered</p>}
                <h3>{tier.name}</h3>
                <p>{tier.note}</p>
                <div className="price">
                  <b>€{price}</b>
                  <span>/ month</span>
                </div>
              </div>
              <ul>
                {tier.details.map((detail) => (
                  <li key={detail}>
                    <Check size={14} />
                    {detail}
                  </li>
                ))}
              </ul>
              <a
                className={tier.featured ? "button button-primary" : "button button-quiet"}
                href="mailto:hello@astron.com"
              >
                Choose {tier.name} <ChevronRight size={15} />
              </a>
            </article>
          );
        })}
      </div>
    </div>
  );
}
