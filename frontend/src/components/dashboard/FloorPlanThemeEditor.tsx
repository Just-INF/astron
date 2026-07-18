import { Map } from "lucide-react";
import type { FloorPlanTheme, TableShape } from "@/types";

interface FloorPlanThemeEditorProps {
  theme: FloorPlanTheme;
  onUpdate: (patch: Partial<FloorPlanTheme>) => void;
  onPublish: () => void;
}

export function FloorPlanThemeEditor({ theme, onUpdate, onPublish }: FloorPlanThemeEditorProps) {
  return (
    <section className="display-settings-group floor-plan-display-settings">
      <header>
        <span>
          <Map size={17} />
        </span>
        <div>
          <h3>Floor plan display</h3>
          <p>Control how the room appears to guests.</p>
        </div>
      </header>
      <div>
        <div className="floor-plan-theme-grid">
          <label className="floor-plan-zoom-control">
            <span>Default zoom</span>
            <input
              type="range"
              min="1.3"
              max="2.8"
              step=".1"
              value={theme.initialZoomPadding}
              onChange={(event) => onUpdate({ initialZoomPadding: Number(event.target.value) })}
            />
            <small>{theme.initialZoomPadding.toFixed(1)}× framing</small>
          </label>
          <label>
            <span>Grid & snap</span>
            <button
              type="button"
              className={theme.snapToGrid ? "is-active" : ""}
              onClick={() => onUpdate({ snapToGrid: !theme.snapToGrid })}
            >
              {theme.snapToGrid ? "Snap to grid on" : "Snap to grid off"}
            </button>
          </label>
          <label>
            <span>Table label</span>
            <select
              value={theme.labelMode}
              onChange={(event) =>
                onUpdate({ labelMode: event.target.value as FloorPlanTheme["labelMode"] })
              }
            >
              <option value="capacity">Capacity</option>
              <option value="name">Table name</option>
              <option value="both">Name & capacity</option>
            </select>
          </label>
          <label>
            <span>New table shape</span>
            <select
              value={theme.defaultTableShape}
              onChange={(event) =>
                onUpdate({ defaultTableShape: event.target.value as TableShape })
              }
            >
              <option value="square">Square</option>
              <option value="circle">Round</option>
              <option value="rectangle">Rectangle</option>
            </select>
          </label>
        </div>
        <div className="floor-plan-color-row">
          <ColorControl
            label="Available"
            value={theme.availableColor}
            onChange={(availableColor) => onUpdate({ availableColor })}
          />
          <ColorControl
            label="Reserved"
            value={theme.reservedColor}
            onChange={(reservedColor) => onUpdate({ reservedColor })}
          />
          <ColorControl
            label="Occupied"
            value={theme.occupiedColor}
            onChange={(occupiedColor) => onUpdate({ occupiedColor })}
          />
        </div>
        <footer className="floor-plan-card-footer">
          <small>
            {theme.isPublished
              ? `Version ${theme.version} live · ${new Date(theme.updatedAt).toLocaleString()}`
              : "Draft only — not visible to guests."}
          </small>
          <button type="button" className="button button-primary" onClick={onPublish}>
            {theme.isPublished ? "Publish changes" : "Publish floor plan"}
          </button>
        </footer>
      </div>
    </section>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
