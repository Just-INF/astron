import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Compass,
  Globe2,
  LoaderCircle,
  Palette,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { OnboardingDetails } from "@/types";
import { useAuthStore } from "@/stores/useAuthStore";
import { menuPalettePresets } from "@/lib/menuPalettes";
import { uploadMedia } from "@/lib/api/client";
import { currencyOptions, timeZoneOptions } from "@/lib/regional";
import { BrandLogo } from "@/components/BrandLogo";

const steps = ["Restaurant", "Menu mood", "Details"];
const CURRENCIES = currencyOptions();
const TIMEZONES = timeZoneOptions();

export function OnboardingWizard() {
  const navigate = useNavigate();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const currentUser = useAuthStore((state) => state.currentUser);
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<OnboardingDetails>({
    name: "",
    cuisineType: "",
    logoFilename: null,
    notes: "",
    currency: "EUR",
    timezone: "Europe/Bucharest",
    theme: "gold-dark",
    tableCount: 0,
    layoutShape: "intimate",
    teamInvites: [],
  });
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (hasHydrated && !currentUser) navigate("/auth/login", { replace: true });
  }, [currentUser, hasHydrated, navigate]);
  useEffect(
    () => () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    },
    [logoPreviewUrl],
  );

  if (!hasHydrated || !currentUser)
    return (
      <main className="state-loading">
        <span className="loading-mark">✦</span> Preparing your workspace
      </main>
    );

  function move(nextStep: number) {
    setError(null);
    setStep(nextStep);
  }
  function chooseLogo(file: File | undefined) {
    setDetails((current) => ({ ...current, logoFilename: file?.name ?? null }));
    setLogoFile(file ?? null);
    setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
  }
  async function finish() {
    setError(null);
    if (details.name.trim().length < 2) {
      setError("Give your restaurant a name of at least two characters.");
      setStep(0);
      return;
    }
    if (!details.cuisineType.trim()) {
      setError("Tell us what kind of table you’re shaping.");
      setStep(0);
      return;
    }
    setIsCompleting(true);
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    try {
      const restaurantId = await completeOnboarding(details);
      if (restaurantId && logoFile) {
        const logoUrl = await uploadMedia(restaurantId, logoFile);
        await useAuthStore.getState().updateRestaurant(restaurantId, {
          logoUrl,
        });
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "We could not create the restaurant. Please retry.",
      );
      setIsCompleting(false);
      return;
    }
    setIsCompleting(false);
    setIsComplete(true);
  }

  if (isComplete)
    return (
      <main className="onboarding-page">
        <section className="completion-panel">
          <div className="completion-orbit">
            <CheckCircle2 size={42} />
          </div>
          <p className="eyebrow">Your workspace is ready</p>
          <h1>
            {details.name} has
            <br />
            found its <em>first light.</em>
          </h1>
          <p>Your menu theme is ready to refine in the menu designer whenever you are.</p>
          <button className="button button-primary" onClick={() => navigate("/dashboard")}>
            Open dashboard <ArrowRight size={16} />
          </button>
        </section>
      </main>
    );

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <Link to="/" className="wordmark">
          <BrandLogo /> Astron
        </Link>
        <span>{currentUser.name}</span>
      </header>
      <section className="wizard-shell">
        <div className="wizard-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((label, index) => (
            <div className={index <= step ? "current" : ""} key={label}>
              <i>{index < step ? <Check size={10} /> : index + 1}</i>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <section className="wizard-panel">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {step === 0 && (
                <div className="wizard-step">
                  <span className="wizard-icon">
                    <Compass size={21} />
                  </span>
                  <p className="eyebrow">Step one</p>
                  <h1>
                    Introduce your
                    <br />
                    <em>restaurant.</em>
                  </h1>
                  <p>
                    Start with the essentials. You can refine the rest as your house takes shape.
                  </p>
                  <label className="auth-field" htmlFor="restaurant-name">
                    <span>Restaurant name</span>
                    <input
                      id="restaurant-name"
                      placeholder="e.g., Bar Cismigiu"
                      autoFocus
                      value={details.name}
                      onChange={(event) =>
                        setDetails((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="auth-field" htmlFor="cuisine">
                    <span>Cuisine or service style</span>
                    <input
                      id="cuisine"
                      placeholder="e.g., Contemporary Romanian"
                      value={details.cuisineType}
                      onChange={(event) =>
                        setDetails((current) => ({
                          ...current,
                          cuisineType: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label
                    className={`logo-upload${logoPreviewUrl ? " has-preview" : ""}`}
                    htmlFor="logo"
                  >
                    <input
                      id="logo"
                      type="file"
                      accept="image/*"
                      onChange={(event) => chooseLogo(event.target.files?.[0])}
                    />
                    {logoPreviewUrl && (
                      <img
                        src={logoPreviewUrl}
                        alt="Selected restaurant logo"
                        width={34}
                        height={34}
                      />
                    )}
                    <span>{details.logoFilename ? "Logo selected" : "Add a logo"}</span>
                    <small>{details.logoFilename ?? "Optional · PNG, JPG or WebP"}</small>
                  </label>
                </div>
              )}
              {step === 1 && (
                <div className="wizard-step">
                  <span className="wizard-icon">
                    <Palette size={21} />
                  </span>
                  <p className="eyebrow">Step two</p>
                  <h1>
                    Choose the first
                    <br />
                    <em>menu mood.</em>
                  </h1>
                  <p>These are the same menu themes you can refine later in the menu designer.</p>
                  <div className="choice-grid palette-grid">
                    {menuPalettePresets.map((palette) => (
                      <button
                        type="button"
                        className={`palette-choice ${details.theme === palette.id ? "chosen" : ""} ${palette.id}`}
                        onClick={() =>
                          setDetails((current) => ({
                            ...current,
                            theme: palette.id,
                          }))
                        }
                        key={palette.id}
                      >
                        <i
                          style={{
                            background: `linear-gradient(135deg, ${palette.colors[0]} 0 50%, ${palette.colors[2]} 50% 100%)`,
                          }}
                        />
                        <span>
                          <b>{palette.label}</b>
                          <small>{palette.note}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="wizard-step">
                  <span className="wizard-icon">
                    <Globe2 size={21} />
                  </span>
                  <p className="eyebrow">Step three</p>
                  <h1>
                    Set the details
                    <br />
                    <em>that keep you aligned.</em>
                  </h1>
                  <p>
                    Use your restaurant’s local settings and leave any useful handover notes for the
                    team.
                  </p>
                  <div className="onboarding-selects">
                    <label className="auth-field" htmlFor="currency">
                      <span>Currency</span>
                      <select
                        id="currency"
                        value={details.currency}
                        onChange={(event) =>
                          setDetails((current) => ({
                            ...current,
                            currency: event.target.value,
                          }))
                        }
                      >
                        {CURRENCIES.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="auth-field" htmlFor="timezone">
                      <span>Timezone</span>
                      <select
                        id="timezone"
                        value={details.timezone}
                        onChange={(event) =>
                          setDetails((current) => ({
                            ...current,
                            timezone: event.target.value,
                          }))
                        }
                      >
                        {TIMEZONES.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="auth-field restaurant-notes" htmlFor="restaurant-notes">
                    <span>
                      Notes for your restaurant <small>Optional</small>
                    </span>
                    <textarea
                      id="restaurant-notes"
                      placeholder="e.g., Service starts at 17:30; terrace opens in summer; manager on duty is Ana."
                      value={details.notes}
                      onChange={(event) =>
                        setDetails((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
          <footer className="wizard-actions">
            {step > 0 ? (
              <button className="back-button" type="button" onClick={() => move(step - 1)}>
                <ChevronLeft size={16} /> Back
              </button>
            ) : (
              <span />
            )}
            {step < steps.length - 1 ? (
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  if (step === 0 && (!details.name.trim() || !details.cuisineType.trim())) {
                    setError(
                      "Tell us your restaurant’s name and service style before we continue.",
                    );
                    return;
                  }
                  move(step + 1);
                }}
              >
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="button button-primary"
                type="button"
                onClick={finish}
                disabled={isCompleting}
              >
                {isCompleting ? (
                  <>
                    <LoaderCircle className="spin" size={16} /> Creating your workspace
                  </>
                ) : (
                  <>
                    Make it official <ArrowRight size={16} />
                  </>
                )}
              </button>
            )}
          </footer>
        </section>
      </section>
    </main>
  );
}
