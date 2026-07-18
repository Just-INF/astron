import { FormEvent, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { api, ApiError } from "@/lib/api/client";

type AuthMode = "login" | "register" | "forgot";

interface AuthPanelProps {
  mode: AuthMode;
}

function Field({
  id,
  label,
  icon,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  autoComplete,
  required = true,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className={`auth-field${error ? " has-error" : ""}`} htmlFor={id}>
      <span>{label}</span>
      <div className="auth-input-wrap">
        <i aria-hidden="true">{icon}</i>
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && (
        <small id={`${id}-error`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}

export function AuthPanel({ mode }: AuthPanelProps) {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetSent, setIsResetSent] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const isLogin = mode === "login";
  const isForgot = mode === "forgot";
  const title = isLogin
    ? "Welcome back."
    : isForgot
      ? "Let’s find your way in."
      : "A good service starts here.";
  const description = isLogin
    ? "Sign in to return to your restaurant workspace."
    : isForgot
      ? "We’ll send a reset link to this address."
      : "Create your account, then choose a menu theme for your restaurant.";
  const passwordStrength =
    password.length === 0 ? 0 : password.length < 10 ? 1 : password.length < 12 ? 2 : 3;

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      nextFieldErrors.email = "Enter a valid email address.";
    if (!isForgot && password.length < 10) nextFieldErrors.password = "Use at least 10 characters.";
    if (!isLogin && !isForgot && name.trim().length < 2)
      nextFieldErrors.name = "Enter the name your team will know you by.";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;
    setIsSubmitting(true);
    try {
      if (isForgot) {
        await api.forgotPassword(email);
        setIsResetSent(true);
        return;
      }
      if (isLogin) {
        const result = await login(email, password);
        navigate(result.needsOnboarding ? "/onboarding" : "/account");
      } else {
        const user = await register(name, email, password);
        navigate(
          user.emailVerified
            ? "/onboarding"
            : `/auth/verify-email?email=${encodeURIComponent(user.email)}`,
        );
      }
    } catch (submissionError) {
      if (submissionError instanceof ApiError && submissionError.fieldErrors)
        setFieldErrors(
          Object.fromEntries(
            Object.entries(submissionError.fieldErrors).map(([field, messages]) => [
              field,
              messages[0] ?? "Invalid value.",
            ]),
          ),
        );
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something interrupted that. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isResetSent)
    return (
      <section className="auth-panel auth-panel-success reset-sent">
        <span className="auth-success-icon">
          <CheckCircle2 size={24} />
        </span>
        <p className="eyebrow">Recovery request received</p>
        <h1>Check your inbox.</h1>
        <p>
          If an account matches <b>{email}</b>, you’ll receive a secure reset link shortly.
        </p>
        <div className="reset-actions">
          <Link className="button button-primary" to="/auth/login">
            Back to sign in <ArrowRight size={16} />
          </Link>
          <button type="button" className="auth-text-button" onClick={() => setIsResetSent(false)}>
            Use a different email
          </button>
        </div>
        <p className="auth-footnote">
          <ShieldCheck size={14} /> For your privacy, we never confirm whether an email is
          registered.
        </p>
      </section>
    );

  const panelClass = `auth-panel auth-panel-${mode}`;

  return (
    <section className={panelClass}>
      <div className="auth-panel-heading">
        <span className="auth-spark">
          <Sparkles size={15} />
        </span>
        <p className="eyebrow">
          {isLogin ? "Welcome back" : isForgot ? "Account recovery" : "Start with Astron"}
        </p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        {!isLogin && !isForgot && (
          <Field
            id="name"
            label="Full name"
            icon={<UserRound size={13} />}
            placeholder="e.g., Mira Laurent"
            value={name}
            onChange={(value) => {
              setName(value);
              clearFieldError("name");
            }}
            error={fieldErrors.name}
            autoComplete="name"
          />
        )}
        <Field
          id="email"
          label="Work email"
          icon={<Mail size={13} />}
          type="email"
          placeholder="you@restaurant.com"
          value={email}
          onChange={(value) => {
            setEmail(value);
            clearFieldError("email");
          }}
          error={fieldErrors.email}
          autoComplete="email"
        />
        {!isForgot && (
          <div className="password-field">
            <Field
              id="password"
              label="Password"
              icon={<LockKeyhole size={13} />}
              type={isPasswordVisible ? "text" : "password"}
              placeholder={isLogin ? "Enter your password" : "Create a secure password"}
              value={password}
              onChange={(value) => {
                setPassword(value);
                clearFieldError("password");
              }}
              error={fieldErrors.password}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
            <button
              type="button"
              aria-label={isPasswordVisible ? "Hide password" : "Show password"}
              onClick={() => setIsPasswordVisible((visible) => !visible)}
            >
              {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {!isLogin && (
              <div
                className="password-strength"
                aria-label={`Password strength: ${["not set", "weak", "fair", "strong"][passwordStrength]}`}
              >
                <span>
                  <i className={passwordStrength >= 1 ? "active" : ""} />
                  <i className={passwordStrength >= 2 ? "active" : ""} />
                  <i className={passwordStrength >= 3 ? "active" : ""} />
                </span>
                <small>
                  {passwordStrength === 0
                    ? "Use 10+ characters"
                    : ["", "Needs more length", "Good", "Strong password"][passwordStrength]}
                </small>
              </div>
            )}
          </div>
        )}
        {isLogin && (
          <div className="auth-form-options">
            <label className="remember-toggle">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              <span aria-hidden="true" /> Keep me signed in
            </label>
            <Link className="forgot-link" to="/auth/forgot-password">
              Forgot password?
            </Link>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="auth-submit-skeleton" aria-hidden="true">
                <i />
                <i />
              </span>
              <span>
                {isForgot
                  ? "Preparing your reset link"
                  : isLogin
                    ? "Opening your workspace"
                    : "Creating your account"}
              </span>
            </>
          ) : (
            <>
              {isForgot
                ? "Prepare recovery link"
                : isLogin
                  ? "Enter your workspace"
                  : "Create my account"}{" "}
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
      {isLogin ? (
        <p className="auth-switch">
          New to Astron? <Link to="/auth/register">Create your account</Link>
        </p>
      ) : (
        !isForgot && (
          <p className="auth-switch">
            Already have an account? <Link to="/auth/login">Sign in</Link>
          </p>
        )
      )}
      {isForgot && (
        <p className="auth-switch auth-back-link">
          <Link to="/auth/login">
            <ArrowLeft size={13} /> Back to sign in
          </Link>
        </p>
      )}
    </section>
  );
}
