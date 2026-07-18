import { FormEvent, useState } from "react";
import { Check, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DashboardPanel } from "@/components/dashboard/EmptyState";
import { useAuthStore } from "@/stores/useAuthStore";
import { api } from "@/lib/api/client";

export default function AccountSettingsPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const updateAccount = useAuthStore((state) => state.updateAccount);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const sessions = useQuery({ queryKey: ["account", "sessions"], queryFn: api.sessions });
  const [saved, setSaved] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    if (!name.trim() || !email.trim()) return;
    const updated = await updateAccount({ name, email });
    if (!updated.emailVerified) {
      navigate(`/auth/verify-email?email=${encodeURIComponent(updated.email)}`);
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    const form = new FormData(event.currentTarget),
      currentPassword = String(form.get("currentPassword") ?? ""),
      newPassword = String(form.get("newPassword") ?? ""),
      confirm = String(form.get("confirmPassword") ?? "");
    if (newPassword.length < 10) return setPasswordError("Use at least 10 characters.");
    if (newPassword !== confirm) return setPasswordError("The new passwords do not match.");
    try {
      await api.changePassword(currentPassword, newPassword);
      event.currentTarget.reset();
      setPasswordMessage("Password changed. Other sessions have been signed out.");
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : "Password change failed.");
    }
  }

  return (
    <DashboardPanel>
      <header className="module-page-heading account-module-heading">
        <p className="eyebrow">Account settings</p>
        <h1>
          Your profile,
          <br />
          <em>kept current.</em>
        </h1>
        <p>These details apply to your Astron account, not to an individual restaurant.</p>
      </header>
      <div className="settings-grid">
        <form className="settings-form-card" onSubmit={save}>
          <div className="settings-card-heading">
            <span>
              <UserRound size={18} />
            </span>
            <div>
              <h2>Personal details</h2>
              <p>Used for account access and workspace attribution.</p>
            </div>
          </div>
          <label className="auth-field">
            <span>
              <UserRound size={13} /> Full name
            </span>
            <input name="name" defaultValue={currentUser?.name ?? ""} />
          </label>
          <label className="auth-field">
            <span>
              <Mail size={13} /> Email address
            </span>
            <input name="email" type="email" defaultValue={currentUser?.email ?? ""} />
          </label>
          <footer>
            <span>
              {saved && (
                <>
                  <Check size={13} /> Changes saved
                </>
              )}
            </span>
            <button className="button button-primary" type="submit">
              Save account
            </button>
          </footer>
        </form>
        <form className="security-card" onSubmit={changePassword}>
          <span>
            <ShieldCheck size={21} />
          </span>
          <p className="eyebrow">Security</p>
          <h2>Change password</h2>
          <p>Changing your password closes every other signed-in session.</p>
          <label className="auth-field">
            <span>
              <KeyRound size={13} /> Current password
            </span>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label className="auth-field">
            <span>
              <LockKeyhole size={13} /> New password
            </span>
            <input name="newPassword" type="password" autoComplete="new-password" required />
          </label>
          <label className="auth-field">
            <span>
              <Check size={13} /> Confirm new password
            </span>
            <input name="confirmPassword" type="password" autoComplete="new-password" required />
          </label>
          {passwordError && (
            <p className="form-error" role="alert">
              {passwordError}
            </p>
          )}
          {passwordMessage && (
            <p className="publish-toast" role="status">
              {passwordMessage}
            </p>
          )}
          <button className="button button-primary" type="submit">
            Change password
          </button>
        </form>
      </div>
      <section className="invoice-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Signed-in devices</p>
            <h2>Sessions</h2>
          </div>
        </div>
        <div className="invoice-table">
          {sessions.data?.map((session) => (
            <div className="invoice-row" key={session.id}>
              <span>{session.current ? "Current session" : "Other session"}</span>
              <b>{session.userAgent?.slice(0, 60) ?? "Unknown device"}</b>
              <span>{new Date(session.lastSeenAt).toLocaleString()}</span>
              <span>{session.ipAddress ?? "Private"}</span>
              <button
                type="button"
                onClick={async () => {
                  await api.revokeSession(session.id);
                  if (session.current) {
                    await logout();
                    navigate("/auth/login");
                  } else await sessions.refetch();
                }}
              >
                {session.current ? "Sign out" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </DashboardPanel>
  );
}
