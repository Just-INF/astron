import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { DiningTable, FloorPlanLabelMode, FloorZone, WallGeometry } from "@/types";
import { snapToGrid } from "@/stores/useLayoutStore";

interface CanvasProps {
  tables: DiningTable[];
  walls: WallGeometry[];
  zones: FloorZone[];
  selectedTableId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  allowDrag: boolean;
  colorByTable?: Record<string, string>;
  initialZoomPadding?: number;
  labelMode?: FloorPlanLabelMode;
  statusColors?: Partial<Record<"available" | "reserved" | "occupied", string>>;
  gridDensity?: number;
}

function quadPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  curve: number,
  t: number,
) {
  const midX = (a.x + b.x) / 2,
    midY = (a.y + b.y) / 2;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = midX + (-dy / len) * curve;
  const cy = midY + (dx / len) * curve;
  const mt = 1 - t;
  return {
    x: mt * mt * a.x + 2 * mt * t * cx + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * cy + t * t * b.y,
  };
}
function Segment({
  a,
  b,
  thickness,
  height,
}: {
  a: { x: number; y: number };
  b: { x: number; y: number };
  thickness: number;
  height: number;
}) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const angle = -Math.atan2(dy, dx);
  return (
    <mesh
      position={[(a.x + b.x) / 2, height / 2, (a.y + b.y) / 2]}
      rotation={[0, angle, 0]}
      castShadow
    >
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial color="#23304a" roughness={0.82} />
    </mesh>
  );
}
function Wall({ wall }: { wall: WallGeometry }) {
  const segCount = wall.closed ? wall.nodes.length : wall.nodes.length - 1;
  const meshes = [];
  for (let i = 0; i < segCount; i++) {
    const a = wall.nodes[i];
    const b = wall.nodes[(i + 1) % wall.nodes.length];
    const curve = wall.segments[i]?.curve ?? 0;
    if (!curve) {
      meshes.push(<Segment key={i} a={a} b={b} thickness={wall.thickness} height={wall.height} />);
    } else {
      const samples = 8;
      let prev = a;
      for (let s = 1; s <= samples; s++) {
        const pt = quadPoint(a, b, curve, s / samples);
        meshes.push(
          <Segment
            key={`${i}-${s}`}
            a={prev}
            b={pt}
            thickness={wall.thickness}
            height={wall.height}
          />,
        );
        prev = pt;
      }
    }
  }
  return <>{meshes}</>;
}

