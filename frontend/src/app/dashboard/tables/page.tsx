import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  Copy,
  Download,
  MapPin,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { DashboardPanel } from "@/components/dashboard/EmptyState";
import ReservationsStudio from "@/components/dashboard/ReservationsStudio";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { api } from "@/lib/api/client";
import type { DiningTable, ServiceRequest, TableShape, TableStatus } from "@/types";

const EMPTY: DiningTable[] = [];

export default function TablesPage() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const restaurantId = currentUser?.activeRestaurantId ?? "";
  const tables = useLayoutStore((s) => s.tables[restaurantId] ?? EMPTY);
  const visibleTables = tables.filter((t) => t.linked !== false);
  const unlinkedCount = tables.filter((t) => t.linked === false).length;
  const addTable = useLayoutStore((s) => s.addTable);
  const updateTable = useLayoutStore((s) => s.updateTable);
  const deleteTable = useLayoutStore((s) => s.deleteTable);
  const regenerateCode = useLayoutStore((s) => s.regenerateCode);
  const selectTable = useLayoutStore((s) => s.selectTable);
  const navigate = useNavigate();
  const role = currentUser?.memberships.find(
    (membership) => membership.restaurantId === restaurantId,
  )?.role;
  const canManageOrders = ["owner", "manager", "host", "waiter"].includes(role ?? "");
  const serviceRequests = useQuery({
    queryKey: ["operations", restaurantId, "requests", false],
    queryFn: () => api.serviceRequests(restaurantId, "active"),
    enabled: Boolean(restaurantId && canManageOrders),
  });

  const [creating, setCreating] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [activeTab, setActiveTab] = useState<"tables" | "reservations">("tables");
  const [form, setForm] = useState<{
    name: string;
    capacity: number;
    shape: TableShape;
    status: TableStatus;
  }>({
    name: "",
    capacity: 2,
    shape: "square",
    status: "available",
  });

  // Backfill an 8-digit code for any table created before codes existed.
  useEffect(() => {
    tables.forEach((t) => {
      if (!t.code && t.linked !== false) regenerateCode(restaurantId, t.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  function openCreate() {
    setEditingTable(null);
    setForm({ name: "", capacity: 2, shape: "square", status: "available" });
    setCreating(true);
  }

  function openEdit(table: DiningTable) {
    setCreating(false);
    setEditingTable(table);
    setForm({
      name: table.name,
      capacity: table.capacity,
      shape: table.shape,
      status: table.status,
    });
  }

  function closeTableDialog() {
    setCreating(false);
    setEditingTable(null);
  }

  function handleSave() {
    const name = form.name.trim() || `Table ${tables.length + 1}`;
    if (editingTable) {
      const shapeChanged = editingTable.shape !== form.shape;
      updateTable(restaurantId, editingTable.id, {
        name,
        capacity: form.capacity,
        shape: form.shape,
        status: form.status,
        ...(shapeChanged
          ? {
              width: form.shape === "rectangle" ? 1.56 : 0.96,
              depth: form.shape === "rectangle" ? 0.76 : 0.96,
            }
          : {}),
      });
      closeTableDialog();
      return;
    }
    const index = tables.length;
    const x = (index % 4) * 1.6 - 2.4;
    const y = Math.floor(index / 4) * 1.6 - 1.6;
    addTable(restaurantId, {
      name,
      capacity: form.capacity,
      shape: form.shape,
      position: { x, y, z: 0 },
      rotation: 0,
      status: form.status,
      width: form.shape === "rectangle" ? 1.56 : 0.96,
      depth: form.shape === "rectangle" ? 0.76 : 0.96,
    });
    closeTableDialog();
  }

  function openInFloorPlan(id: string) {
    selectTable(id);
    navigate("/dashboard/layout-editor");
  }

  return (
    <DashboardPanel>
      <div className="tables-page-head">
        <header className="tables-page-header">
          {activeTab === "tables" ? (
            <div>
              <p className="eyebrow">Restaurant operations</p>
              <h1>Tables</h1>
              <p className="tables-page-sub">
                Create and manage every table. Each one gets a scannable QR that opens its menu.
              </p>
            </div>
          ) : (
            <div>
              <p className="eyebrow">Table operations</p>
              <h1>Reservations</h1>
              <p className="tables-page-sub">
                Hold tables for guests and see live availability across the floor plan.
              </p>
            </div>
          )}
        </header>
        <div className="menu-tabs" role="tablist">
          <button
            type="button"
            className={activeTab === "tables" ? "active" : ""}
            onClick={() => setActiveTab("tables")}
            role="tab"
          >
            Tables
          </button>
          <button
            type="button"
            className={activeTab === "reservations" ? "active" : ""}
            onClick={() => setActiveTab("reservations")}
            role="tab"
          >
            Reservations
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "tables" ? (
          <motion.div
            key="tables"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {unlinkedCount > 0 && (
              <p className="tables-link-note">
                {unlinkedCount} table{unlinkedCount > 1 ? "s" : ""} on the floor plan{" "}
                {unlinkedCount > 1 ? "aren't" : "isn't"} linked yet — select it in the editor and
                press “Link”.
              </p>
            )}
            {visibleTables.length === 0 ? (
              <section className="tables-empty">
                <span className="tables-empty-mark">
                  <Utensils size={22} />
                </span>
                <h2>No tables yet</h2>
                <p>Create your first table, then arrange it on the floor plan.</p>
                <button className="button button-primary" type="button" onClick={openCreate}>
                  <Plus size={15} /> Create your first table
                </button>
              </section>
            ) : (
              <div className="tables-grid">
                <button type="button" className="table-card table-add-card" onClick={openCreate}>
                  <span className="table-add-mark">
                    <Plus size={20} />
                  </span>
                  <b>New table</b>
                  <small>Add a table and print its QR</small>
                </button>
                {visibleTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    origin={origin}
                    restaurantId={restaurantId}
                    onRegenerate={() => regenerateCode(restaurantId, table.id)}
                    onDelete={() => deleteTable(restaurantId, table.id)}
                    onEdit={() => openEdit(table)}
                    requests={(serviceRequests.data ?? []).filter(
                      (request) => request.tableId === table.id,
                    )}
                    onOrders={
                      canManageOrders
                        ? () =>
                            navigate(`/dashboard/orders?tableId=${encodeURIComponent(table.id)}`)
                        : undefined
                    }
                    onOpen={() => openInFloorPlan(table.id)}
                  />
                ))}
              </div>
            )}

            {(creating || editingTable) && (
              <div className="modal-overlay" onClick={closeTableDialog}>
                <div
                  className="modal-card"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                >
                  <div className="modal-header">
                    <h2>{editingTable ? "Edit table" : "New table"}</h2>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={closeTableDialog}
                      aria-label="Close"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="modal-body">
                    <label>
                      <span>Name</span>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder={editingTable?.name ?? `Table ${tables.length + 1}`}
                        autoFocus
                      />
                    </label>
                    <label>
                      <span>Covers</span>
                      <input
                        type="number"
                        min={1}
                        value={form.capacity}
                        onChange={(e) =>
                          setForm({ ...form, capacity: Math.max(1, Number(e.target.value)) })
                        }
                      />
                    </label>
                    <label>
                      <span>Shape</span>
                      <select
                        value={form.shape}
                        onChange={(e) => setForm({ ...form, shape: e.target.value as TableShape })}
                      >
                        <option value="circle">Round</option>
                        <option value="square">Square</option>
                        <option value="rectangle">Rectangle</option>
                      </select>
                    </label>
                    <label>
                      <span>Service state</span>
                      <select
                        value={form.status}
                        onChange={(e) =>
                          setForm({ ...form, status: e.target.value as TableStatus })
                        }
                      >
                        <option value="available">Available</option>
                        <option value="reserved">Reserved</option>
                        <option value="occupied">Occupied</option>
                      </select>
                    </label>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="button" onClick={closeTableDialog}>
                      Cancel
                    </button>
                    <button type="button" className="button button-primary" onClick={handleSave}>
                      {editingTable ? "Save changes" : "Create table"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="reservations"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ReservationsStudio />
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardPanel>
  );
}

function TableCard({
  table,
  origin,
  restaurantId,
  onRegenerate,
  onDelete,
  onEdit,
  onOrders,
  requests,
  onOpen,
}: {
  table: DiningTable;
  origin: string;
  restaurantId: string;
  onRegenerate: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOrders?: () => void;
  requests: ServiceRequest[];
  onOpen: () => void;
}) {
  const url = `${origin}/menu/${restaurantId}/${table.code ?? table.id}`;
  const [copied, setCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { width: 184, margin: 1, color: { dark: "#0a1120", light: "#ffffff" } })
      .then((dataUrl) => {
        if (active) setQrSrc(dataUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function downloadQr() {
    if (!qrSrc) return;
    const a = document.createElement("a");
    a.href = qrSrc;
    a.download = `table-${table.code ?? table.id}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <article className="table-card">
      <div className="table-card-head">
        <div>
          <h3>{table.name}</h3>
          <p className="table-card-meta">
            {table.capacity} covers ·{" "}
            <span className={`table-status status-${table.status}`}>{table.status}</span>
          </p>
        </div>
        <div className="table-card-head-actions">
          <button
            className="icon-btn"
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${table.name}`}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-btn danger"
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${table.name}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="table-card-qr">
        {qrSrc ? (
          <img src={qrSrc} alt="Table QR code" className="table-qr-img" />
        ) : (
          <div className="table-qr-skeleton" />
        )}
        <code className="table-code">{table.code ?? "—"}</code>
      </div>

      {requests.length > 0 && (
        <div className="table-card-requests">
          <BellRing size={13} />
          <span>
            {requests.length} active request{requests.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      <div className="table-card-actions">
        {onOrders && (
          <button type="button" onClick={onOrders} title="Create or view table order">
            <ReceiptText size={14} /> Order
          </button>
        )}
        <button type="button" onClick={onRegenerate} title="Regenerate QR code">
          <RefreshCw size={14} /> Regenerate
        </button>
        <button
          type="button"
          className={copied ? "is-copied" : ""}
          onClick={copyLink}
          title="Copy menu link"
        >
          {copied ? (
            "Copied!"
          ) : (
            <>
              <Copy size={14} /> Send link
            </>
          )}
        </button>
        <button type="button" onClick={downloadQr} title="Download QR code">
          <Download size={14} /> Download
        </button>
        <button type="button" onClick={onOpen} title="Open in floor plan">
          <MapPin size={14} /> Floor plan
        </button>
      </div>
    </article>
  );
}
