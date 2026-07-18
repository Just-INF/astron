export type MenuPalette = "gold-dark" | "emerald-light" | "rose-terracotta" | "monochrome-classic";
export type LayoutShape = "intimate" | "linear" | "terrace";
export type MembershipRole =
  | "owner"
  | "manager"
  | "host"
  | "waiter"
  | "chef"
  | "menu-editor"
  | "viewer";

export interface UserSession {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerified: boolean;
  activeRestaurantId: string | null;
  restaurantIds: string[];
  memberships: Array<{ restaurantId: string; role: MembershipRole }>;
}

export interface Restaurant {
  id: string;
  ownerId: string;
  name: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  cuisineType: string;
  notes: string;
  currency: string;
  language: string;
  timezone: string;
  reservationsEnabled?: boolean;
  callWaiterEnabled?: boolean;
  requestCheckEnabled?: boolean;
  theme: MenuPalette;
  tableCount: number;
  layoutShape: LayoutShape;
  teamInvites: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantMember {
  userId: string;
  restaurantId: string;
  role: MembershipRole;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockAccount {
  email: string;
  password: string;
  name: string;
  userId: string;
}

export interface OnboardingDetails {
  name: string;
  cuisineType: string;
  logoFilename: string | null;
  notes: string;
  currency: string;
  timezone: string;
  theme: MenuPalette;
  tableCount: number;
  layoutShape: LayoutShape;
  teamInvites: string[];
}

export interface TaxCategory {
  id: string;
  restaurantId: string;
  name: string;
  ratePercentage: number;
}

export interface MenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  position: number;
}

export interface Product {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  priceBeforeTax: number;
  taxCategoryId: string;
  imageUrl: string | null;
  images: string[];
  dietaryTags?: string[];
  isAvailable: boolean;
  position: number;
}

export type FontPairing = "serif-display-sans-body" | "modern-sans-clean" | "editorial-mono";
export type MenuDensity = "comfortable" | "compact" | "minimalist";
export type MenuAnimation =
  | "none"
  | "fade"
  | "slide"
  | "scale"
  | "fade-in"
  | "slide-up-stagger"
  | "reveal-editorial";
export type MenuLayout = "grid" | "list";
export type MenuCategoryNavigation = "pills" | "tabs" | "list";
export type MenuWidth = "compact" | "standard" | "wide";
export type MenuAnimationSpeed = "fast" | "normal" | "slow";
export type MenuImagePosition = "left" | "right" | "top" | "hidden";
export type MenuImageAspect = "square" | "wide" | "tall";
export type MenuPricePosition = "inline" | "right" | "below";
export type MenuDescriptionDisplay = "show" | "hide" | "truncate";
export type MenuTextSize = "small" | "medium" | "large";

export interface GuestMenuTheme {
  id: string;
  restaurantId: string;
  paletteId: MenuPalette;
  fontPairingId: FontPairing;
  density: MenuDensity;
  entranceAnimationPreset: MenuAnimation;
  exitAnimationPreset: MenuAnimation;
  animationSpeed: MenuAnimationSpeed;
  layoutType: MenuLayout;
  categoryNavigation: MenuCategoryNavigation;
  widthPreset: MenuWidth;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  showRestaurantLogo?: boolean;
  customCss?: string;
  imagePosition?: MenuImagePosition;
  imageAspect?: MenuImageAspect;
  pricePosition?: MenuPricePosition;
  showCurrency?: boolean;
  renderAllCategories?: boolean;
  baseTextSize?: MenuTextSize;
  descriptionDisplay?: MenuDescriptionDisplay;
  dietaryTagDisplay?: "icons" | "text" | "hide";
  isPublished: boolean;
  version: number;
  updatedAt: string;
}

export interface ThemeVersion {
  id: string;
  restaurantId: string;
  version: number;
  label: string;
  createdAt: string;
}

export type TableShape = "circle" | "square" | "rectangle";
export type TableStatus = "available" | "occupied" | "reserved";
export type FloorPlanLabelMode = "capacity" | "name" | "both";

export interface FloorPlanTheme {
  restaurantId: string;
  initialZoomPadding: number;
  snapToGrid: boolean;
  labelMode: FloorPlanLabelMode;
  defaultTableShape: TableShape;
  availableColor: string;
  reservedColor: string;
  occupiedColor: string;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}

export interface DiningTable {
  id: string;
  restaurantId: string;
  name: string;
  capacity: number;
  shape: TableShape;
  position: { x: number; y: number; z: number };
  rotation: number;
  status: TableStatus;
  code?: string;
  linked?: boolean;
  width?: number;
  depth?: number;
}

export type OrderStatus = "new" | "in_progress" | "ready" | "completed" | "cancelled";
export type OrderItemStatus = "not_taken" | "preparing" | "done";
export type ServiceRequestType = "waiter_call" | "check";
export type ServiceRequestStatus = "new" | "acknowledged" | "completed";
export type PaymentMethod = "card" | "cash";

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  categoryName: string;
  notes: string | null;
  status: OrderItemStatus;
  preparationRelevant: boolean;
  assignedChefId: string | null;
  assignedChefName: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  quantity: number;
  unitPriceMinor: number;
  taxRateBasisPoints: number;
  taxMinor: number;
  totalMinor: number;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId: string | null;
  tableName: string;
  status: OrderStatus;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface ServiceRequest {
  id: string;
  restaurantId: string;
  tableId: string;
  tableName: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  guestSessionId: string | null;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KitchenItem extends OrderItem {
  tableName: string;
  orderCreatedAt: string;
  orderNotes: string | null;
  orderStatus: OrderStatus;
}

export interface WallNode {
  x: number;
  y: number;
}
export interface WallSegment {
  curve: number;
}

export interface WallGeometry {
  id: string;
  restaurantId: string;
  nodes: WallNode[];
  segments: WallSegment[];
  thickness: number;
  height: number;
  closed?: boolean;
}

export interface FloorZone {
  id: string;
  restaurantId: string;
  name: string;
  color: string;
  shape: "rectangle" | "polygon";
  points: { x: number; y: number }[];
  segments?: WallSegment[];
}

export type ReservationStatus = "confirmed" | "seated" | "completed" | "cancelled";

export interface Reservation {
  id: string;
  restaurantId: string;
  tableId: string;
  guestName: string;
  partySize: number;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface ReservationSettings {
  restaurantId: string;
  maxStayMinutes: number;
  slotMinutes: number;
  is24_7: boolean;
  weeklyHours: Record<number, DayHours>;
}

export interface ReservationTheme {
  id: string;
  restaurantId: string;
  paletteId: MenuPalette;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  widthPreset: MenuWidth;
  entranceAnimationPreset: MenuAnimation;
  animationSpeed: MenuAnimationSpeed;
  pageTitle: string;
  pageSubtitle: string;
  showFloorPlan: boolean;
  layoutVariant?: "guided" | "split" | "condensed";
  stepIndicator?: "numbered" | "progress" | "dots" | "hidden";
  floorPlanProminence?: "prominent" | "collapsed" | "hidden";
  tableSelectionMode?: "list" | "floorplan" | "both";
  heroImage?: string;
  heroHeight?: "short" | "medium" | "tall";
  heroOverlay?: number;
  logoPlacement?: "top-left" | "centered" | "hidden";
  fontPairingId?: FontPairing;
  heroAccentColor?: string;
  helperText?: string;
  confirmationHeading?: string;
  confirmationMessage?: string;
  confirmationImage?: string;
  confirmationActions?: boolean;
  showRestaurantLogo?: boolean;
  customCss?: string;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}