function makeTextTexture(text: string, color: string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontPx = 120;
  ctx.font = `300 ${fontPx}px "Geist Variable", ui-sans-serif, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const pad = fontPx * 0.35;
  const w = Math.max(2, Math.ceil(metrics.width + pad * 2));
  const h = Math.ceil(fontPx * 1.4);
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!;
  c.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = fontPx * 0.1;
  c.strokeStyle = "rgba(4,10,20,0.9)";
  c.strokeText(text, w / 2, h / 2);
  c.fillStyle = color;
  c.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { tex, aspect: w / h };
}

function zoneBounds(zone: FloorZone) {
  let pts = zone.points;
  if (zone.shape === "rectangle" && pts.length === 2) {
    const [a, b] = pts;
    pts = [
      { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
      { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
      { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
      { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
    ];
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function ZoneMesh({ zone }: { zone: FloorZone }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    let pts = zone.points;
    if (zone.shape === "rectangle" && pts.length === 2) {
      const [a, b] = pts;
      pts = [
        { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
        { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
        { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
      ];
    }
    if (pts.length === 0) return s;
    s.moveTo(pts[0].x, pts[0].y);
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
        s.quadraticCurveTo(cx, cy, b.x, b.y);
      } else {
        s.lineTo(b.x, b.y);
      }
    }
    s.closePath();
    return s;
  }, [zone]);
  return (
    <>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial
          color={zone.color}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <ZoneLabel zone={zone} />
    </>
  );
}

function ZoneLabel({ zone }: { zone: FloorZone }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    document.fonts
      .load(`300 120px "Geist Variable"`)
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const { tex, aspect } = useMemo(() => {
    void ready;
    return makeTextTexture(zone.name, "#ffffff");
  }, [zone.name, ready]);
  useEffect(() => () => tex.dispose(), [tex]);
  const b = zoneBounds(zone);
  const labelW = Math.max(1.5, Math.min(7, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.8));
  const labelH = labelW / aspect;
  return (
    <mesh position={[b.cx, 0.03, b.cy]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[labelW, labelH]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function TableLabel({
  table,
  labelMode = "capacity",
}: {
  table: DiningTable;
  labelMode?: FloorPlanLabelMode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    document.fonts
      .load(`300 120px "Geist Variable"`)
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const text =
    labelMode === "name"
      ? table.name
      : labelMode === "both"
        ? `${table.name} · ${table.capacity}`
        : String(table.capacity);
  const { tex, aspect } = useMemo(() => {
    void ready;
    return makeTextTexture(text, "#0a1120");
  }, [text, ready]);
  useEffect(() => () => tex.dispose(), [tex]);
  const w = 0.9,
    h = w / aspect;
  return (
    <mesh position={[table.position.x, 0.46, table.position.y]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function TableMesh({
  table,
  selected,
  onSelect,
  onMove,
  allowDrag,
  onDragStateChange,
  colorByTable,
  labelMode,
  statusColors,
}: {
  table: DiningTable;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  allowDrag: boolean;
  onDragStateChange?: (dragging: boolean) => void;
  colorByTable?: Record<string, string>;
  labelMode?: FloorPlanLabelMode;
  statusColors?: Partial<Record<"available" | "reserved" | "occupied", string>>;
}) {
  const group = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const baseColor =
    table.linked === false
      ? "#56524b"
      : (statusColors?.[table.status] ??
        (table.status === "occupied"
          ? "#d77d86"
          : table.status === "reserved"
            ? "#8aa9ff"
            : "#9ee1c3"));
  const color = colorByTable?.[table.id] ?? baseColor;
  function startDrag(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    onSelect(table.id);
    if (allowDrag) {
      dragging.current = true;
      onDragStateChange?.(true);
    }
  }
  function drag(event: ThreeEvent<PointerEvent>) {
    if (!dragging.current || !group.current) return;
    event.stopPropagation();
    group.current.position.x = snapToGrid(event.point.x);
    group.current.position.z = snapToGrid(event.point.z);
  }
  function finishDrag() {
    if (!dragging.current || !group.current) return;
    dragging.current = false;
    onDragStateChange?.(false);
    onMove(table.id, group.current.position.x, group.current.position.z);
  }
  const geometry =
    table.shape === "circle" ? (
      <cylinderGeometry args={[0.58, 0.58, 0.24, 24]} />
    ) : table.shape === "rectangle" ? (
      <boxGeometry args={[1.45, 0.24, 0.72]} />
    ) : (
      <boxGeometry args={[0.85, 0.24, 0.85]} />
    );
  return (
    <>
      <group
        ref={group}
        position={[table.position.x, 0.3, table.position.y]}
        rotation={[0, (-table.rotation * Math.PI) / 180, 0]}
      >
        <mesh
          castShadow
          receiveShadow
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={finishDrag}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onSelect(table.id);
          }}
        >
          {geometry}
          <meshStandardMaterial color={color} roughness={0.48} metalness={0.12} />
        </mesh>
        {selected && (
          <mesh position={[0, -0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.76, 0.83, 32]} />
            <meshBasicMaterial color="#d7e2ff" />
          </mesh>
        )}
      </group>
      <TableLabel table={table} labelMode={labelMode} />
    </>
  );
}

function useContentBounds(tables: DiningTable[], walls: WallGeometry[], zones: FloorZone[]) {
  return useMemo(() => {
    const pts: [number, number][] = [
      ...tables.map((t) => [t.position.x, t.position.y] as [number, number]),
      ...walls.flatMap((w) => w.nodes.map((n) => [n.x, n.y] as [number, number])),
      ...zones.flatMap((z) => {
        let p = z.points;
        if (z.shape === "rectangle" && p.length === 2) {
          const [a, b] = p;
          p = [
            { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
            { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
            { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
            { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
          ];
        }
        return p.map((q) => [q.x, q.y] as [number, number]);
      }),
    ];
    if (pts.length === 0)
      return {
        center: [0, 0] as [number, number],
        size: [12, 12] as [number, number],
      };
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [x, z] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const w = Math.max(maxX - minX, 1),
      h = Math.max(maxZ - minZ, 1);
    return {
      center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number],
      size: [w, h] as [number, number],
    };
  }, [tables, walls, zones]);
}

const MIN_ZOOM = 10;
const MAX_ZOOM = 160;

function CameraControls({
  bounds,
  selectedTableId,
  controlsRef,
  initialZoomPadding = 1.3,
}: {
  bounds: { center: [number, number]; size: [number, number] };
  selectedTableId: string | null;
  controlsRef: { current: ComponentRef<typeof OrbitControls> | null };
  initialZoomPadding?: number;
}) {
  const { camera, size } = useThree();
  const didFit = useRef(false);
  // Three.js cameras are intentionally mutable scene objects.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (didFit.current || size.width === 0 || size.height === 0) return;
    const {
      center,
      size: [w, h],
    } = bounds;
    const pad = initialZoomPadding;
    const zoom = Math.min(size.height / (h * pad), size.width / (w * pad));
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    const cam = camera as THREE.OrthographicCamera;
    // eslint-disable-next-line react-hooks/immutability
    cam.zoom = z;
    cam.position.set(center[0] + 9, 11, center[1] + 10);
    cam.updateProjectionMatrix();
    const c = controlsRef.current;
    if (c) {
      c.target.set(center[0], 0, center[1]);
      c.update();
    }
    didFit.current = true;
  }, [bounds, size, camera, controlsRef, initialZoomPadding]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const c = controlsRef.current;
      if (!c) return;
      const step = e.shiftKey ? 1.5 : 0.6;
      const k = e.key.toLowerCase();
      let dx = 0,
        dz = 0;
      if (k === "arrowup" || k === "w") dz = -step;
      else if (k === "arrowdown" || k === "s") dz = step;
      else if (k === "arrowleft" || k === "a") dx = -step;
      else if (k === "arrowright" || k === "d") dx = step;
      else return;
      // When a table is selected, arrow keys move the table (handled by the 2D
      // shortcut layer); only WASD pans the camera in that case.
      if (
        selectedTableId &&
        (k === "arrowup" || k === "arrowdown" || k === "arrowleft" || k === "arrowright")
      )
        return;
      e.preventDefault();
      c.target.x += dx;
      c.target.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
      c.update();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controlsRef, camera, selectedTableId]);

  return null;
}

function Scene({
  tables,
  walls,
  zones,
  selectedTableId,
  onSelect,
  onMove,
  allowDrag,
  colorByTable,
  initialZoomPadding,
  labelMode,
  statusColors,
  gridDensity,
}: CanvasProps) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const bounds = useContentBounds(tables, walls, zones);
  const groundSize = Math.max(24, Math.ceil(Math.max(bounds.size[0], bounds.size[1]) * 1.5));
  const divisions = Math.min(200, Math.round(groundSize * (gridDensity ?? 2)));
  const setDrag = (dragging: boolean) => {
    if (controlsRef.current) controlsRef.current.enabled = !dragging;
  };
  useEffect(() => {
    const up = () => setDrag(false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  return (
    <>
      <color attach="background" args={["#080e1a"]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[5, 8, 4]} intensity={1.55} color="#dbe5ff" castShadow />
      <gridHelper
        args={[groundSize, divisions, "#34466f", "#172237"]}
        position={[bounds.center[0], 0.01, bounds.center[1]]}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[bounds.center[0], 0, bounds.center[1]]}
        receiveShadow
      >
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color="#0a1120" roughness={1} />
      </mesh>
      {zones.map((zone) => (
        <ZoneMesh key={zone.id} zone={zone} />
      ))}
      {walls.map((wall) => (
        <Wall key={wall.id} wall={wall} />
      ))}
      {tables.map((table) => (
        <TableMesh
          key={table.id}
          table={table}
          selected={table.id === selectedTableId}
          onSelect={onSelect}
          onMove={onMove}
          allowDrag={allowDrag}
          onDragStateChange={setDrag}
          colorByTable={colorByTable}
          labelMode={labelMode}
          statusColors={statusColors}
        />
      ))}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableRotate={false}
        enablePan
        enableZoom
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        target={[bounds.center[0], 0, bounds.center[1]]}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
      <CameraControls
        bounds={bounds}
        selectedTableId={selectedTableId}
        controlsRef={controlsRef}
        initialZoomPadding={initialZoomPadding}
      />
    </>
  );
}

export function TableFloorCanvas(props: CanvasProps) {
  return (
    <Canvas shadows orthographic camera={{ position: [9, 11, 10], zoom: 48, near: 0.1, far: 500 }}>
      <Scene {...props} />
    </Canvas>
  );
}
