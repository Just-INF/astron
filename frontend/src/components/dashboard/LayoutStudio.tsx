import React, { useEffect, useState } from "react";
import {
  Box,
  BoxSelect,
  Circle,
  Copy,
  Grid2X2,
  Hand,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Spline,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DashboardPanel } from "@/components/dashboard/EmptyState";
import { FloorPlan2D, type FloorTool } from "@/components/canvas/FloorPlan2D";
import { useAuthStore } from "@/stores/useAuthStore";
import { defaultFloorPlanTheme, snapToGrid, useLayoutStore } from "@/stores/useLayoutStore";
import type { DiningTable, FloorZone, TableShape, TableStatus, WallGeometry } from "@/types";

const TableFloorCanvas = React.lazy(() =>
  import("@/components/canvas/TableFloorCanvas").then((module) => ({
    default: module.TableFloorCanvas,
  })),
);
const EMPTY_TABLES: DiningTable[] = [];
const EMPTY_WALLS: WallGeometry[] = [];
const EMPTY_ZONES: FloorZone[] = [];

const GROUPS: { label: string; tools: FloorTool[] }[] = [
  {
    label: "Tables",
    tools: ["round-table", "square-table", "rectangle-table"],
  },
  { label: "Walls", tools: ["wall"] },
  { label: "Zones", tools: ["zone-rectangle", "zone-polygon"] },
  { label: "View", tools: ["pan"] },
];
const TOOL_META: Record<FloorTool, { label: string; icon: typeof MousePointer2 }> = {
  select: { label: "Select & move", icon: MousePointer2 },
  "round-table": { label: "Round table", icon: Circle },
  "square-table": { label: "Square table", icon: Square },
  "rectangle-table": { label: "Rectangle table", icon: BoxSelect },
  wall: { label: "Wall", icon: Minus },
  "zone-rectangle": { label: "Zone (box)", icon: Box },
  "zone-polygon": { label: "Zone (free)", icon: Spline },
  pan: { label: "Pan canvas", icon: Hand },
};
function SelectionActions({
  kind,
  name,
  onNameChange,
  onRotateLeft,
  onRotateRight,
  onCopy,
  onDelete,
  showRotate = false,
}: {
  kind: string;
  name: string;
  onNameChange?: (value: string) => void;
  onRotateLeft?: () => void;
  onRotateRight?: () => void;
  onCopy: () => void;
  onDelete: () => void;
  showRotate?: boolean;
}) {
  return (
    <div className="selection-editor-top">
      <div className="selection-editor-identity">
        <span>{kind}</span>
        {onNameChange ? (
          <input
            className="selection-name-input"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            aria-label="Name"
            placeholder="Name"
          />
        ) : (
          <input className="selection-name-input" value={name} readOnly aria-label="Name" />
        )}
      </div>
      <div className="selection-editor-actions">
        {showRotate && (
          <>
            <button
              type="button"
              onClick={onRotateLeft}
              aria-label="Rotate left"
              title="Rotate left"
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              onClick={onRotateRight}
              aria-label="Rotate right"
              title="Rotate right"
            >
              <RotateCw size={14} />
            </button>
          </>
        )}
        <button type="button" onClick={onCopy} aria-label="Duplicate" title="Duplicate">
          <Copy size={14} />
        </button>
        <button
          className="is-danger"
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function TableInspector({
  table,
  onChange,
  onDelete,
  onRotateLeft,
  onRotateRight,
  onCopy,
  onLink,
  onUnlink,
}: {
  table: DiningTable;
  onChange: (patch: Partial<Omit<DiningTable, "id" | "restaurantId">>) => void;
  onDelete: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onCopy: () => void;
  onLink: () => void;
  onUnlink: () => void;
}) {
  const field = (label: string, value: number, key: "width" | "depth" | "rotation") => (
    <label className="metric-field">
      <span>{label}</span>
      <input
        type="number"
        step={key === "rotation" ? 15 : 0.1}
        value={value}
        onChange={(e) => onChange({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <aside className="selection-editor">
      <SelectionActions
        kind="Table"
        name={table.name}
        onNameChange={(value) => onChange({ name: value })}
        onRotateLeft={onRotateLeft}
        onRotateRight={onRotateRight}
        onCopy={onCopy}
        onDelete={onDelete}
        showRotate
      />

      <div className="selection-editor-rule" />
      <div className="selection-editor-caption">Registry</div>
      <div className="selection-editor-link-row">
        {table.linked === false ? (
          <button type="button" className="link-promote-button" onClick={onLink}>
            Link to table registry
          </button>
        ) : (
          <button type="button" className="link-unlink-button" onClick={onUnlink}>
            Unlink from registry
          </button>
        )}
      </div>
      <div className="selection-editor-grid">
        <label>
          <span>Covers</span>
          <input
            type="number"
            min="1"
            value={table.capacity}
            onChange={(e) => onChange({ capacity: Math.max(1, Number(e.target.value)) })}
          />
        </label>
        <label>
          <span>Service state</span>
          <select
            value={table.status}
            onChange={(e) => onChange({ status: e.target.value as TableStatus })}
          >
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="occupied">Occupied</option>
          </select>
        </label>
        <label className="selection-editor-wide">
          <span>Shape</span>
          <select
            value={table.shape}
            onChange={(e) => onChange({ shape: e.target.value as TableShape })}
          >
            <option value="circle">Round</option>
            <option value="square">Square</option>
            <option value="rectangle">Rectangle</option>
          </select>
        </label>
      </div>
      <div className="selection-editor-rule" />
      <div className="selection-editor-caption">Dimensions</div>
      <div className="selection-editor-grid selection-editor-grid-three">
        {field("Width", table.width ?? (table.shape === "rectangle" ? 1.56 : 0.96), "width")}
        {field("Depth", table.depth ?? (table.shape === "rectangle" ? 0.76 : 0.96), "depth")}
        {field("Angle", table.rotation, "rotation")}
      </div>
      <div className="selection-editor-caption">Position</div>
      <div className="selection-editor-grid">
        <label>
          <span>X position</span>
          <input
            type="number"
            step=".5"
            value={table.position.x}
            onChange={(e) =>
              onChange({
                position: {
                  ...table.position,
                  x: snapToGrid(Number(e.target.value)),
                },
              })
            }
          />
        </label>
        <label>
          <span>Y position</span>
          <input
            type="number"
            step=".5"
            value={table.position.y}
            onChange={(e) =>
              onChange({
                position: {
                  ...table.position,
                  y: snapToGrid(Number(e.target.value)),
                },
              })
            }
          />
        </label>
      </div>
    </aside>
  );
}

function WallInspector({
  wall,
  onChange,
  onDelete,
  onCopy,
}: {
  wall: WallGeometry;
  onChange: (patch: Partial<Omit<WallGeometry, "id" | "restaurantId">>) => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const setSegmentCurve = (index: number, curve: number) =>
    onChange({
      segments: wall.segments.map((s, i) => (i === index ? { curve } : s)),
    });
  return (
    <aside className="selection-editor">
      <SelectionActions kind="Wall" name="Wall" onCopy={onCopy} onDelete={onDelete} />

      <div className="selection-editor-rule" />
      <div className="selection-editor-grid">
        <label>
          <span>Thickness (m)</span>
          <input
            type="number"
            min=".04"
            step=".02"
            value={wall.thickness}
            onChange={(e) => onChange({ thickness: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>Height (m)</span>
          <input
            type="number"
            min=".1"
            step=".1"
            value={wall.height}
            onChange={(e) => onChange({ height: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="selection-editor-rule" />
      <div className="selection-editor-caption">Curve</div>
      <div className="selection-editor-curve-list">
        {wall.segments.map((seg, i) => (
          <label key={i}>
            <span>Segment {i + 1}</span>
            <input
              type="range"
              min="-2"
              max="2"
              step=".1"
              value={seg.curve}
              onChange={(e) => setSegmentCurve(i, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
    </aside>
  );
}

const ZONE_PRESETS = ["#9ee1c3", "#8aa9ff", "#f1a4aa", "#e6c98a", "#c4a3ff", "#7fd1e6"];
function ZoneInspector({
  zone,
  onChange,
  onDelete,
  onCopy,
}: {
  zone: FloorZone;
  onChange: (patch: Partial<Omit<FloorZone, "id" | "restaurantId">>) => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  return (
    <aside className="selection-editor">
      <SelectionActions
        kind="Zone"
        name={zone.name}
        onNameChange={(value) => onChange({ name: value })}
        onCopy={onCopy}
        onDelete={onDelete}
      />

      <div className="selection-editor-caption">Colour</div>
      <div className="zone-swatches selection-zone-swatches">
        {ZONE_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={zone.color.toLowerCase() === c.toLowerCase() ? "active" : ""}
            style={{ background: c }}
            onClick={() => onChange({ color: c })}
            aria-label={c}
          />
        ))}
        <input
          type="color"
          value={zone.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="zone-color-input"
          aria-label="Custom zone color"
        />
      </div>
      {zone.shape === "polygon" && zone.segments && (
        <>
          <div className="selection-editor-caption">Curve</div>
          <div className="selection-editor-curve-list">
            {zone.segments.map((seg, i) => (
              <label key={i}>
                <span>Segment {i + 1}</span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step=".1"
                  value={seg.curve}
                  onChange={(e) =>
                    onChange({
                      segments: zone.segments!.map((s, j) =>
                        j === i ? { curve: Number(e.target.value) } : s,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

export function LayoutStudio() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const restaurantId = currentUser?.activeRestaurantId ?? "";
  const tables = useLayoutStore((s) => s.tables[restaurantId] ?? EMPTY_TABLES);
  const walls = useLayoutStore((s) => s.walls[restaurantId] ?? EMPTY_WALLS);
  const zones = useLayoutStore((s) => s.zones[restaurantId] ?? EMPTY_ZONES);
  const selectedTableId = useLayoutStore((s) => s.selectedTableId);
  const storedFloorPlanTheme = useLayoutStore((s) => s.floorPlanThemes[restaurantId]);
  const floorPlanTheme = storedFloorPlanTheme ?? defaultFloorPlanTheme(restaurantId);
  const {
    addTable,
    updateTable,
    updateTablePosition,
    deleteTable,
    selectTable,
    addWall,
    updateWall,
    deleteWall,
    addZone,
    updateZone,
    deleteZone,
    duplicateTable,
    duplicateWall,
    duplicateZone,
    moveZoneNode,
    insertZoneNode,
    convertZoneToPolygon,
    insertWallNode,
    undo,
    redo,
    linkTable,
    unlinkTable,
  } = useLayoutStore();
  const canUndo = useLayoutStore((s) => s.past.length > 0);
  const canRedo = useLayoutStore((s) => s.future.length > 0);
  const layoutSaveError = useLayoutStore((s) => s.layoutSaveError);
  const [tool, setTool] = useState<FloorTool>("select");
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [curveSegments, setCurveSegments] = useState(false);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedWall = walls.find((w) => w.id === selectedWallId) ?? null;
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select") || target?.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Escape") {
        selectTable(null);
        setSelectedWallId(null);
        setSelectedZoneId(null);
        setTool("select");
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedTable) deleteTable(restaurantId, selectedTable.id);
        else if (selectedWall) {
          deleteWall(restaurantId, selectedWall.id);
          setSelectedWallId(null);
        } else if (selectedZone) {
          deleteZone(restaurantId, selectedZone.id);
          setSelectedZoneId(null);
        }
        return;
      }
      if (!selectedTable) return;
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -0.5],
        ArrowDown: [0, 0.5],
        ArrowLeft: [-0.5, 0],
        ArrowRight: [0.5, 0],
      };
      if (event.key in moves) {
        event.preventDefault();
        const [x, y] = moves[event.key];
        updateTablePosition(
          restaurantId,
          selectedTable.id,
          selectedTable.position.x + x,
          selectedTable.position.y + y,
        );
      }
      if (event.key.toLowerCase() === "r")
        updateTable(restaurantId, selectedTable.id, {
          rotation: (selectedTable.rotation + (event.shiftKey ? -15 : 15) + 360) % 360,
        });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    restaurantId,
    selectedTable,
    selectedWall,
    selectedZone,
    deleteTable,
    deleteWall,
    deleteZone,
    selectTable,
    updateTable,
    updateTablePosition,
    undo,
    redo,
  ]);
  if (!restaurantId) return null;

  const handleSelectTable = (id: string | null) => {
    selectTable(id);
    setSelectedWallId(null);
    setSelectedZoneId(null);
    if (id) setTool("select");
  };
  const handleSelectWall = (id: string | null) => {
    setSelectedWallId(id);
    selectTable(null);
    setSelectedZoneId(null);
    if (id) setTool("select");
  };
  const handleSelectZone = (id: string | null) => {
    setSelectedZoneId(id);
    selectTable(null);
    setSelectedWallId(null);
    if (id) setTool("select");
  };

  function createTable(shape: TableShape, x: number, y: number) {
    const selectedShape = shape ?? floorPlanTheme.defaultTableShape;
    addTable(restaurantId, {
      name: `Table ${tables.length + 1}`,
      capacity: selectedShape === "rectangle" ? 4 : 2,
      shape: selectedShape,
      position: { x, y, z: 0 },
      rotation: 0,
      status: "available",
      linked: false,
      width: selectedShape === "rectangle" ? 1.56 : 0.96,
      depth: selectedShape === "rectangle" ? 0.76 : 0.96,
    });
    setTool("select");
  }
  const rotateTable = (dir: 1 | -1) => {
    if (selectedTable)
      updateTable(restaurantId, selectedTable.id, {
        rotation: (selectedTable.rotation + dir * 15 + 360) % 360,
      });
  };
  const handleLinkTable = () => {
    if (selectedTable) linkTable(restaurantId, selectedTable.id);
  };
  const handleUnlinkTable = () => {
    if (selectedTable) unlinkTable(restaurantId, selectedTable.id);
  };
  const handleDuplicateTable = () => {
    if (selectedTable) selectTable(duplicateTable(restaurantId, selectedTable));
  };
  const handleDuplicateWall = () => {
    if (selectedWall) setSelectedWallId(duplicateWall(restaurantId, selectedWall));
  };
  const handleDuplicateZone = () => {
    if (selectedZone) setSelectedZoneId(duplicateZone(restaurantId, selectedZone));
  };

  return (
    <DashboardPanel>
      <header className="layout-page-header layout-page-header-compact">
        <div>
          <p className="eyebrow">Floor plan studio</p>
          <h1>Design the room.</h1>
        </div>
      </header>
      {layoutSaveError && (
        <p className="form-error" role="alert">
          {layoutSaveError} The latest server layout has been restored; review your changes and
          retry.
        </p>
      )}
      <section className="layout-studio-grid layout-studio-revamp">
        <div className="canvas-toolbar" aria-label="Floor plan tools">
          <div className="toolbar-tools">
            <div className="toolbar-cluster">
              <button
                className={tool === "select" ? "active" : ""}
                type="button"
                onClick={() => {
                  setTool("select");
                  setMode("2d");
                }}
                title="Select and move"
                aria-label="Select and move"
              >
                <MousePointer2 size={17} />
              </button>
              {GROUPS.flatMap((group) => group.tools).map((id) => {
                const meta = TOOL_META[id];
                const Icon = meta.icon;
                return (
                  <button
                    key={id}
                    className={tool === id ? "active" : ""}
                    type="button"
                    onClick={() => {
                      setTool(id);
                      setMode("2d");
                    }}
                    title={meta.label}
                    aria-label={meta.label}
                  >
                    <Icon size={17} />
                  </button>
                );
              })}
            </div>
            {tool === "wall" && (
              <label className="toolbar-curve-toggle" title="Curve new wall segments">
                <input
                  type="checkbox"
                  checked={curveSegments}
                  onChange={(e) => setCurveSegments(e.target.checked)}
                />
                <Spline size={15} />
                <span>Curve</span>
              </label>
            )}
            <div className="toolbar-cluster toolbar-history-cluster">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="toolbar-history"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 size={17} />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="toolbar-history"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 size={17} />
              </button>
            </div>
          </div>
          <div className="toolbar-meta">
            <button
              className="toolbar-icon-button"
              type="button"
              onClick={() => setMode(mode === "2d" ? "3d" : "2d")}
              title={mode === "2d" ? "Open 3D preview" : "Return to 2D editor"}
              aria-label={mode === "2d" ? "Open 3D preview" : "Return to 2D editor"}
            >
              {mode === "2d" ? <Grid2X2 size={17} /> : <Undo2 size={17} />}
            </button>
            <button
              className="toolbar-icon-button toolbar-add-button"
              type="button"
              onClick={() => {
                setTool("round-table");
                setMode("2d");
              }}
              title="Add round table"
              aria-label="Add round table"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
        <div className="canvas-shell layout-canvas-shell">
          <div className="canvas-key">
            <span>
              <i /> Available
            </span>
            <span>
              <i /> Occupied
            </span>
            <span>
              <i /> Reserved
            </span>
          </div>
          <div className="canvas-title">
            <span>Design canvas</span>
            <b>{TOOL_META[tool].label}</b>
          </div>
          {tables.length === 0 && walls.length === 0 && zones.length === 0 && (
            <div className="layout-empty-state">
              <p className="eyebrow">Empty floor plan</p>
              <h2>Start with your tables.</h2>
              <p>This canvas is empty. Create tables in the Tables view, then arrange them here.</p>
              <Link to="/dashboard/tables" className="button button-primary">
                Manage tables
              </Link>
            </div>
          )}
          {(selectedTable || selectedWall || selectedZone) && (
            <div className="canvas-context-panel">
              <div className="context-panel-header">
                <span>Selected object</span>
                <button
                  type="button"
                  onClick={() => {
                    selectTable(null);
                    setSelectedWallId(null);
                    setSelectedZoneId(null);
                  }}
                  title="Close inspector"
                  aria-label="Close inspector"
                >
                  <X size={14} />
                </button>
              </div>
              {selectedTable ? (
                <TableInspector
                  table={selectedTable}
                  onChange={(patch) => updateTable(restaurantId, selectedTable.id, patch)}
                  onDelete={() => deleteTable(restaurantId, selectedTable.id)}
                  onRotateLeft={() => rotateTable(-1)}
                  onRotateRight={() => rotateTable(1)}
                  onCopy={handleDuplicateTable}
                  onLink={handleLinkTable}
                  onUnlink={handleUnlinkTable}
                />
              ) : selectedWall ? (
                <WallInspector
                  wall={selectedWall}
                  onChange={(patch) => updateWall(restaurantId, selectedWall.id, patch)}
                  onDelete={() => deleteWall(restaurantId, selectedWall.id)}
                  onCopy={handleDuplicateWall}
                />
              ) : selectedZone ? (
                <ZoneInspector
                  zone={selectedZone}
                  onChange={(patch) => updateZone(restaurantId, selectedZone.id, patch)}
                  onDelete={() => deleteZone(restaurantId, selectedZone.id)}
                  onCopy={handleDuplicateZone}
                />
              ) : null}
            </div>
          )}
          {mode === "2d" ? (
            <FloorPlan2D
              tables={tables}
              walls={walls}
              zones={zones}
              selectedTableId={selectedTable?.id ?? null}
              selectedWallId={selectedWallId}
              selectedZoneId={selectedZoneId}
              tool={tool}
              curveSegments={curveSegments}
              onSelectTable={handleSelectTable}
              onSelectWall={handleSelectWall}
              onSelectZone={handleSelectZone}
              onMoveTable={(id, x, y) => updateTablePosition(restaurantId, id, x, y)}
              onTranslateZone={(id, points, dx, dy) =>
                updateZone(restaurantId, id, {
                  points: points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
                })
              }
              onCreateTable={createTable}
              onCreateWall={(nodes, segments, closed) => {
                addWall(restaurantId, {
                  nodes,
                  segments,
                  thickness: 0.24,
                  height: 0.8,
                  closed,
                });
              }}
              onCreateZone={(zone) => {
                addZone(restaurantId, zone);
                setTool("select");
              }}
              onMoveWallNode={(wallId, index, point) => {
                const wall = walls.find((w) => w.id === wallId);
                if (!wall) return;
                updateWall(restaurantId, wallId, {
                  nodes: wall.nodes.map((n, i) => (i === index ? point : n)),
                });
              }}
              onMoveZoneNode={(zoneId, index, point) =>
                moveZoneNode(restaurantId, zoneId, index, point)
              }
              onInsertZoneNode={(zoneId, index, point) =>
                insertZoneNode(restaurantId, zoneId, index, point)
              }
              onConvertZoneToPolygon={(zoneId) => convertZoneToPolygon(restaurantId, zoneId)}
              onInsertWallNode={(wallId, index, point) =>
                insertWallNode(restaurantId, wallId, index, point)
              }
            />
          ) : (
            <React.Suspense fallback={null}>
              <TableFloorCanvas
                tables={tables}
                walls={walls}
                zones={zones}
                selectedTableId={selectedTable?.id ?? null}
                onSelect={selectTable}
                onMove={(id, x, y) => updateTablePosition(restaurantId, id, x, y)}
                allowDrag={false}
                initialZoomPadding={floorPlanTheme.initialZoomPadding}
                labelMode={floorPlanTheme.labelMode}
                statusColors={{
                  available: floorPlanTheme.availableColor,
                  reserved: floorPlanTheme.reservedColor,
                  occupied: floorPlanTheme.occupiedColor,
                }}
              />
            </React.Suspense>
          )}
        </div>
      </section>
    </DashboardPanel>
  );
}
