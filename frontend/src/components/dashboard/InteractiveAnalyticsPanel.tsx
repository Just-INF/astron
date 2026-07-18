import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, ReceiptText, TrendingUp, UtensilsCrossed, X } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import {
  peakDays,
  peakTimes,
  replaceAnalyticsData,
  type BarPoint,
  type RevenuePoint,
} from "@/lib/analyticsData";
import { formatCurrency } from "@/lib/currency";
import { addDaysToDateKey, formatDateKey, restaurantDateKey } from "@/lib/regional";
import { useAuthStore } from "@/stores/useAuthStore";
import { apiRequest } from "@/lib/api/client";

const blue = "#8aa9ff";
const mint = "#9ee1c3";
const grid = "rgba(207,217,240,.1)";
type Metric = "revenue" | "orders" | "plates" | "categories" | "hours" | "tables" | "tax";

function useRestaurantMoney() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurants = useAuthStore((state) => state.restaurants);
  const restaurant = restaurants.find((item) => item.id === currentUser?.activeRestaurantId);
  return (value: number) => formatCurrency(value, restaurant?.currency, restaurant?.language);
}
function CurrencyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number;
    payload?: { label?: string; name?: string };
  }>;
}) {
  const money = useRestaurantMoney();
  if (!active || !payload?.[0]) return null;
  const point = payload[0];
  return (
    <div className="chart-tooltip">
      <b>{point.payload?.label ?? point.payload?.name}</b>
      <span>{money(Number(point.value ?? 0))}</span>
    </div>
  );
}

