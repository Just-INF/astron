import { useEffect, useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api/client";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/useAuthStore";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const email = params.get("email") ?? "";
  const [status, setStatus] = useState<"waiting" | "verifying" | "verified" | "error">(
    token ? "verifying" : "waiting",
  );
  const [message, setMessage] = useState(
    token ? "Verifying your secure link…" : "Open the verification link sent to your inbox.",
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    let redirectTimer: number | undefined;
    void api
      .verifyEmail(token)
      .then(async (user) => {
        const restaurants = await api.restaurants();
        if (!active) return;
        setStatus("verified");
        setMessage("Your email is verified. Taking you into Astron");
        redirectTimer = window.setTimeout(() => {
          useAuthStore.getState().hydrateSession(user, restaurants);
          queryClient.setQueryData(["session"], { user, restaurants });
          navigate(user.restaurantIds.length === 0 ? "/onboarding" : "/account", { replace: true });
        }, 650);
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "The verification link could not be used.",
        );
      });
    return () => {
      active = false;
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
    };
  }, [navigate, token]);

  async function resend() {
    if (!email) return;
    await api.resendVerification(email);
    setStatus("waiting");
    setMessage("A fresh verification link has been sent if the account is eligible.");
  }

  return (
    <section className="auth-panel auth-panel-success reset-sent">
      <span className="auth-success-icon">
        {status === "verified" ? <CheckCircle2 size={24} /> : <MailCheck size={24} />}
      </span>
      <p className="eyebrow">Email verification</p>
      <h1>{status === "verified" ? "You’re verified." : "Check your inbox."}</h1>
      <p className={status === "error" ? "form-error" : undefined}>{message}</p>
      {status !== "verified" && email && (
        <button className="button button-primary" type="button" onClick={() => void resend()}>
          Send a new link
        </button>
      )}
      <Link to="/auth/login">Back to sign in</Link>
    </section>
  );
}
