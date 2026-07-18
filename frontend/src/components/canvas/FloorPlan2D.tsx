import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { DiningTable, FloorZone, WallGeometry } from "@/types";
import { snapToGrid } from "@/stores/useLayoutStore";

export type FloorTool =
  | "select"
  | "round-table"
  | "square-table"
  | "rectangle-table"
  | "wall"
  | "zone-rectangle"
  | "zone-polygon"
  | "pan";

interface Props {
  tables: DiningTable[];
  walls: WallGeometry[];
  zones: FloorZone[];
  selectedTableId: string | null;
  selectedWallId: string | null;
  selectedZoneId: string | null;
  tool: FloorTool;
  curveSegments: boolean;
  colorByTable?: Record<string, string>;
  onSelectTable: (id: string | null) => void;
  onSelectWall: (id: string | null) => void;
  onSelectZone: (id: string | null) => void;
  onMoveTable: (id: string, x: number, y: number) => void;
  onTranslateZone: (id: string, points: { x: number; y: number }[], dx: number, dy: number) => void;
  onCreateTable: (shape: DiningTable["shape"], x: number, y: number) => void;
  onCreateWall: (
    nodes: { x: number; y: number }[],
    segments: { curve: number }[],
    closed: boolean,
  ) => void;
  onCreateZone: (zone: {
    name: string;
    color: string;
    shape: "rectangle" | "polygon";
    points: { x: number; y: number }[];
    segments?: { curve: number }[];
  }) => void;
  onMoveWallNode?: (wallId: string, index: number, point: { x: number; y: number }) => void;
  onMoveZoneNode?: (zoneId: string, index: number, point: { x: number; y: number }) => void;
  onInsertWallNode?: (wallId: string, index: number, point: { x: number; y: number }) => void;
  onInsertZoneNode?: (zoneId: string, index: number, point: { x: number; y: number }) => void;
  onConvertZoneToPolygon?: (zoneId: string) => void;
}

const ZONE_COLORS = ["#9ee1c3", "#8aa9ff", "#f1a4aa", "#e6c98a", "#c4a3ff", "#7fd1e6"];
const MIN_SCALE = 8;
const MAX_SCALE = 400;
const DEFAULT_CAMERA = { x: 0, y: 0, scale: 34 };

function niceStep(scale: number) {
  const target = 16; // desired px per minor grid cell
  const raw = target / scale;
  const steps = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const s of steps) if (s >= raw) return s;
  return steps[steps.length - 1];
}
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentPath(a: { x: number; y: number }, b: { x: number; y: number }, curve: number) {
  if (!curve) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = midX + (-dy / len) * curve;
  const cy = midY + (dx / len) * curve;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}