export function InteractiveAnalyticsPanel() {
  const [range, setRange] = useState<7 | 30>(30);
  const [detail, setDetail] = useState<Metric | null>(null);
  const restaurantId = useAuthStore((state) => state.currentUser?.activeRestaurantId);
  const timezone = useAuthStore(
    (state) =>
      state.restaurants.find(
        (restaurant) => restaurant.id === state.currentUser?.activeRestaurantId,
      )?.timezone ?? "UTC",
  );
  const analytics = useQuery({
    queryKey: ["analytics", restaurantId, range, timezone],
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const to = restaurantDateKey(timezone),
        from = addDaysToDateKey(to, -(range - 1)),
        base = `/api/restaurants/${restaurantId}/analytics`,
        query = `from=${from}&to=${to}`;
      const [revenue, products, categories, tables, hours, taxes] = await Promise.all([
        apiRequest<Array<{ bucket: string; orders: number; revenue_minor: number }>>(
          `${base}/revenue?${query}&interval=day`,
        ),
        apiRequest<Array<{ name: string; quantity: number }>>(`${base}/products?${query}`),
        apiRequest<Array<{ name: string; revenue_minor: number }>>(`${base}/categories?${query}`),
        apiRequest<Array<{ name: string; revenue_minor: number; orders: number }>>(
          `${base}/tables?${query}`,
        ),
        apiRequest<Array<{ weekday: number; hour: number; orders: number }>>(
          `${base}/peak-hours?${query}`,
        ),
        apiRequest<Array<{ tax_rate_basis_points: number; tax_minor: number }>>(
          `${base}/taxes?${query}`,
        ),
      ]);
      const result = {
        revenue: revenue.map((point) => ({
          date: point.bucket.slice(0, 10),
          label: formatDateKey(point.bucket.slice(0, 10), "en-GB", {
            day: "numeric",
            month: "short",
          }),
          revenue: point.revenue_minor / 100,
          orders: point.orders,
        })),
        products: products.map((point) => ({
          name: point.name,
          value: point.quantity,
        })),
        categories: categories.map((point) => ({
          name: point.name,
          value: point.revenue_minor / 100,
        })),
        tables: tables.map((point) => ({
          name: point.name,
          value: point.revenue_minor / 100,
          secondary: point.orders,
        })),
        hours,
        taxes: taxes.map((point) => ({
          name: `${point.tax_rate_basis_points / 100}%`,
          value: point.tax_minor / 100,
        })),
      };
      replaceAnalyticsData(result);
      return result;
    },
  });
  const points = (analytics.data?.revenue ?? []).slice(-range);
  const productVelocity = analytics.data?.products ?? [];
  const categoryPerformance = analytics.data?.categories ?? [];
  const tablePerformance = analytics.data?.tables ?? [];
  const taxBreakdown = analytics.data?.taxes ?? [];
  const peakHours = useMemo(() => {
    const hours = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const point of analytics.data?.hours ?? [])
      if (point.weekday >= 1 && point.weekday <= 7 && point.hour >= 0 && point.hour < 24)
        hours[point.weekday - 1]![point.hour] = point.orders;
    return hours;
  }, [analytics.data?.hours]);
  const totalRevenue = useMemo(
    () => points.reduce((total, point) => total + point.revenue, 0),
    [points],
  );
  const totalOrders = useMemo(
    () => points.reduce((total, point) => total + point.orders, 0),
    [points],
  );
  const averageCheck = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;
  const itemsSold = (analytics.data?.products ?? []).reduce(
    (total, product) => total + product.value,
    0,
  );
  const categorySize =
    categoryPerformance.length <= 2
      ? "compact"
      : categoryPerformance.length <= 5
        ? "balanced"
        : "rich";
  const money = useRestaurantMoney();
  if (analytics.isPending)
    return (
      <main className="state-loading">
        <span className="loading-mark">✦</span> Loading live analytics
      </main>
    );
  if (analytics.isError)
    return (
      <main className="state-loading">
        <p>
          {analytics.error instanceof Error
            ? analytics.error.message
            : "Analytics could not be loaded."}
        </p>
        <button className="button button-primary" onClick={() => analytics.refetch()}>
          Retry
        </button>
      </main>
    );
  if (!analytics.data?.revenue.length)
    return (
      <main className="state-loading">
        <span className="loading-mark">✦</span>
        <p>No sales have been recorded for this period yet.</p>
      </main>
    );

  return (
    <div className="analytics-dashboard">
      <header className="analytics-heading">
        <div>
          <p className="eyebrow">
            Service analytics <span className="sample-badge">Live data</span>
          </p>
          <h1>
            Read the rhythm,
            <br />
            <em>not just the receipt.</em>
          </h1>
          <p>Choose any card to open the full operational breakdown.</p>
        </div>
        <div className="analytics-range">
          <button className={range === 7 ? "active" : ""} onClick={() => setRange(7)}>
            Last 7 days
          </button>
          <button className={range === 30 ? "active" : ""} onClick={() => setRange(30)}>
            Last 30 days
          </button>
        </div>
      </header>
      <section className="analytics-kpis analytics-clickable-kpis">
        <MetricButton
          icon={<TrendingUp size={17} />}
          label="Revenue"
          value={money(totalRevenue)}
          note="Gross revenue from completed orders"
          onClick={() => setDetail("revenue")}
        />
        <MetricButton
          icon={<ReceiptText size={17} />}
          label="Orders"
          value={totalOrders.toLocaleString("en-GB")}
          note={`Avg. check ${money(averageCheck)}`}
          onClick={() => setDetail("orders")}
        />
        <MetricButton
          icon={<UtensilsCrossed size={17} />}
          label="Items sold"
          value={itemsSold.toLocaleString("en-GB")}
          note="Across completed table orders"
          onClick={() => setDetail("plates")}
        />
      </section>
      <div className="analytics-grid">
        <ChartCard
          title="Revenue over time"
          note="Gross receipts including tax"
          onClick={() => setDetail("revenue")}
          large
        >
          <AreaMini data={points} />
        </ChartCard>
        <ChartCard
          title="Best-selling plates"
          note={`Top 3 of ${productVelocity.length} plates`}
          onClick={() => setDetail("plates")}
        >
          <BarMini data={productVelocity} />
        </ChartCard>
        <ChartCard
          title="Category mix"
          note={`${categoryPerformance.length} revenue categories`}
          onClick={() => setDetail("categories")}
          className={`category-mix-card ${categorySize}`}
        >
          <CategoryMini data={categoryPerformance} />
        </ChartCard>
        <ChartCard
          title="Peak service hours"
          note="Completed orders by weekday and hour"
          onClick={() => setDetail("hours")}
        >
          <Heatmap data={peakHours} />
        </ChartCard>
        <ChartCard
          title="Table performance"
          note="Top tables by revenue"
          onClick={() => setDetail("tables")}
          className="table-performance-card"
        >
          <TableMini data={tablePerformance} />
        </ChartCard>
        <ChartCard
          title="Tax due"
          note="Amount collected by rate"
          onClick={() => setDetail("tax")}
          className="tax-due-card"
        >
          <TaxMini data={taxBreakdown} />
        </ChartCard>
      </div>
      <p className="analytics-footnote">
        Select a metric to inspect its drivers and operating detail. <ArrowUpRight size={12} />
      </p>
      {detail && (
        <GlassModal
          className="analytics-detail-modal"
          labelledBy="analytics-detail-title"
          onClose={() => setDetail(null)}
        >
          <header className="analytics-detail-header">
            <div>
              <p className="eyebrow">Expanded analysis</p>
              <h2 id="analytics-detail-title">{metricTitle(detail)}</h2>
              <p>{metricDescription(detail)}</p>
            </div>
            <button onClick={() => setDetail(null)}>
              <X size={18} />
            </button>
          </header>
          <div className="analytics-detail-body">
            <MetricDetail
              metric={detail}
              points={points}
              totalRevenue={totalRevenue}
              totalOrders={totalOrders}
              averageCheck={averageCheck}
              money={money}
              products={productVelocity}
              categories={categoryPerformance}
              tables={tablePerformance}
              taxes={taxBreakdown}
              hours={peakHours}
            />
          </div>
        </GlassModal>
      )}
    </div>
  );
}

