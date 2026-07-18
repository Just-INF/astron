import { useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Gauge,
  LayoutGrid,
  Palette,
  Sparkles,
  Type,
} from "lucide-react";
import type { MenuAnimation, MenuAnimationSpeed, MenuWidth, ReservationTheme } from "@/types";
import { menuPalettePresets } from "@/lib/menuPalettes";
import { uploadMedia } from "@/lib/api/client";

const ENTRANCE_OPTIONS: Array<{ id: MenuAnimation; label: string }> = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "scale", label: "Scale" },
];

function normaliseEntrance(value: string): "none" | "fade" | "slide" | "scale" {
  const allowed = ["none", "fade", "slide", "scale"];
  return allowed.includes(value) ? (value as "none" | "fade" | "slide" | "scale") : "fade";
}

interface ReservationThemeEditorProps {
  theme: ReservationTheme;
  onUpdate: (patch: Partial<ReservationTheme>) => void;
  onPublish: () => Promise<void>;
  restaurantId: string;
  floorPlanEditor?: ReactNode;
}

export function ReservationThemeEditor({
  theme,
  onUpdate,
  onPublish,
  restaurantId,
  floorPlanEditor,
}: ReservationThemeEditorProps) {
  const [published, setPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const width = theme.widthPreset ?? "standard";
  const entrance = normaliseEntrance(theme.entranceAnimationPreset);
  const speed = theme.animationSpeed ?? "normal";

  function choosePalette(palette: (typeof menuPalettePresets)[number]) {
    onUpdate({
      paletteId: palette.id,
      backgroundColor: palette.colors[0],
      textColor: palette.colors[1],
      accentColor: palette.colors[2],
    });
  }
  async function publish() {
    if (isPublishing) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      await onPublish();
      setPublished(true);
      window.setTimeout(() => setPublished(false), 2400);
    } catch (error) {
      setPublishError(
        error instanceof Error ? error.message : "The reservation page could not be published.",
      );
    } finally {
      setIsPublishing(false);
    }
  }
  function toggleFloorPlan(value: string) {
    const visible = value !== "hidden";
    onUpdate({
      floorPlanProminence: value as ReservationTheme["floorPlanProminence"],
      showFloorPlan: visible,
    });
  }
  async function selectHeroImage(file?: File) {
    if (!file) return;
    onUpdate({ heroImage: await uploadMedia(restaurantId, file) });
  }
  async function selectConfirmationImage(file?: File) {
    if (!file) return;
    onUpdate({ confirmationImage: await uploadMedia(restaurantId, file) });
  }

  return (
    <section className="theme-editor display-settings-editor">
      {published && <PublishToast />}
      {publishError && (
        <p className="form-error" role="alert">
          {publishError}
        </p>
      )}
      <div className="display-settings-grid">
        <SettingsGroup
          icon={<LayoutGrid size={17} />}
          title="Layout"
          note="How the booking page is framed."
        >
          <Control label="Content width">
            <Segment
              value={width}
              values={[
                { id: "compact", label: "Compact" },
                { id: "standard", label: "Standard" },
                { id: "wide", label: "Wide" },
              ]}
              onChange={(value) => onUpdate({ widthPreset: value as MenuWidth })}
            />
          </Control>
          <Control label="Page layout">
            <Segment
              value={theme.layoutVariant ?? "guided"}
              values={[
                { id: "guided", label: "Guided" },
                { id: "split", label: "Two-column" },
                { id: "condensed", label: "Condensed" },
              ]}
              onChange={(value) =>
                onUpdate({
                  layoutVariant: value as ReservationTheme["layoutVariant"],
                })
              }
            />
          </Control>
          <Control label="Step indicator">
            <Segment
              value={theme.stepIndicator ?? "numbered"}
              values={[
                { id: "numbered", label: "Steps" },
                { id: "progress", label: "Progress" },
                { id: "dots", label: "Dots" },
                { id: "hidden", label: "Hide" },
              ]}
              onChange={(value) =>
                onUpdate({
                  stepIndicator: value as ReservationTheme["stepIndicator"],
                })
              }
            />
          </Control>
          <Control label="Floor plan">
            <Segment
              value={theme.floorPlanProminence ?? (theme.showFloorPlan ? "prominent" : "hidden")}
              values={[
                { id: "prominent", label: "Prominent" },
                { id: "collapsed", label: "Collapsed" },
                { id: "hidden", label: "Hidden" },
              ]}
              onChange={toggleFloorPlan}
            />
          </Control>
          <Control label="Table selection">
            <Segment
              value={theme.tableSelectionMode ?? "both"}
              values={[
                { id: "list", label: "List" },
                { id: "floorplan", label: "Floor plan" },
                { id: "both", label: "Both" },
              ]}
              onChange={(value) =>
                onUpdate({
                  tableSelectionMode: value as ReservationTheme["tableSelectionMode"],
                })
              }
            />
          </Control>
          <Control label="Restaurant logo">
            <Segment
              value={theme.showRestaurantLogo ? "on" : "off"}
              values={[
                { id: "on", label: "Show" },
                { id: "off", label: "Hide" },
              ]}
              onChange={(value) => onUpdate({ showRestaurantLogo: value === "on" })}
            />
          </Control>
          <Control label="Entrance animation">
            <Segment
              value={entrance}
              values={ENTRANCE_OPTIONS}
              onChange={(value) => onUpdate({ entranceAnimationPreset: value as MenuAnimation })}
            />
          </Control>
          <Control label="Animation speed">
            <Segment
              value={speed}
              values={[
                { id: "fast", label: "Fast" },
                { id: "normal", label: "Normal" },
                { id: "slow", label: "Slow" },
              ]}
              onChange={(value) => onUpdate({ animationSpeed: value as MenuAnimationSpeed })}
            />
          </Control>
        </SettingsGroup>

        <SettingsGroup
          icon={<Sparkles size={17} />}
          title="Branding"
          note="Shape the first impression before guests choose a time."
        >
          <Control label="Hero image">
            <label className="reservation-image-upload">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => selectHeroImage(event.target.files?.[0])}
              />
              <span>{theme.heroImage ? "Replace image" : "Upload image"}</span>
            </label>
          </Control>
          <Control label="Hero height">
            <Segment
              value={theme.heroHeight ?? "medium"}
              values={[
                { id: "short", label: "Short" },
                { id: "medium", label: "Medium" },
                { id: "tall", label: "Tall" },
              ]}
              onChange={(value) =>
                onUpdate({
                  heroHeight: value as ReservationTheme["heroHeight"],
                })
              }
            />
          </Control>
          <Control label="Hero overlay">
            <input
              className="reservation-overlay-range"
              type="range"
              min="0"
              max="85"
              value={theme.heroOverlay ?? 42}
              onChange={(event) => onUpdate({ heroOverlay: Number(event.target.value) })}
            />
          </Control>
          <Control label="Logo placement">
            <Segment
              value={theme.logoPlacement ?? (theme.showRestaurantLogo ? "top-left" : "hidden")}
              values={[
                { id: "top-left", label: "Top left" },
                { id: "centered", label: "Centered" },
                { id: "hidden", label: "Hidden" },
              ]}
              onChange={(value) =>
                onUpdate({
                  logoPlacement: value as ReservationTheme["logoPlacement"],
                  showRestaurantLogo: value !== "hidden",
                })
              }
            />
          </Control>
          <Control label="Font pairing">
            <Segment
              value={theme.fontPairingId ?? "modern-sans-clean"}
              values={[
                { id: "modern-sans-clean", label: "Modern" },
                { id: "serif-display-sans-body", label: "Editorial" },
                { id: "editorial-mono", label: "Mono" },
              ]}
              onChange={(value) =>
                onUpdate({
                  fontPairingId: value as ReservationTheme["fontPairingId"],
                })
              }
            />
          </Control>
        </SettingsGroup>

        <SettingsGroup
          icon={<Palette size={17} />}
          title="Color system"
          note="Start with a preset, then tune individual colors."
        >
          <div className="menu-palette-grid">
            {menuPalettePresets.map((palette) => (
              <button
                key={palette.id}
                className={theme.paletteId === palette.id ? "selected" : ""}
                type="button"
                onClick={() => choosePalette(palette)}
              >
                <span>
                  {palette.colors.map((color, index) => (
                    <i style={{ background: color }} key={`${color}-${index}`} />
                  ))}
                </span>
                <b>{palette.label}</b>
                {theme.paletteId === palette.id && <Check size={12} />}
              </button>
            ))}
          </div>
          <div className="custom-color-row">
            <ColorField
              label="Background"
              value={theme.backgroundColor ?? "#090d18"}
              onChange={(value) => onUpdate({ backgroundColor: value })}
            />
            <ColorField
              label="Text"
              value={theme.textColor ?? "#eef3ff"}
              onChange={(value) => onUpdate({ textColor: value })}
            />
            <ColorField
              label="Accent"
              value={theme.accentColor ?? "#9ee1c3"}
              onChange={(value) => onUpdate({ accentColor: value })}
            />
            <ColorField
              label="Hero accent"
              value={theme.heroAccentColor ?? theme.accentColor ?? "#9ee1c3"}
              onChange={(value) => onUpdate({ heroAccentColor: value })}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup
          icon={<Sparkles size={17} />}
          title="Page content"
          note="The words guests see first."
        >
          <Control label="Page title">
            <input
              className="res-theme-input"
              value={theme.pageTitle}
              onChange={(e) => onUpdate({ pageTitle: e.target.value })}
              placeholder="Reserve a table"
            />
          </Control>
          <Control label="Page subtitle">
            <textarea
              className="res-theme-textarea"
              value={theme.pageSubtitle}
              onChange={(e) => onUpdate({ pageSubtitle: e.target.value })}
              placeholder="Choose a time and we'll hold your table."
            />
          </Control>
          <Control label="Helper text">
            <input
              className="res-theme-input"
              value={theme.helperText ?? ""}
              onChange={(event) => onUpdate({ helperText: event.target.value })}
              placeholder="Walk-ins welcome after 9pm"
            />
          </Control>
          <Control label="Confirmation heading">
            <input
              className="res-theme-input"
              value={theme.confirmationHeading ?? ""}
              onChange={(event) => onUpdate({ confirmationHeading: event.target.value })}
              placeholder="Your table is held."
            />
          </Control>
          <Control label="Confirmation message">
            <textarea
              className="res-theme-textarea"
              value={theme.confirmationMessage ?? ""}
              onChange={(event) => onUpdate({ confirmationMessage: event.target.value })}
              placeholder="We look forward to welcoming you."
            />
          </Control>
          <Control label="Confirmation image">
            <label className="reservation-image-upload">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => selectConfirmationImage(event.target.files?.[0])}
              />
              <span>{theme.confirmationImage ? "Replace image" : "Upload image"}</span>
            </label>
          </Control>
          <Control label="Confirmation actions">
            <Segment
              value={theme.confirmationActions === false ? "off" : "on"}
              values={[
                { id: "on", label: "Show" },
                { id: "off", label: "Hide" },
              ]}
              onChange={(value) => onUpdate({ confirmationActions: value === "on" })}
            />
          </Control>
        </SettingsGroup>

        {floorPlanEditor}

        <section className="publish-summary-card reservation-launch-card">
          <span>
            <Gauge size={18} />
          </span>
          <p className="eyebrow">Publish status</p>
          <h3>
            {theme.isPublished ? `Version ${theme.version} is live` : "Ready to welcome guests"}
          </h3>
          <p>
            {theme.isPublished
              ? "Edits stay in draft until you publish this update."
              : "Your page will go live immediately after publishing."}
          </p>
          <div className="reservation-launch-checks">
            <span>
              <Check size={13} /> Booking details set
            </span>
            <span>
              <Check size={13} /> Theme selected
            </span>
            <span className={theme.showFloorPlan ? "" : "is-muted"}>
              <Check size={13} /> Floor plan {theme.showFloorPlan ? "visible" : "hidden"}
            </span>
          </div>
          <a
            className="reservation-live-preview"
            href={`/reserve/${restaurantId}?preview=draft`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} /> Preview draft
          </a>
          <button
            className="button button-primary"
            type="button"
            onClick={publish}
            disabled={isPublishing}
          >
            {isPublishing ? "Publishing…" : theme.isPublished ? "Publish changes" : "Go live now"}
          </button>
          <small>
            Last published:{" "}
            {theme.updatedAt && theme.updatedAt !== new Date(0).toISOString()
              ? new Date(theme.updatedAt).toLocaleString()
              : "Not yet published"}
          </small>
        </section>
      </div>
      <div className="display-advanced-row">
        <button
          type="button"
          className="display-advanced-button"
          onClick={() => setAdvancedOpen(true)}
        >
          <Type size={14} /> Advanced
        </button>
      </div>
      {advancedOpen && (
        <div
          className="display-css-modal-backdrop"
          role="presentation"
          onMouseDown={() => setAdvancedOpen(false)}
        >
          <section
            className="display-css-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-css-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>
                  <Type size={17} />
                </span>
                <div>
                  <h2 id="reservation-css-title">Advanced styling</h2>
                  <p>CSS applies only to the guest booking page.</p>
                </div>
              </div>
              <button type="button" onClick={() => setAdvancedOpen(false)}>
                Close
              </button>
            </header>
            <label>
              Custom CSS
              <textarea
                className="res-theme-textarea display-custom-css"
                autoFocus
                value={theme.customCss ?? ""}
                onChange={(event) => onUpdate({ customCss: event.target.value })}
                placeholder={".public-reservation-page {\n  /* your styles */\n}"}
                spellCheck={false}
              />
            </label>
            <footer>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setAdvancedOpen(false)}
              >
                Done
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function SettingsGroup({
  icon,
  title,
  note,
  children,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="display-settings-group">
      <header>
        <span>{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{note}</p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="display-control">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Segment({
  value,
  values,
  onChange,
}: {
  value: string;
  values: Array<{ id: string; label: string; icon?: ReactNode }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-segment">
      {values.map((item) => (
        <button
          key={item.id}
          className={value === item.id ? "selected" : ""}
          type="button"
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <div>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <code>{value.toUpperCase()}</code>
      </div>
    </label>
  );
}

function PublishToast() {
  return (
    <div className="publish-toast" role="status">
      <CheckCircle2 size={15} />
      <span>
        <b>Reservation page published</b> The public booking page is now up to date.
      </span>
    </div>
  );
}
