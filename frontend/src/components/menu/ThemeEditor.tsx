import { useState } from "react";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Gauge,
  LayoutGrid,
  Palette,
  Rows3,
  Sparkles,
  Type,
} from "lucide-react";
import type {
  GuestMenuTheme,
  MenuAnimation,
  MenuAnimationSpeed,
  MenuCategory,
  MenuCategoryNavigation,
  MenuDensity,
  MenuLayout,
  MenuWidth,
  ThemeVersion,
} from "@/types";
import { menuPalettePresets } from "@/lib/menuPalettes";
import { useMenuStore } from "@/stores/useMenuStore";
const animations: Array<{ id: MenuAnimation; label: string }> = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "scale", label: "Scale" },
];

interface ThemeEditorProps {
  theme: GuestMenuTheme;
  history: ThemeVersion[];
  categories?: MenuCategory[];
  onUpdate: (patch: Partial<GuestMenuTheme>) => void;
  onPublish: () => Promise<void>;
}

export function ThemeEditor({ theme, history, categories, onUpdate, onPublish }: ThemeEditorProps) {
  const [published, setPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const reorderCategories = useMenuStore((state) => state.reorderCategories);
  const layout = theme.layoutType ?? "list";
  const width = theme.widthPreset ?? "standard";
  const entrance = normaliseAnimation(theme.entranceAnimationPreset);
  const exit = normaliseAnimation(theme.exitAnimationPreset ?? "fade");
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
      setPublishError(error instanceof Error ? error.message : "The menu could not be published.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <section className="theme-editor display-settings-editor">
      <header className="editor-heading editor-heading-compact">
        <div className="publish-actions">
          <a href={`/menu/${theme.restaurantId}?preview=draft`} target="_blank" rel="noreferrer">
            Preview draft <ExternalLink size={13} />
          </a>
          <button className="button button-primary" onClick={publish} disabled={isPublishing}>
            {isPublishing ? "Publishing…" : "Publish menu"}
          </button>
        </div>
      </header>
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
          note="How dishes flow across the page."
        >
          <Control label="Display">
            <Segment
              value={layout}
              values={[
                { id: "list", label: "List", icon: <Rows3 size={13} /> },
                { id: "grid", label: "Grid", icon: <LayoutGrid size={13} /> },
              ]}
              onChange={(value) => onUpdate({ layoutType: value as MenuLayout })}
            />
          </Control>
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
          <Control label="Spacing">
            <Segment
              value={theme.density ?? "comfortable"}
              values={[
                { id: "compact", label: "Compact" },
                { id: "comfortable", label: "Comfortable" },
                { id: "minimalist", label: "Airy" },
              ]}
              onChange={(value) => onUpdate({ density: value as MenuDensity })}
            />
          </Control>
          <Control label="Category navigation">
            <Segment
              value={theme.categoryNavigation ?? "pills"}
              values={[
                { id: "pills", label: "Pills" },
                { id: "tabs", label: "Tabs" },
                { id: "list", label: "Menu" },
              ]}
              onChange={(value) =>
                onUpdate({ categoryNavigation: value as MenuCategoryNavigation })
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
                className={theme.paletteId === palette.id ? "selected" : ""}
                onClick={() => choosePalette(palette)}
                key={palette.id}
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
          </div>
        </SettingsGroup>
        <SettingsGroup
          icon={<LayoutGrid size={17} />}
          title="Menu content"
          note="Control how guests move through dishes and how each item reads."
        >
          <Control label="Category pages">
            <Segment
              value={theme.renderAllCategories ? "all" : "switch"}
              values={[
                { id: "switch", label: "Switch categories" },
                { id: "all", label: "One scrolling page" },
              ]}
              onChange={(value) => onUpdate({ renderAllCategories: value === "all" })}
            />
          </Control>
          <Control label="Category order">
            <div className="menu-category-order" aria-label="Drag categories to reorder">
              {[...(categories ?? [])]
                .sort((a, b) => a.position - b.position)
                .map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    draggable
                    onDragStart={() => setDraggedCategoryId(category.id)}
                    onDragEnd={() => setDraggedCategoryId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedCategoryId || draggedCategoryId === category.id) return;
                      const ids = [...(categories ?? [])]
                        .sort((a, b) => a.position - b.position)
                        .map((item) => item.id);
                      const from = ids.indexOf(draggedCategoryId);
                      const to = ids.indexOf(category.id);
                      ids.splice(to, 0, ids.splice(from, 1)[0]);
                      reorderCategories(theme.restaurantId, ids);
                    }}
                  >
                    {category.name}
                  </button>
                ))}
            </div>
          </Control>
          <Control label="Dish image">
            <Segment
              value={theme.imagePosition ?? "right"}
              values={[
                { id: "left", label: "Left" },
                { id: "right", label: "Right" },
                { id: "top", label: "Top" },
                { id: "hidden", label: "Hide" },
              ]}
              onChange={(value) =>
                onUpdate({ imagePosition: value as GuestMenuTheme["imagePosition"] })
              }
            />
          </Control>
          <Control label="Image ratio">
            <Segment
              value={theme.imageAspect ?? "square"}
              values={[
                { id: "square", label: "Square" },
                { id: "wide", label: "Wide" },
                { id: "tall", label: "Tall" },
              ]}
              onChange={(value) =>
                onUpdate({ imageAspect: value as GuestMenuTheme["imageAspect"] })
              }
            />
          </Control>
          <Control label="Price placement">
            <Segment
              value={theme.pricePosition ?? "right"}
              values={[
                { id: "inline", label: "Inline" },
                { id: "right", label: "Right" },
                { id: "below", label: "Below" },
              ]}
              onChange={(value) =>
                onUpdate({ pricePosition: value as GuestMenuTheme["pricePosition"] })
              }
            />
          </Control>
          <Control label="Currency symbol">
            <Segment
              value={theme.showCurrency === false ? "off" : "on"}
              values={[
                { id: "on", label: "Show" },
                { id: "off", label: "Hide" },
              ]}
              onChange={(value) => onUpdate({ showCurrency: value === "on" })}
            />
          </Control>
          <Control label="Descriptions">
            <Segment
              value={theme.descriptionDisplay ?? "show"}
              values={[
                { id: "show", label: "Show" },
                { id: "truncate", label: "Truncate" },
                { id: "hide", label: "Hide" },
              ]}
              onChange={(value) =>
                onUpdate({ descriptionDisplay: value as GuestMenuTheme["descriptionDisplay"] })
              }
            />
          </Control>
        </SettingsGroup>
        <SettingsGroup
          icon={<Type size={17} />}
          title="Typography & dietary tags"
          note="Typography applies across every category; dietary tags are managed on each dish in Menu content."
        >
          <Control label="Font pairing">
            <Segment
              value={theme.fontPairingId}
              values={[
                { id: "modern-sans-clean", label: "Modern" },
                { id: "serif-display-sans-body", label: "Editorial" },
                { id: "editorial-mono", label: "Mono" },
              ]}
              onChange={(value) =>
                onUpdate({ fontPairingId: value as GuestMenuTheme["fontPairingId"] })
              }
            />
          </Control>
          <Control label="Base text size">
            <Segment
              value={theme.baseTextSize ?? "medium"}
              values={[
                { id: "small", label: "Small" },
                { id: "medium", label: "Medium" },
                { id: "large", label: "Large" },
              ]}
              onChange={(value) =>
                onUpdate({ baseTextSize: value as GuestMenuTheme["baseTextSize"] })
              }
            />
          </Control>
          <Control label="Dietary tags">
            <Segment
              value={theme.dietaryTagDisplay ?? "text"}
              values={[
                { id: "icons", label: "Icons" },
                { id: "text", label: "Text" },
                { id: "hide", label: "Hide" },
              ]}
              onChange={(value) =>
                onUpdate({ dietaryTagDisplay: value as GuestMenuTheme["dietaryTagDisplay"] })
              }
            />
          </Control>
        </SettingsGroup>
        <SettingsGroup
          icon={<Sparkles size={17} />}
          title="Motion"
          note="Short, purposeful transitions for menu content."
        >
          <Control label="Items enter">
            <Segment
              value={entrance}
              values={animations}
              onChange={(value) => onUpdate({ entranceAnimationPreset: value as MenuAnimation })}
            />
          </Control>
          <Control label="Items leave">
            <Segment
              value={exit}
              values={animations}
              onChange={(value) => onUpdate({ exitAnimationPreset: value as MenuAnimation })}
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
        <section className="publish-summary-card">
          <span>
            <Gauge size={18} />
          </span>
          <p className="eyebrow">Publish status</p>
          <h3>
            {theme.isPublished ? `Version ${theme.version} is live` : "Ready for first publish"}
          </h3>
          <p>Publishing saves these settings and updates the public menu immediately.</p>
          <button className="button button-primary" onClick={publish} disabled={isPublishing}>
            {isPublishing ? "Publishing…" : "Publish now"}
          </button>
          {history[0] && (
            <small>Last publication: {new Date(history[0].createdAt).toLocaleString()}</small>
          )}
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
            aria-labelledby="menu-css-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>
                  <Type size={17} />
                </span>
                <div>
                  <h2 id="menu-css-title">Advanced styling</h2>
                  <p>CSS applies only to the guest menu.</p>
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
                placeholder={".public-menu-page {\n  /* your styles */\n}"}
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

function normaliseAnimation(value: MenuAnimation): "none" | "fade" | "slide" | "scale" {
  if (value === "fade-in") return "fade";
  if (value === "slide-up-stagger") return "slide";
  if (value === "reveal-editorial") return "scale";
  return value;
}
function SettingsGroup({
  icon,
  title,
  note,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  children: React.ReactNode;
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
function Control({ label, children }: { label: string; children: React.ReactNode }) {
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
  values: Array<{ id: string; label: string; icon?: React.ReactNode }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-segment">
      {values.map((item) => (
        <button
          className={value === item.id ? "selected" : ""}
          onClick={() => onChange(item.id)}
          key={item.id}
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
        <b>Menu published</b> The public restaurant menu is now up to date.
      </span>
    </div>
  );
}
