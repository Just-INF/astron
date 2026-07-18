import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DiningTable, FloorPlanTheme, FloorZone, WallGeometry } from "@/types";
import { apiRequest } from "@/lib/api/client";

interface HistoryEntry {
  tables: Record<string, DiningTable[]>;
  walls: Record<string, WallGeometry[]>;
  zones: Record<string, FloorZone[]>;
  key: string;
  t: number;
}

interface LayoutState {
  tables: Record<string, DiningTable[]>;
  walls: Record<string, WallGeometry[]>;
  zones: Record<string, FloorZone[]>;
  selectedTableId: string | null;
  selectedWallId: string | null;
  selectedZoneId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  floorPlanThemes: Record<string, FloorPlanTheme>;
  publishedFloorPlanThemes: Record<string, FloorPlanTheme>;
  layoutRevisions: Record<string, number>;
  layoutSaveError: string | null;
}
interface LayoutActions {
  addTable: (restaurantId: string, table: Omit<DiningTable, "id" | "restaurantId">) => void;
  updateTable: (
    restaurantId: string,
    tableId: string,
    patch: Partial<Omit<DiningTable, "id" | "restaurantId">>,
  ) => void;
  updateTablePosition: (
    restaurantId: string,
    tableId: string,
    x: number,
    y: number,
    rotation?: number,
  ) => void;
  deleteTable: (restaurantId: string, tableId: string) => void;
  regenerateCode: (restaurantId: string, tableId: string) => void;
  linkTable: (restaurantId: string, tableId: string) => void;
  unlinkTable: (restaurantId: string, tableId: string) => void;
  addWall: (restaurantId: string, wall: Omit<WallGeometry, "id" | "restaurantId">) => void;
  updateWall: (
    restaurantId: string,
    wallId: string,
    patch: Partial<Omit<WallGeometry, "id" | "restaurantId">>,
  ) => void;
  deleteWall: (restaurantId: string, wallId: string) => void;
  addZone: (restaurantId: string, zone: Omit<FloorZone, "id" | "restaurantId">) => void;
  updateZone: (
    restaurantId: string,
    zoneId: string,
    patch: Partial<Omit<FloorZone, "id" | "restaurantId">>,
  ) => void;
  deleteZone: (restaurantId: string, zoneId: string) => void;
  moveZoneNode: (
    restaurantId: string,
    zoneId: string,
    index: number,
    point: { x: number; y: number },
  ) => void;
  insertZoneNode: (
    restaurantId: string,
    zoneId: string,
    index: number,
    point: { x: number; y: number },
  ) => void;
  convertZoneToPolygon: (restaurantId: string, zoneId: string) => void;
  insertWallNode: (
    restaurantId: string,
    wallId: string,
    index: number,
    point: { x: number; y: number },
  ) => void;
  duplicateTable: (restaurantId: string, table: DiningTable) => string;
  duplicateWall: (restaurantId: string, wall: WallGeometry) => string;
  duplicateZone: (restaurantId: string, zone: FloorZone) => string;
  selectTable: (tableId: string | null) => void;
  selectWall: (wallId: string | null) => void;
  selectZone: (zoneId: string | null) => void;
  pushHistory: (key: string) => void;
  undo: () => void;
  redo: () => void;
  updateFloorPlanTheme: (restaurantId: string, patch: Partial<FloorPlanTheme>) => void;
  publishFloorPlanTheme: (restaurantId: string) => void;
}
export type LayoutStore = LayoutState & LayoutActions;