function MetricButton({
  icon,
  label,
  value,
  note,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}>
      <span>{icon}</span>
      <p>{label}</p>
      <b>{value}</b>
      <small>{note}</small>
      <i>Open detail ↗</i>
    </button>
  );
}
function ChartCard({
  title,
  note,
  children,
  onClick,
  className = "",
  large = false,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  large?: boolean;
}) {
  return (
    <button
      className={`analytics-card analytics-card-button ${large ? "analytics-large-card" : ""} ${className}`}
      onClick={onClick}
    >
      <header>
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
        <span>Expand ↗</span>
      </header>
      {children}
    </button>
  );
}
function AreaMini({ data, detail = false }: { data: RevenuePoint[]; detail?: boolean }) {
  return (
    <div className={`chart-area ${detail ? "detail-chart" : "large"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 9, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient
              id={detail ? "detailRevenue" : "revenueGradient"}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor={blue} stopOpacity={0.35} />
              <stop offset="100%" stopColor={blue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={grid} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8190aa", fontSize: 9 }}
            minTickGap={28}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8190aa", fontSize: 9 }}
            tickFormatter={(value) => `€${Math.round(value / 1000)}k`}
          />
          <Tooltip content={<CurrencyTooltip />} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={blue}
            strokeWidth={2}
            fill={`url(#${detail ? "detailRevenue" : "revenueGradient"})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function BarMini({ data, detail = false }: { data: BarPoint[]; detail?: boolean }) {
  const visible = detail ? data : data.slice(0, 3);
  return (
    <div className={`chart-area ${detail ? "detail-chart" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={visible} layout="vertical" margin={{ right: 20, left: 18 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={74}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#9eacc4", fontSize: 10 }}
          />
          <Tooltip content={<CurrencyTooltip />} cursor={false} />
          <Bar dataKey="value" fill={blue} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
function CategoryMini({ data, detail = false }: { data: BarPoint[]; detail?: boolean }) {
  return (
    <div className={`category-chart ${detail ? "detail-category-chart" : ""}`}>
      <ResponsiveContainer width="48%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={detail ? 58 : 42}
            outerRadius={detail ? 86 : 62}
            paddingAngle={3}
            stroke="none"
          >
            {data.map((point, index) => (
              <Cell
                fill={
                  index === 0
                    ? blue
                    : index === 1
                      ? mint
                      : `hsl(${220 + index * 18} 28% ${42 + index * 5}%)`
                }
                key={point.name}
              />
            ))}
          </Pie>
          <Tooltip content={<CurrencyTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div>
        {data.map((item, index) => (
          <p key={item.name}>
            <i className={`series-${index}`} />
            <span>{item.name}</span>
            <b>€{Math.round(item.value / 1000)}k</b>
          </p>
        ))}
      </div>
    </div>
  );
}
function Heatmap({ data, detail = false }: { data: number[][]; detail?: boolean }) {
  const start = detail ? 0 : 18;
  const times = peakTimes.slice(start);
  return (
    <div className={`heatmap ${detail ? "heatmap-full-day" : ""}`}>
      <div className="heatmap-times">
        <span />
        {times.map((time) => (
          <span key={time}>{time.slice(0, 2)}</span>
        ))}
      </div>
      {data.map((day, row) => (
        <div className="heatmap-row" key={peakDays[row]}>
          <span>{peakDays[row]}</span>
          {day.slice(start).map((value, column) => (
            <i
              title={`${peakDays[row]} ${times[column]}: ${value} completed orders`}
              style={{ opacity: 0.14 + value / 115 }}
              key={`${row}-${column}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
function TableMini({ data }: { data: BarPoint[] }) {
  const money = useRestaurantMoney();
  if (!data.length) return <EmptyChart />;
  const topRevenue = Math.max(...data.map((table) => table.value));
  return (
    <div className="table-performance">
      <div className="table-performance-summary">
        <span>Top table</span>
        <b>{data[0].name}</b>
        <strong>{money(data[0].value)}</strong>
      </div>
      <div className="table-performance-list">
        {data.map((table, index) => (
          <div key={table.name}>
            <span>{index + 1}</span>
            <b>{table.name}</b>
            <i>
              <em style={{ width: `${(table.value / topRevenue) * 100}%` }} />
            </i>
            <strong>{money(table.value)}</strong>
            <small>{table.secondary} min</small>
          </div>
        ))}
      </div>
    </div>
  );
}
function TaxMini({ data }: { data: BarPoint[] }) {
  const money = useRestaurantMoney();
  if (!data.length) return <EmptyChart />;
  const total = data.reduce((sum, tax) => sum + tax.value, 0);
  return (
    <div className="tax-breakdown">
      <div className="tax-due-total">
        <span>Tax collected</span>
        <b>{money(total)}</b>
      </div>
      <div className="tax-breakdown-list">
        {data.map((tax) => (
          <div key={tax.name}>
            <span>{tax.name}</span>
            <b>{money(tax.value)}</b>
            <small>{Math.round((tax.value / total) * 100)}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}
function EmptyChart() {
  return (
    <div className="chart-area" role="status">
      No data for this period.
    </div>
  );
}
function MetricDetail({
  metric,
  points,
  totalRevenue,
  totalOrders,
  averageCheck,
  money,
  products,
  categories,
  tables,
  taxes,
  hours,
}: {
  metric: Metric;
  points: RevenuePoint[];
  totalRevenue: number;
  totalOrders: number;
  averageCheck: number;
  money: (value: number) => string;
  products: BarPoint[];
  categories: BarPoint[];
  tables: BarPoint[];
  taxes: BarPoint[];
  hours: number[][];
}) {
  if (metric === "revenue")
    return (
      <>
        <div className="detail-stat-row">
          <b>{money(totalRevenue)}</b>
          <span>
            {totalOrders} completed {totalOrders === 1 ? "order" : "orders"}
          </span>
          <span>{money(Math.round(totalRevenue / points.length))} daily average</span>
        </div>
        <AreaMini data={points} detail />
      </>
    );
  if (metric === "orders")
    return (
      <>
        <div className="detail-stat-row">
          <b>{totalOrders.toLocaleString("en-GB")}</b>
          <span>{money(averageCheck)} average check</span>
          <span>{Math.round(totalOrders / points.length)} orders per active day</span>
        </div>
        <AreaMini data={points} detail />
      </>
    );
  if (metric === "plates") return <BarMini data={products} detail />;
  if (metric === "categories") return <CategoryMini data={categories} detail />;
  if (metric === "hours")
    return (
      <div className="detail-heatmap">
        <Heatmap data={hours} detail />
        <p>
          Darker cells represent more completed orders. The full day is shown from 00:00 to 23:00.
        </p>
      </div>
    );
  if (metric === "tables")
    return (
      <div className="detail-list">
        <TableMini data={tables} />
      </div>
    );
  if (metric === "tax")
    return (
      <div className="detail-list">
        <TaxMini data={taxes} />
      </div>
    );
  return null;
}
function metricTitle(metric: Metric) {
  return {
    revenue: "Revenue performance",
    orders: "Order volume",
    plates: "Best-selling plates",
    categories: "Category mix",
    hours: "Peak service hours",
    tables: "Table performance",
    tax: "Tax collected",
  }[metric];
}
function metricDescription(metric: Metric) {
  return {
    revenue: "Daily gross receipts, movement and period comparison.",
    orders: "Volume, average check and service-level demand.",
    plates: "The menu items ordered most often across the selected period.",
    categories: "How menu sections contribute to total revenue.",
    hours: "Completed order volume by weekday and closing hour.",
    tables: "Revenue and completed order contribution by table.",
    tax: "Collected tax grouped by the applied menu category.",
  }[metric];
}
