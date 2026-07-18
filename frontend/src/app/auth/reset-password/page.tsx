import { FormEvent, useState } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api/client";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/useAuthStore";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!token) return setError("This reset link is incomplete.");
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setSubmitting(true);
    try {
      const user = await api.resetPassword(token, password);
      const restaurants = await api.restaurants();
      useAuthStore.getState().hydrateSession(user, restaurants);
      queryClient.setQueryData(["session"], { user, restaurants });
      setComplete(true);
      navigate(user.restaurantIds.length === 0 ? "/onboarding" : "/account", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be reset.");
    } finally {
      setSubmitting(false);
    }
  }
  if (complete)
    return (
      <section className="auth-panel auth-panel-success reset-sent">
        <CheckCircle2 size={28} />
        <p className="eyebrow">Password updated</p>
        <h1>You’re ready.</h1>
        <p>Your old sessions were closed and your new password is active.</p>
        <Link className="button button-primary" to="/account">
          Continue to Astron
        </Link>
      </section>
    );
  return (
    <section className="auth-panel">
      <div className="auth-panel-heading">
        <span className="auth-spark">
          <LockKeyhole size={15} />
        </span>
        <p className="eyebrow">Account recovery</p>
        <h1>Choose a new password.</h1>
        <p>This link can be used once and expires after one hour.</p>
      </div>
      <form onSubmit={submit}>
        <label className="auth-field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label className="auth-field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary auth-submit" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/auth/login">Back to sign in</Link>
      </p>
    </section>
  );
}