export function snapToGrid(value: number): number {
  return Math.round(value * 2) / 2;
}
export function defaultFloorPlanTheme(restaurantId: string): FloorPlanTheme {
  return {
    restaurantId,
    initialZoomPadding: 1.85,
    snapToGrid: true,
    labelMode: "capacity",
    defaultTableShape: "square",
    availableColor: "#9ee1c3",
    reservedColor: "#8aa9ff",
    occupiedColor: "#d77d86",
    isPublished: false,
    version: 0,
    updatedAt: new Date(0).toISOString(),
  };
}
function tableId(): string {
  return `table_${crypto.randomUUID()}`;
}
function wallId(): string {
  return `wall_${crypto.randomUUID()}`;
}
function zoneId(): string {
  return `zone_${crypto.randomUUID()}`;
}
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1500;

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => {
      // Records a snapshot of the current data so the next mutation can be undone.
      // Rapid mutations sharing the same key within COALESCE_MS collapse into one
      // undo step (e.g. a table drag fires many updates but undoes as a single move).
      const pushHistory = (key: string) => {
        set((state) => {
          const last = state.past[state.past.length - 1];
          const now = Date.now();
          if (last && last.key === key && now - last.t < COALESCE_MS) {
            return {
              past: state.past.slice(0, -1).concat({ ...last, t: now }),
            };
          }
          const entry: HistoryEntry = {
            tables: state.tables,
            walls: state.walls,
            zones: state.zones,
            key,
            t: now,
          };
          const past = [...state.past, entry];
          if (past.length > HISTORY_LIMIT) past.shift();
          return { past, future: [] };
        });
      };

      return {
        tables: {},
        walls: {},
        zones: {},
        selectedTableId: null,
        selectedWallId: null,
        selectedZoneId: null,
        past: [],
        future: [],
        floorPlanThemes: {},
        publishedFloorPlanThemes: {},
        layoutRevisions: {},
        layoutSaveError: null,
        addTable: (restaurantId, table) => {
          pushHistory("add-table");
          set((state) => ({
            tables: {
              ...state.tables,
              [restaurantId]: [
                ...(state.tables[restaurantId] ?? []),
                {
                  ...table,
                  id: tableId(),
                  restaurantId,
                  linked: table.linked ?? true,
                  code: table.code,
                  position: {
                    x: snapToGrid(table.position.x),
                    y: snapToGrid(table.position.y),
                    z: table.position.z,
                  },
                },
              ],
            },
          }));
        },
        updateTable: (restaurantId, tableIdToUpdate, patch) => {
          pushHistory("edit-table:" + tableIdToUpdate);
          set((state) => ({
            tables: {
              ...state.tables,
              [restaurantId]: (state.tables[restaurantId] ?? []).map((table) =>
                table.id === tableIdToUpdate ? { ...table, ...patch } : table,
              ),
            },
          }));
        },
        updateTablePosition: (restaurantId, tableIdToUpdate, x, y, rotation) => {
          pushHistory("move-table:" + tableIdToUpdate);
          set((state) => {
            const snap = state.floorPlanThemes[restaurantId]?.snapToGrid ?? true;
            return {
              tables: {
                ...state.tables,
                [restaurantId]: (state.tables[restaurantId] ?? []).map((table) =>
                  table.id === tableIdToUpdate
                    ? {
                        ...table,
                        position: {
                          ...table.position,
                          x: snap ? snapToGrid(x) : x,
                          y: snap ? snapToGrid(y) : y,
                        },
                        rotation: rotation ?? table.rotation,
                      }
                    : table,
                ),
              },
            };
          });
        },
        deleteTable: (restaurantId, tableIdToDelete) => {
          pushHistory("delete-table");
          set((state) => ({
            tables: {
              ...state.tables,
              [restaurantId]: (state.tables[restaurantId] ?? []).filter(
                (table) => table.id !== tableIdToDelete,
              ),
            },
            selectedTableId:
              state.selectedTableId === tableIdToDelete ? null : state.selectedTableId,
          }));
        },
        regenerateCode: (restaurantId, tableIdToUpdate) => {
          void apiRequest<DiningTable>(
            `/api/restaurants/${restaurantId}/tables/${tableIdToUpdate}/regenerate-code`,
            { method: "POST" },
          )
            .then((updated) =>
              set((state) => ({
                tables: {
                  ...state.tables,
                  [restaurantId]: (state.tables[restaurantId] ?? []).map((table) =>
                    table.id === tableIdToUpdate ? updated : table,
                  ),
                },
              })),
            )
            .catch((error) =>
              set({
                layoutSaveError:
                  error instanceof Error ? error.message : "Could not regenerate the table code.",
              }),
            );
        },
        linkTable: (restaurantId, tableIdToUpdate) => {
          set((state) => ({
            tables: {
              ...state.tables,
              [restaurantId]: (state.tables[restaurantId] ?? []).map((table) =>
                table.id === tableIdToUpdate
                  ? {
                      ...table,
                      linked: true,
                      code: table.code,
                    }
                  : table,
              ),
            },
          }));
        },
        unlinkTable: (restaurantId, tableIdToUpdate) => {
          set((state) => ({
            tables: {
              ...state.tables,
              [restaurantId]: (state.tables[restaurantId] ?? []).map((table) =>
                table.id === tableIdToUpdate ? { ...table, linked: false } : table,
              ),
            },
          }));
        },
        addWall: (restaurantId, wall) => {
          pushHistory("add-wall");
          set((state) => ({
            walls: {
              ...state.walls,
              [restaurantId]: [
                ...(state.walls[restaurantId] ?? []),
                { ...wall, id: wallId(), restaurantId },
              ],
            },
          }));
        },
        updateWall: (restaurantId, wallIdToUpdate, patch) => {
          pushHistory("edit-wall:" + wallIdToUpdate);
          set((state) => ({
            walls: {
              ...state.walls,
              [restaurantId]: (state.walls[restaurantId] ?? []).map((wall) =>
                wall.id === wallIdToUpdate ? { ...wall, ...patch } : wall,
              ),
            },
          }));
        },
        deleteWall: (restaurantId, wallIdToDelete) => {
          pushHistory("delete-wall");
          set((state) => ({
            walls: {
              ...state.walls,
              [restaurantId]: (state.walls[restaurantId] ?? []).filter(
                (wall) => wall.id !== wallIdToDelete,
              ),
            },
            selectedWallId: state.selectedWallId === wallIdToDelete ? null : state.selectedWallId,
          }));
        },
        addZone: (restaurantId, zone) => {
          const normalized =
            zone.shape === "polygon"
              ? {
                  ...zone,
                  segments:
                    zone.segments && zone.segments.length === zone.points.length
                      ? zone.segments
                      : zone.points.map(() => ({ curve: 0 })),
                }
              : zone;
          pushHistory("add-zone");
          set((state) => ({
            zones: {
              ...state.zones,
              [restaurantId]: [
                ...(state.zones[restaurantId] ?? []),
                { ...normalized, id: zoneId(), restaurantId },
              ],
            },
          }));
        },
        updateZone: (restaurantId, zoneIdToUpdate, patch) => {
          pushHistory("edit-zone:" + zoneIdToUpdate);
          set((state) => ({
            zones: {
              ...state.zones,
              [restaurantId]: (state.zones[restaurantId] ?? []).map((zone) =>
                zone.id === zoneIdToUpdate ? { ...zone, ...patch } : zone,
              ),
            },
          }));
        },
        deleteZone: (restaurantId, zoneIdToDelete) => {
          pushHistory("delete-zone");
          set((state) => ({
            zones: {
              ...state.zones,
              [restaurantId]: (state.zones[restaurantId] ?? []).filter(
                (zone) => zone.id !== zoneIdToDelete,
              ),
            },
            selectedZoneId: state.selectedZoneId === zoneIdToDelete ? null : state.selectedZoneId,
          }));
        },
        moveZoneNode: (restaurantId, zoneId, index, point) => {
          pushHistory("node-zone:" + zoneId);
          set((state) => ({
            zones: {
              ...state.zones,
              [restaurantId]: (state.zones[restaurantId] ?? []).map((z) =>
                z.id === zoneId
                  ? {
                      ...z,
                      points: z.points.map((p, i) => (i === index ? point : p)),
                    }
                  : z,
              ),
            },
          }));
        },
        insertZoneNode: (restaurantId, zoneId, index, point) => {
          pushHistory("ins-zone:" + zoneId);
          set((state) => ({
            zones: {
              ...state.zones,
              [restaurantId]: (state.zones[restaurantId] ?? []).map((z) => {
                if (z.id !== zoneId) return z;
                const segs = z.segments ?? z.points.map(() => ({ curve: 0 }));
                const c = segs[index]?.curve ?? 0;
                return {
                  ...z,
                  points: [...z.points.slice(0, index + 1), point, ...z.points.slice(index + 1)],
                  segments: [
                    ...segs.slice(0, index),
                    { curve: c / 2 },
                    { curve: c / 2 },
                    ...segs.slice(index + 1),
                  ],
                };
              }),
            },
          }));
        },
        convertZoneToPolygon: (restaurantId, zoneId) => {
          pushHistory("conv-zone:" + zoneId);
          set((state) => ({
            zones: {
              ...state.zones,
              [restaurantId]: (state.zones[restaurantId] ?? []).map((z) => {
                if (z.id !== zoneId || z.shape !== "rectangle") return z;
                const [a, b] = z.points;
                const x1 = Math.min(a.x, b.x),
                  x2 = Math.max(a.x, b.x);
                const y1 = Math.min(a.y, b.y),
                  y2 = Math.max(a.y, b.y);
                return {
                  ...z,
                  shape: "polygon",
                  points: [
                    { x: x1, y: y1 },
                    { x: x2, y: y1 },
                    { x: x2, y: y2 },
                    { x: x1, y: y2 },
                  ],
                  segments: [{ curve: 0 }, { curve: 0 }, { curve: 0 }, { curve: 0 }],
                };
              }),
            },
          }));
        },
        insertWallNode: (restaurantId, wallId, index, point) => {
          pushHistory("ins-wall:" + wallId);
          set((state) => ({
            walls: {
              ...state.walls,
              [restaurantId]: (state.walls[restaurantId] ?? []).map((w) => {
                if (w.id !== wallId) return w;
                const c = w.segments[index]?.curve ?? 0;
                return {
                  ...w,
                  nodes: [...w.nodes.slice(0, index + 1), point, ...w.nodes.slice(index + 1)],
                  segments: [
                    ...w.segments.slice(0, index),
                    { curve: c / 2 },
                    { curve: c / 2 },
                    ...w.segments.slice(index + 1),
                  ],
                };
              }),
            },
          }));
        },
        duplicateTable: (restaurantId, table) => {
          pushHistory("dup-table");
          const id = tableId();
          set((state) => ({
            tables: {
              ...state.tables,
              [restaurantId]: [
                ...(state.tables[restaurantId] ?? []),
                {
                  ...table,
                  id,
                  restaurantId,
                  code: undefined,
                  name: `${table.name} copy`,
                  position: {
                    ...table.position,
                    x: table.position.x + 0.5,
                    y: table.position.y + 0.5,
                  },
                },
              ],
            },
          }));
          return id;
        },
        duplicateWall: (restaurantId, wall) => {
          pushHistory("dup-wall");
          const id = wallId();
          const offset = 0.5;
          set((state) => ({
            walls: {
              ...state.walls,
              [restaurantId]: [
                ...(state.walls[restaurantId] ?? []),
                {
                  ...wall,
                  id,
                  restaurantId,
                  nodes: wall.nodes.map((n) => ({
                    x: n.x + offset,
                    y: n.y + offset,
                  })),
                },
              ],
            },
          }));
          return id;
        },
        duplicateZone: (restaurantId, zone) => {
          pushHistory("dup-zone");
          const id = zoneId();
          const offset = 0.5;
          set((state) => ({
            zones: {
              ...state.zones,
              [restaurantId]: [
                ...(state.zones[restaurantId] ?? []),
                {
                  ...zone,
                  id,
                  restaurantId,
                  name: `${zone.name} copy`,
                  points: zone.points.map((p) => ({
                    x: p.x + offset,
                    y: p.y + offset,
                  })),
                  segments: zone.segments ? zone.segments.map((s) => ({ ...s })) : undefined,
                },
              ],
            },
          }));
          return id;
        },
        selectTable: (selectedTableId) => set({ selectedTableId }),
        selectWall: (selectedWallId) => set({ selectedWallId }),
        selectZone: (selectedZoneId) => set({ selectedZoneId }),
        pushHistory,
        undo: () =>
          set((state) => {
            if (state.past.length === 0) return {};
            const past = state.past.slice();
            const entry = past.pop()!;
            const current: HistoryEntry = {
              tables: state.tables,
              walls: state.walls,
              zones: state.zones,
              key: "undo",
              t: Date.now(),
            };
            const future = [current, ...state.future];
            return {
              tables: entry.tables,
              walls: entry.walls,
              zones: entry.zones,
              past,
              future,
            };
          }),
        redo: () =>
          set((state) => {
            if (state.future.length === 0) return {};
            const future = state.future.slice();
            const entry = future.shift()!;
            const current: HistoryEntry = {
              tables: state.tables,
              walls: state.walls,
              zones: state.zones,
              key: "redo",
              t: Date.now(),
            };
            const past = [...state.past, current];
            if (past.length > HISTORY_LIMIT) past.shift();
            return {
              tables: entry.tables,
              walls: entry.walls,
              zones: entry.zones,
              past,
              future,
            };
          }),
        updateFloorPlanTheme: (restaurantId, patch) => {
          set((state) => ({
            floorPlanThemes: {
              ...state.floorPlanThemes,
              [restaurantId]: {
                ...(state.floorPlanThemes[restaurantId] ?? defaultFloorPlanTheme(restaurantId)),
                ...patch,
                updatedAt: new Date().toISOString(),
              },
            },
          }));
          void apiRequest(`/api/restaurants/${restaurantId}/floor-plan-theme/draft`, {
            method: "PATCH",
            body: JSON.stringify({ patch }),
          }).catch((error) =>
            set({
              layoutSaveError:
                error instanceof Error ? error.message : "Could not save the floor-plan theme.",
            }),
          );
        },
        publishFloorPlanTheme: (restaurantId) => {
          set((state) => {
            const current =
              state.floorPlanThemes[restaurantId] ?? defaultFloorPlanTheme(restaurantId);
            const next = {
              ...current,
              isPublished: true,
              version: current.version + 1,
              updatedAt: new Date().toISOString(),
            };
            return {
              floorPlanThemes: {
                ...state.floorPlanThemes,
                [restaurantId]: next,
              },
              publishedFloorPlanThemes: {
                ...state.publishedFloorPlanThemes,
                [restaurantId]: next,
              },
            };
          });
          void apiRequest<FloorPlanTheme>(
            `/api/restaurants/${restaurantId}/floor-plan-theme/publish`,
            { method: "POST" },
          ).then((theme) =>
            set((state) => ({
              floorPlanThemes: {
                ...state.floorPlanThemes,
                [restaurantId]: theme,
              },
              publishedFloorPlanThemes: {
                ...state.publishedFloorPlanThemes,
                [restaurantId]: theme,
              },
            })),
          );
        },
      };
    },
    {
      name: "astron_layouts",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedTableId: state.selectedTableId,
        selectedWallId: state.selectedWallId,
        selectedZoneId: state.selectedZoneId,
      }),
      migrate: () => ({
        tables: {},
        walls: {},
        zones: {},
        selectedTableId: null,
        selectedWallId: null,
        selectedZoneId: null,
        floorPlanThemes: {},
        publishedFloorPlanThemes: {},
        layoutRevisions: {},
        layoutSaveError: null,
      }),
    },
  ),
);