function segMid(a: { x: number; y: number }, b: { x: number; y: number }, curve: number) {
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  if (!curve) return { x: mx, y: my };
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * curve,
    cy = my + (dx / len) * curve;
  return { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y };
}
function zonePath(zone: FloorZone): string {
  let pts = zone.points;
  if (zone.shape === "rectangle" && pts.length === 2) {
    const [a, b] = pts;
    const x1 = Math.min(a.x, b.x),
      x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y),
      y2 = Math.max(a.y, b.y);
    pts = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
  }
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const segCount = pts.length;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % segCount];
    const curve = zone.segments?.[i]?.curve ?? 0;
    if (curve) {
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy) || 1;
      const cx = mx + (-dy / len) * curve,
        cy = my + (dx / len) * curve;
      d += ` Q ${cx} ${cy} ${b.x} ${b.y}`;
    } else {
      d += ` L ${b.x} ${b.y}`;
    }
  }
  return d + " Z";
}
function zoneCentroid(zone: FloorZone) {
  const pts =
    zone.shape === "rectangle"
      ? (() => {
          const [a, b] = zone.points;
          return [
            { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
            { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
          ];
        })()
      : zone.points;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

export function FloorPlan2D({
  tables,
  walls,
  zones,
  selectedTableId,
  selectedWallId,
  selectedZoneId,
  tool,
  curveSegments,
  colorByTable,
  onSelectTable,
  onSelectWall,
  onSelectZone,
  onMoveTable,
  onTranslateZone,
  onCreateTable,
  onCreateWall,
  onCreateZone,
  onMoveWallNode,
  onMoveZoneNode,
  onInsertWallNode,
  onInsertZoneNode,
  onConvertZoneToPolygon,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const dragId = useRef<string | null>(null);
  const zoneDragId = useRef<string | null>(null);
  const zoneDragStart = useRef<{ x: number; y: number } | null>(null);
  const zoneDragOriginal = useRef<{ x: number; y: number }[] | null>(null);
  const zoneDragPending = useRef<{
    id: string;
    points: { x: number; y: number }[];
    startWorld: { x: number; y: number };
  } | null>(null);
  const panRef = useRef<{
    startPx: { x: number; y: number };
    startCam: { x: number; y: number; scale: number };
  } | null>(null);
  const panPendingRef = useRef<{
    startPx: { x: number; y: number };
    startCam: { x: number; y: number; scale: number };
    moved: boolean;
  } | null>(null);
  const nodeDragRef = useRef<{ wallId: string; index: number } | null>(null);
  const zoneNodeDragRef = useRef<{ zoneId: string; index: number } | null>(null);
  const didFit = useRef(false);
  const cameraRef = useRef(DEFAULT_CAMERA);
  const sizeRef = useRef({ w: 800, h: 600 });

  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [wallDragStart, setWallDragStart] = useState<{ x: number; y: number } | null>(null);
  const [zonePoints, setZonePoints] = useState<{ x: number; y: number }[]>([]);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectEnd, setRectEnd] = useState<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<{ kind: "wall" | "zone"; id: string } | null>(null);

  cameraRef.current = camera;
  sizeRef.current = size;

  const placingTable = tool.endsWith("table");
  const placingWall = tool === "wall";
  const placingZoneRect = tool === "zone-rectangle";
  const placingZonePoly = tool === "zone-polygon";
  const placingZone = placingZoneRect || placingZonePoly;
  const isPan = tool === "pan";
  const drawing = placingWall || placingZonePoly;

  // Measure the SVG pixel size (no viewBox -> 1 user unit = 1 px).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(() => {
    const pts: { x: number; y: number }[] = [
      ...tables.map((t) => t.position),
      ...walls.flatMap((w) => w.nodes),
      ...zones.flatMap((z) => z.points),
    ].filter(
      (point): point is { x: number; y: number } =>
        Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y),
    );
    if (pts.length === 0) {
      setCamera(DEFAULT_CAMERA);
      return;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const pad = 1.5;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((size.w - 48) / (w + pad * 2), (size.h - 48) / (h + pad * 2))),
    );
    setCamera({ x: cx, y: cy, scale });
  }, [tables, walls, zones, size, setCamera]);

  // Fit the view to all content once both the SVG size and the layout data are known.
  // Runs once (does not re-fit on later edits or resize). The one-time fit is an
  // intentional state initialization, not a reactive update.
  useEffect(() => {
    if (didFit.current) return;
    if (walls.length === 0 && tables.length === 0 && zones.length === 0) return;
    if (size.w <= 0 || size.h <= 0) return;
    didFit.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fitView();
  }, [walls.length, tables.length, zones.length, size.w, size.h, fitView]);

  // Wheel zoom (non-passive so we can prevent page scroll). Zoom keeps the
  // world point under the cursor fixed.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const cam = cameraRef.current;
      const sz = sizeRef.current;
      const before = {
        x: (px - sz.w / 2) / cam.scale + cam.x,
        y: (py - sz.h / 2) / cam.scale + cam.y,
      };
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
      setCamera({
        x: before.x - (px - sz.w / 2) / newScale,
        y: before.y - (py - sz.h / 2) / newScale,
        scale: newScale,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function screenToWorld(px: number, py: number, cam = camera, sz = size) {
    return { x: (px - sz.w / 2) / cam.scale + cam.x, y: (py - sz.h / 2) / cam.scale + cam.y };
  }
  function clientToWorld(clientX: number, clientY: number) {
    const rect = ref.current!.getBoundingClientRect();
    return screenToWorld(clientX - rect.left, clientY - rect.top);
  }
  function toPoint(event: { clientX: number; clientY: number }) {
    const w = clientToWorld(event.clientX, event.clientY);
    return { x: snapToGrid(w.x), y: snapToGrid(w.y) };
  }
  function snapWallNode(p: { x: number; y: number }, excludeWallId?: string) {
    let best: { x: number; y: number } | null = null;
    let bestD = 0.45;
    for (const w of walls) {
      if (w.id === excludeWallId) continue;
      for (const n of w.nodes) {
        const d = Math.hypot(p.x - n.x, p.y - n.y);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
    return best ?? p;
  }

  // Reset transient drawing state when the active tool changes. This is an
  // intentional reset in response to a controlled prop, not derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWallDragStart(null);
    setZonePoints([]);
    setRectStart(null);
    setRectEnd(null);
    setCursor(null);
    setEditing(null);
    zoneDragPending.current = null;
    panPendingRef.current = null;
  }, [tool]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") {
        if (zonePoints.length >= 3) finishZone();
      } else if (e.key === "Escape") {
        setWallDragStart(null);
        setZonePoints([]);
        setRectStart(null);
        setRectEnd(null);
        setEditing(null);
        zoneDragPending.current = null;
        panPendingRef.current = null;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonePoints, zones.length]);

  function finishZone() {
    const pts = zonePoints.filter((p, i) => i === 0 || dist(p, zonePoints[i - 1]) > 0.01);
    if (pts.length >= 3) {
      onCreateZone({
        name: `Zone ${zones.length + 1}`,
        color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
        shape: "polygon",
        points: pts,
        segments: pts.map(() => ({ curve: 0 })),
      });
    }
    setZonePoints([]);
  }

  function beginBackground(event: ReactPointerEvent<SVGSVGElement>) {
    if (!ref.current) return;
    const isMiddle = event.button === 1;
    const isPanStart = isMiddle || (event.button === 0 && isPan);
    if (isPanStart) {
      event.preventDefault();
      const rect = ref.current.getBoundingClientRect();
      panRef.current = {
        startPx: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        startCam: { ...camera },
      };
      ref.current.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const point = toPoint(event);
    if (placingTable) {
      const shape =
        tool === "round-table" ? "circle" : tool === "square-table" ? "square" : "rectangle";
      onCreateTable(shape, point.x, point.y);
      return;
    }
    if (placingWall) {
      if (!wallDragStart) {
        setWallDragStart(snapWallNode(point));
      } else {
        const endPt = snapWallNode(toPoint(event));
        const d = Math.hypot(endPt.x - wallDragStart.x, endPt.y - wallDragStart.y);
        if (d >= 0.3) onCreateWall([wallDragStart, endPt], [{ curve: previewCurve }], false);
        setWallDragStart(null);
      }
      return;
    }
    if (placingZonePoly) {
      if (zonePoints.length >= 3 && dist(point, zonePoints[0]) < 0.5) {
        finishZone();
        return;
      }
      setZonePoints((p) => [...p, point]);
      return;
    }
    if (placingZoneRect) {
      if (!rectStart) setRectStart(point);
      return;
    }
    if (tool === "select") {
      const rect = ref.current.getBoundingClientRect();
      panPendingRef.current = {
        startPx: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        startCam: { ...camera },
        moved: false,
      };
      return;
    }
  }
  function finishOnDoubleClick(event: ReactMouseEvent) {
    if (placingZoneRect && rectStart) {
      const endPt = toPoint(event);
      const a = rectStart,
        b = endPt;
      if (Math.abs(b.x - a.x) >= 0.5 && Math.abs(b.y - a.y) >= 0.5) {
        const x1 = Math.min(a.x, b.x),
          x2 = Math.max(a.x, b.x);
        const y1 = Math.min(a.y, b.y),
          y2 = Math.max(a.y, b.y);
        onCreateZone({
          name: `Zone ${zones.length + 1}`,
          color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
          shape: "rectangle",
          points: [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
          ],
        });
      }
      setRectStart(null);
      setRectEnd(null);
      return;
    }
    if (placingZonePoly && zonePoints.length >= 3) {
      finishZone();
      return;
    }
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    if (!ref.current) return;
    if (nodeDragRef.current) {
      const p = clientToWorld(event.clientX, event.clientY);
      const snapped = snapWallNode(
        { x: snapToGrid(p.x), y: snapToGrid(p.y) },
        nodeDragRef.current.wallId,
      );
      onMoveWallNode?.(nodeDragRef.current.wallId, nodeDragRef.current.index, snapped);
      return;
    }
    if (zoneNodeDragRef.current) {
      const p = clientToWorld(event.clientX, event.clientY);
      onMoveZoneNode?.(zoneNodeDragRef.current.zoneId, zoneNodeDragRef.current.index, {
        x: snapToGrid(p.x),
        y: snapToGrid(p.y),
      });
      return;
    }
    if (panRef.current) {
      const rect = ref.current.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const dx = px - panRef.current.startPx.x;
      const dy = py - panRef.current.startPx.y;
      const scale = cameraRef.current.scale;
      setCamera({
        x: panRef.current.startCam.x - dx / scale,
        y: panRef.current.startCam.y - dy / scale,
        scale,
      });
      return;
    }
    if (panPendingRef.current && !panRef.current) {
      const rect = ref.current.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const dx = px - panPendingRef.current.startPx.x;
      const dy = py - panPendingRef.current.startPx.y;
      if (Math.hypot(dx, dy) > 4) {
        panPendingRef.current.moved = true;
        panRef.current = {
          startPx: panPendingRef.current.startPx,
          startCam: panPendingRef.current.startCam,
        };
        ref.current?.setPointerCapture(event.pointerId);
      }
      return;
    }
    const point = toPoint(event);
    if (dragId.current) {
      onMoveTable(dragId.current, point.x, point.y);
      return;
    }
    if (zoneDragPending.current && !zoneDragId.current) {
      zoneDragId.current = zoneDragPending.current.id;
      zoneDragOriginal.current = zoneDragPending.current.points;
      zoneDragStart.current = zoneDragPending.current.startWorld;
      zoneDragPending.current = null;
      ref.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (zoneDragId.current && zoneDragOriginal.current && zoneDragStart.current) {
      const id = zoneDragId.current;
      const original = zoneDragOriginal.current;
      const start = zoneDragStart.current;
      onTranslateZone(id, original, point.x - start.x, point.y - start.y);
      return;
    }
    if (rectStart) {
      setRectEnd(point);
      return;
    }
    if (drawing || placingTable || placingZone) setCursor(point);
  }
  function end(event: ReactPointerEvent<SVGSVGElement>) {
    if (nodeDragRef.current) {
      nodeDragRef.current = null;
      if (ref.current?.hasPointerCapture(event.pointerId))
        ref.current.releasePointerCapture(event.pointerId);
      return;
    }
    if (zoneNodeDragRef.current) {
      zoneNodeDragRef.current = null;
      if (ref.current?.hasPointerCapture(event.pointerId))
        ref.current.releasePointerCapture(event.pointerId);
      return;
    }
    if (panRef.current) {
      panRef.current = null;
      panPendingRef.current = null;
      if (ref.current?.hasPointerCapture(event.pointerId))
        ref.current.releasePointerCapture(event.pointerId);
      return;
    }
    if (panPendingRef.current) {
      if (!panPendingRef.current.moved) {
        onSelectTable(null);
        onSelectWall(null);
        onSelectZone(null);
        setEditing(null);
      }
      panPendingRef.current = null;
      return;
    }
    if (dragId.current) {
      dragId.current = null;
      return;
    }
    if (zoneDragId.current) {
      zoneDragId.current = null;
      zoneDragStart.current = null;
      zoneDragOriginal.current = null;
      return;
    }
    if (zoneDragPending.current) {
      zoneDragPending.current = null;
      return;
    }
  }
  function beginTableDrag(event: ReactPointerEvent<SVGGElement>, id: string) {
    if (event.button !== 0 || isPan) return; // let non-left / pan bubble to canvas
    event.stopPropagation();
    onSelectTable(id);
    dragId.current = id;
    ref.current?.setPointerCapture(event.pointerId);
  }
  function beginZoneDrag(
    event: ReactPointerEvent<SVGPathElement>,
    id: string,
    points: { x: number; y: number }[],
  ) {
    if (event.button !== 0 || isPan) return;
    event.stopPropagation();
    onSelectZone(id);
    // Defer the actual drag until the pointer moves, so a plain click only
    // selects (like walls) and a double-click can reach the polygon's handler
    // instead of being swallowed by pointer capture.
    zoneDragPending.current = {
      id,
      points,
      startWorld: clientToWorld(event.clientX, event.clientY),
    };
  }

  function beginNodeDrag(wallId: string, index: number, event: ReactPointerEvent) {
    if (event.button !== 0 || isPan) return;
    event.stopPropagation();
    onSelectWall(wallId);
    nodeDragRef.current = { wallId, index };
    ref.current?.setPointerCapture(event.pointerId);
  }

  function beginWallEdit(event: ReactMouseEvent, wallId: string) {
    if (tool !== "select") return;
    event.stopPropagation();
    onSelectWall(wallId);
    setEditing({ kind: "wall", id: wallId });
  }
  function beginZoneEdit(event: ReactMouseEvent, zone: FloorZone) {
    if (tool !== "select") return;
    event.stopPropagation();
    onSelectZone(zone.id);
    if (zone.shape === "rectangle") onConvertZoneToPolygon?.(zone.id);
    setEditing({ kind: "zone", id: zone.id });
  }
  function beginZoneNodeDrag(zoneId: string, index: number, event: ReactPointerEvent) {
    if (event.button !== 0 || isPan) return;
    event.stopPropagation();
    onSelectZone(zoneId);
    zoneNodeDragRef.current = { zoneId, index };
    ref.current?.setPointerCapture(event.pointerId);
  }
  function insertWallNodeAt(wallId: string, index: number, event: ReactPointerEvent) {
    if (tool !== "select") return;
    event.stopPropagation();
    onInsertWallNode?.(wallId, index, toPoint(event));
  }
  function insertZoneNodeAt(zoneId: string, index: number, event: ReactPointerEvent) {
    if (tool !== "select") return;
    event.stopPropagation();
    onInsertZoneNode?.(zoneId, index, toPoint(event));
  }

  function zoomBy(factor: number) {
    const cam = cameraRef.current;
    const sz = sizeRef.current;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
    const center = screenToWorld(sz.w / 2, sz.h / 2, cam, sz);
    setCamera({ x: center.x, y: center.y, scale: newScale });
  }
  function resetView() {
    setCamera(DEFAULT_CAMERA);
  }

  const previewCurve = curveSegments ? 1.2 : 0;
  const showSnap = cursor && (placingTable || placingWall || placingZonePoly || placingZoneRect);
  const transform = `translate(${size.w / 2} ${size.h / 2}) scale(${camera.scale}) translate(${-camera.x} ${-camera.y})`;
  const step = niceStep(camera.scale);
  const major = step * 5;

  // Adaptive infinite grid (screen space, recomputed from the camera).
  const gridLines: ReactElement[] = [];
  if (size.w > 0 && size.h > 0) {
    const tl = screenToWorld(0, 0);
    const br = screenToWorld(size.w, size.h);
    const xStart = Math.floor(tl.x / step) * step;
    const xCount = Math.min(500, Math.ceil((br.x - tl.x) / step) + 1);
    for (let i = 0; i <= xCount; i++) {
      const x = xStart + i * step;
      const sx = (x - camera.x) * camera.scale + size.w / 2;
      const isMaj = Math.abs(x - Math.round(x / major) * major) < 1e-6;
      gridLines.push(
        <line
          key={`vx${i}`}
          x1={sx}
          y1={0}
          x2={sx}
          y2={size.h}
          className={isMaj ? "floor-grid-major" : "floor-grid-minor"}
        />,
      );
    }
    const yStart = Math.floor(tl.y / step) * step;
    const yCount = Math.min(500, Math.ceil((br.y - tl.y) / step) + 1);
    for (let i = 0; i <= yCount; i++) {
      const y = yStart + i * step;
      const sy = (y - camera.y) * camera.scale + size.h / 2;
      const isMaj = Math.abs(y - Math.round(y / major) * major) < 1e-6;
      gridLines.push(
        <line
          key={`hy${i}`}
          x1={0}
          y1={sy}
          x2={size.w}
          y2={sy}
          className={isMaj ? "floor-grid-major" : "floor-grid-minor"}
        />,
      );
    }
  }

  const svgClass = [
    drawing || placingTable || placingZone || isPan ? "is-placing" : "",
    isPan ? "is-pan" : "",
  ]
    .join(" ")
    .trim();

  return (
    <div className="floor-plan">
      <svg
        ref={ref}
        className={svgClass}
        onPointerDown={beginBackground}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={finishOnDoubleClick}
        aria-label="Interactive 2D restaurant floor plan"
        role="application"
      >
        <g>{gridLines}</g>
        <g transform={transform}>
          {zones.map((zone) => (
            <path
              key={zone.id}
              d={zonePath(zone)}
              className={zone.id === selectedZoneId ? "floor-zone selected" : "floor-zone"}
              style={{ fill: zone.color, stroke: zone.color }}
              onPointerDown={(event) => beginZoneDrag(event, zone.id, zone.points)}
              onDoubleClick={(event) => beginZoneEdit(event, zone)}
            />
          ))}
          {zones.map((zone) => {
            const c = zoneCentroid(zone);
            return (
              <text
                key={`${zone.id}-label`}
                className="floor-zone-label"
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: zone.color }}
              >
                {zone.name}
              </text>
            );
          })}

          {walls.map((wall) => {
            const segCount = wall.closed ? wall.nodes.length : wall.nodes.length - 1;
            return Array.from({ length: segCount }).map((_, i) => {
              const a = wall.nodes[i];
              const b = wall.nodes[(i + 1) % wall.nodes.length];
              const d = segmentPath(a, b, wall.segments[i]?.curve ?? 0);
              return (
                <g key={`${wall.id}-${i}`}>
                  <path d={d} className="floor-wall-casing" strokeWidth={wall.thickness * 2} />
                  <path
                    d={d}
                    className={wall.id === selectedWallId ? "floor-wall selected" : "floor-wall"}
                    strokeWidth={wall.thickness}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelectWall(wall.id);
                    }}
                    onDoubleClick={(event) => beginWallEdit(event, wall.id)}
                  />
                </g>
              );
            });
          })}
          {editing?.kind === "wall" &&
            editing.id === selectedWallId &&
            (() => {
              const wall = walls.find((w) => w.id === editing.id);
              if (!wall) return null;
              const segCount = wall.closed ? wall.nodes.length : wall.nodes.length - 1;
              return (
                <g key={`edit-wall-${wall.id}`}>
                  {Array.from({ length: segCount }).map((_, i) => {
                    const a = wall.nodes[i];
                    const b = wall.nodes[(i + 1) % wall.nodes.length];
                    const curve = wall.segments[i]?.curve ?? 0;
                    const mid = segMid(a, b, curve);
                    return (
                      <g key={`seg-${i}`}>
                        <path
                          className="floor-seg-add"
                          d={segmentPath(a, b, curve)}
                          onPointerDown={(e) => insertWallNodeAt(wall.id, i, e)}
                        />
                        <circle
                          className="floor-node-add"
                          cx={mid.x}
                          cy={mid.y}
                          r={0.1}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
                  {wall.nodes.map((n, i) => (
                    <g
                      key={`node-${i}`}
                      className="floor-wall-node-group"
                      onPointerDown={(e) => beginNodeDrag(wall.id, i, e)}
                    >
                      <circle className="floor-wall-node-hit" cx={n.x} cy={n.y} r={0.32} />
                      <circle className="floor-wall-node" cx={n.x} cy={n.y} r={0.14} />
                    </g>
                  ))}
                </g>
              );
            })()}
          {editing?.kind === "zone" &&
            editing.id === selectedZoneId &&
            (() => {
              const zone = zones.find((z) => z.id === editing.id);
              if (!zone) return null;
              const pts = zone.points;
              return (
                <g key={`edit-zone-${zone.id}`}>
                  {pts.map((p, i) => {
                    const a = pts[i];
                    const b = pts[(i + 1) % pts.length];
                    const curve = zone.segments?.[i]?.curve ?? 0;
                    const mid = segMid(a, b, curve);
                    return (
                      <g key={`seg-${i}`}>
                        <path
                          className="floor-seg-add"
                          d={segmentPath(a, b, curve)}
                          onPointerDown={(e) => insertZoneNodeAt(zone.id, i, e)}
                        />
                        <circle
                          className="floor-node-add"
                          cx={mid.x}
                          cy={mid.y}
                          r={0.1}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
                  {pts.map((n, i) => (
                    <g
                      key={`znode-${i}`}
                      className="floor-zone-node-group"
                      onPointerDown={(e) => beginZoneNodeDrag(zone.id, i, e)}
                    >
                      <circle className="floor-zone-node-hit" cx={n.x} cy={n.y} r={0.32} />
                      <circle className="floor-zone-node" cx={n.x} cy={n.y} r={0.14} />
                    </g>
                  ))}
                </g>
              );
            })()}

          {wallDragStart && (
            <>
              <circle
                className="floor-draft-node"
                cx={wallDragStart.x}
                cy={wallDragStart.y}
                r={0.12}
              />
              {cursor && (
                <path
                  className="floor-wall-preview"
                  strokeWidth={0.14}
                  d={segmentPath(wallDragStart, cursor, previewCurve)}
                />
              )}
            </>
          )}
          {zonePoints.length > 0 && (
            <>
              {zonePoints.map((p, i) => (
                <circle key={`zp-${i}`} className="floor-draft-node" cx={p.x} cy={p.y} r={0.12} />
              ))}
              {cursor && (
                <path
                  className="floor-zone-preview"
                  d={`M ${zonePoints.map((p) => `${p.x} ${p.y}`).join(" L ")} L ${cursor.x} ${cursor.y}`}
                />
              )}
            </>
          )}
          {rectStart && rectEnd && (
            <rect
              className="floor-zone-preview"
              x={Math.min(rectStart.x, rectEnd.x)}
              y={Math.min(rectStart.y, rectEnd.y)}
              width={Math.abs(rectEnd.x - rectStart.x)}
              height={Math.abs(rectEnd.y - rectStart.y)}
            />
          )}

          {tables
            .filter(
              (table) =>
                table.position &&
                Number.isFinite(table.position.x) &&
                Number.isFinite(table.position.y),
            )
            .map((table) => {
              const width = table.width ?? (table.shape === "rectangle" ? 1.56 : 0.96);
              const depth = table.depth ?? (table.shape === "rectangle" ? 0.76 : 0.96);
              const tableColor = colorByTable?.[table.id];
              return (
                <g
                  key={table.id}
                  transform={`translate(${table.position.x} ${table.position.y}) rotate(${table.rotation})`}
                  className={`floor-table ${table.status} ${table.id === selectedTableId ? "selected" : ""} ${table.linked === false ? "unlinked" : ""}`}
                  onPointerDown={(event) => beginTableDrag(event, table.id)}
                >
                  <title>
                    {table.name}, {table.capacity} covers
                  </title>
                  {table.shape === "circle" ? (
                    <circle r={width / 2} style={tableColor ? { fill: tableColor } : undefined} />
                  ) : (
                    <rect
                      x={-width / 2}
                      y={-depth / 2}
                      width={width}
                      height={depth}
                      rx=".12"
                      style={tableColor ? { fill: tableColor } : undefined}
                    />
                  )}
                  <text
                    transform={`rotate(${-table.rotation})`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={0.42}
                  >
                    {table.capacity}
                  </text>
                </g>
              );
            })}

          {showSnap && cursor && (
            <circle className="floor-snap" cx={cursor.x} cy={cursor.y} r={0.1} />
          )}
        </g>
      </svg>
      <div className="floor-plan-scale">1 grid = {step} m</div>
      <div className="floor-zoom-controls">
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={resetView} aria-label="Reset view" title="Reset view">
          ⤢
        </button>
        <button type="button" onClick={fitView} aria-label="Fit view" title="Fit view to content">
          Fit
        </button>
      </div>
      {placingTable && (
        <div className="floor-tool-tip">
          Click the floor to place a{" "}
          {tool === "round-table" ? "round" : tool === "square-table" ? "square" : "rectangle"}{" "}
          table
        </div>
      )}
      {placingWall && (
        <div className="floor-tool-tip">Click to set the start · click again to place the end</div>
      )}
      {isPan && <div className="floor-tool-tip">Drag to pan the canvas · scroll to zoom</div>}
      {placingZoneRect && (
        <div className="floor-tool-tip">
          Click to set the first corner · double-click to place the opposite corner
        </div>
      )}
      {placingZonePoly && (
        <div className="floor-tool-tip">
          {zonePoints.length < 3
            ? "Click to outline the zone"
            : "Click to keep adding · double-click or click the first point to close"}
        </div>
      )}
    </div>
  );
}
