import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const CONSENT_KEY = "astron_cookie_consent";
const CONSENT_VERSION = "2026-07-18";
const LEMON_SCRIPT_ID = "astron-lemon-squeezy";

function loadOptionalServices() {
  if (document.getElementById(LEMON_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = LEMON_SCRIPT_ID;
  script.src = "https://app.lemonsqueezy.com/js/lemon.js";
  script.defer = true;
  script.addEventListener("load", () => window.createLemonSqueezy?.(), { once: true });
  document.head.appendChild(script);
}

export function CookieConsent() {
  const [status, setStatus] = useState<"pending" | "accepted" | "dismissed">(() => {
    try {
      return window.localStorage.getItem(CONSENT_KEY) === CONSENT_VERSION
        ? "accepted"
        : "pending";
    } catch {
      return "pending";
    }
  });

  useEffect(() => {
    if (status === "accepted") loadOptionalServices();
  }, [status]);

  function accept() {
    try {
      window.localStorage.setItem(CONSENT_KEY, CONSENT_VERSION);
    } catch {
      // Consent still applies for this page view if the browser refuses storage.
    }
    loadOptionalServices();
    setStatus("accepted");
  }

  if (status !== "pending") return null;

  return (
    <section className="cookie-consent" role="dialog" aria-label="Cookie choices">
      <div>
        <p className="cookie-consent-label">YOUR PRIVACY</p>
        <h2>May we enable optional cookies?</h2>
        <p>
          Astron always uses necessary storage for sign-in and workspace preferences. With your
          permission, we also load Lemon Squeezy for secure subscription checkout. We do not use
          advertising cookies. <Link to="/cookies">Read the cookie policy</Link>.
        </p>
      </div>
      <div className="cookie-consent-actions">
        <button
          type="button"
          className="cookie-consent-decline"
          onClick={() => setStatus("dismissed")}
        >
          Cancel
        </button>
        <button type="button" className="cookie-consent-accept" onClick={accept}>
          Accept
        </button>
      </div>
    </section>
  );
}
