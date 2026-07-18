import { ApiError } from "./errors";

const MAX_CUSTOM_CSS_BYTES = 20_000;
const forbiddenCss =
  /@import|(?:url\s*\(\s*["']?\s*(?:javascript|data|file):)|expression\s*\(|-moz-binding/i;

export function validateCustomCss(document: unknown, mayEdit: boolean): void {
  if (!document || typeof document !== "object" || !("customCss" in document)) return;
  const css = (document as { customCss?: unknown }).customCss;
  if (css === undefined) return;
  if (!mayEdit)
    throw new ApiError(403, "CUSTOM_CSS_FORBIDDEN", "Your role cannot edit custom CSS.");
  if (typeof css !== "string")
    throw new ApiError(422, "INVALID_CUSTOM_CSS", "Custom CSS must be text.");
  if (new TextEncoder().encode(css).byteLength > MAX_CUSTOM_CSS_BYTES)
    throw new ApiError(422, "CUSTOM_CSS_TOO_LARGE", "Custom CSS must be 20 KB or smaller.");
  if (forbiddenCss.test(css))
    throw new ApiError(
      422,
      "UNSAFE_CUSTOM_CSS",
      "Custom CSS contains a disallowed import, URL scheme, or expression.",
    );
}

export function defaultMenuTheme(restaurantId: string) {
  return {
    id: `theme_${restaurantId}`,
    restaurantId,
    paletteId: "gold-dark",
    fontPairingId: "modern-sans-clean",
    density: "comfortable",
    entranceAnimationPreset: "slide",
    exitAnimationPreset: "fade",
    animationSpeed: "normal",
    layoutType: "list",
    categoryNavigation: "pills",
    widthPreset: "standard",
    accentColor: "#9ee1c3",
    backgroundColor: "#090d18",
    textColor: "#eef3ff",
    showRestaurantLogo: false,
    customCss: "",
    imagePosition: "right",
    imageAspect: "square",
    pricePosition: "right",
    showCurrency: true,
    renderAllCategories: false,
    baseTextSize: "medium",
    descriptionDisplay: "show",
    dietaryTagDisplay: "text",
  };
}

export function defaultFloorTheme(restaurantId: string) {
  return {
    restaurantId,
    initialZoomPadding: 1.25,
    snapToGrid: true,
    labelMode: "both",
    defaultTableShape: "circle",
    availableColor: "#9ee1c3",
    reservedColor: "#f3b36b",
    occupiedColor: "#ef6f6c",
  };
}

export function defaultReservationTheme(restaurantId: string) {
  return {
    id: `restheme_${restaurantId}`,
    restaurantId,
    paletteId: "gold-dark",
    accentColor: "#9ee1c3",
    backgroundColor: "#090d18",
    textColor: "#eef3ff",
    widthPreset: "standard",
    entranceAnimationPreset: "fade",
    animationSpeed: "normal",
    pageTitle: "Your table is waiting.",
    pageSubtitle:
      "Choose a time, find the table that feels right, and we’ll take care of the rest.",
    showFloorPlan: true,
    layoutVariant: "guided",
    stepIndicator: "numbered",
    floorPlanProminence: "prominent",
    tableSelectionMode: "both",
    heroImage: "",
    heroHeight: "medium",
    heroOverlay: 42,
    logoPlacement: "top-left",
    fontPairingId: "modern-sans-clean",
    heroAccentColor: "#9ee1c3",
    helperText: "",
    confirmationHeading: "Your table is held.",
    confirmationMessage: "We look forward to welcoming you.",
    confirmationImage: "",
    confirmationActions: true,
    showRestaurantLogo: false,
    customCss: "",
  };
}

export function defaultWeeklyHours() {
  return Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [day, { open: "11:00", close: "23:00", closed: false }]),
  );
}
