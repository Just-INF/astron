import { FloorPlan2D } from "@/components/canvas/FloorPlan2D";
import type { DiningTable, FloorZone, WallGeometry } from "@/types";

interface FloorPlan2DViewProps {
  tables: DiningTable[];
  walls: WallGeometry[];
  zones: FloorZone[];
  selectedTableId: string | null;
  onSelect: (id: string) => void;
  colorByTable?: Record<string, string>;
}

/**
 * Read-only 2D floor-plan view for the Reservations studio. Wraps the full
 * FloorPlan2D editor component with all editing callbacks disabled so guests
 * (and staff) can only inspect and click-select tables.
 */
export function FloorPlan2DView({
  tables,
  walls,
  zones,
  selectedTableId,
  onSelect,
  colorByTable,
}: FloorPlan2DViewProps) {
  return (
    <FloorPlan2D
      tables={tables}
      walls={walls}
      zones={zones}
      selectedTableId={selectedTableId}
      selectedWallId={null}
      selectedZoneId={null}
      tool="select"
      curveSegments={false}
      onSelectTable={(id) => {
        if (id) onSelect(id);
      }}
      onSelectWall={() => {}}
      onSelectZone={() => {}}
      onMoveTable={() => {}}
      onTranslateZone={() => {}}
      onCreateTable={() => {}}
      onCreateWall={() => {}}
      onCreateZone={() => {}}
      colorByTable={colorByTable}
    />
  );
}
