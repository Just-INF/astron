import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GuestMenuTheme, MenuCategory, Product, TaxCategory, ThemeVersion } from "@/types";
import { api, apiRequest } from "@/lib/api/client";

const menuThemeWrites = new Map<string, Promise<void>>();
function queueMenuThemeWrite<T>(restaurantId: string, write: () => Promise<T>): Promise<T> {
  const previous = menuThemeWrites.get(restaurantId) ?? Promise.resolve();
  const next = previous.then(write, write);
  menuThemeWrites.set(
    restaurantId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

async function refreshMenu(restaurantId: string) {
  const data = await api.menu(restaurantId);
  useMenuStore.setState((state) => ({
    categories: { ...state.categories, [restaurantId]: data.categories },
    products: { ...state.products, [restaurantId]: data.products },
    taxCategories: {
      ...state.taxCategories,
      [restaurantId]: data.taxCategories,
    },
    themes: { ...state.themes, [restaurantId]: data.theme },
    themeHistory: { ...state.themeHistory, [restaurantId]: data.versions },
  }));
}
function syncMenu(restaurantId: string, request: Promise<unknown>) {
  void request
    .then(() => refreshMenu(restaurantId))
    .catch(async () => {
      try {
        await refreshMenu(restaurantId);
      } catch {
        /* The global server-state boundary exposes persistent fetch failures. */
      }
    });
}

interface MenuState {
  categories: Record<string, MenuCategory[]>;
  products: Record<string, Product[]>;
  taxCategories: Record<string, TaxCategory[]>;
  themes: Record<string, GuestMenuTheme>;
  publishedThemes: Record<string, GuestMenuTheme>;
  themeHistory: Record<string, ThemeVersion[]>;
}

interface MenuActions {
  addCategory: (restaurantId: string, name: string, description?: string) => void;
  updateCategory: (
    restaurantId: string,
    categoryId: string,
    patch: Pick<MenuCategory, "name" | "description">,
  ) => void;
  reorderCategories: (restaurantId: string, orderedIds: string[]) => void;
  deleteCategory: (restaurantId: string, categoryId: string) => void;
  addProduct: (
    restaurantId: string,
    product: Omit<Product, "id" | "restaurantId" | "position">,
  ) => void;
  updateProduct: (
    restaurantId: string,
    productId: string,
    patch: Partial<Omit<Product, "id" | "restaurantId" | "position">>,
  ) => void;
  deleteProduct: (restaurantId: string, productId: string) => void;
  addTaxCategory: (restaurantId: string, name: string, ratePercentage: number) => void;
  updateTaxRate: (restaurantId: string, taxCategoryId: string, ratePercentage: number) => void;
  updateTaxCategory: (
    restaurantId: string,
    taxCategoryId: string,
    patch: Pick<TaxCategory, "name" | "ratePercentage">,
  ) => void;
  updateTheme: (
    restaurantId: string,
    patch: Partial<Omit<GuestMenuTheme, "id" | "restaurantId" | "version" | "updatedAt">>,
  ) => void;
  publishTheme: (restaurantId: string) => Promise<void>;
  refreshMenu: (restaurantId: string) => Promise<void>;
}

export type MenuStore = MenuState & MenuActions;

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
function timestamp(): string {
  return new Date().toISOString();
}
function defaultTheme(restaurantId: string): GuestMenuTheme {
  return {
    id: id("theme"),
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
    isPublished: false,
    version: 1,
    updatedAt: timestamp(),
  };
}

export function priceAfterTax(product: Product, taxes: TaxCategory[]): number {
  const tax = taxes.find((item) => item.id === product.taxCategoryId);
  return Math.round(product.priceBeforeTax * (1 + (tax?.ratePercentage ?? 0) / 100) * 100) / 100;
}

export const useMenuStore = create<MenuStore>()(
  persist(
    (set) => ({
      categories: {},
      products: {},
      taxCategories: {},
      themes: {},
      publishedThemes: {},
      themeHistory: {},
      addCategory: (restaurantId, name, description) => {
        set((state) => {
          const current = state.categories[restaurantId] ?? [];
          const category: MenuCategory = {
            id: id("cat"),
            restaurantId,
            name: name.trim(),
            description: description?.trim() || null,
            position: current.length,
          };
          return {
            categories: {
              ...state.categories,
              [restaurantId]: [...current, category],
            },
            themes: state.themes[restaurantId]
              ? state.themes
              : { ...state.themes, [restaurantId]: defaultTheme(restaurantId) },
          };
        });
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/categories`, {
            method: "POST",
            body: JSON.stringify({ name, description }),
          }),
        );
      },
      updateCategory: (restaurantId, categoryId, patch) => {
        set((state) => ({
          categories: {
            ...state.categories,
            [restaurantId]: (state.categories[restaurantId] ?? []).map((category) =>
              category.id === categoryId
                ? {
                    ...category,
                    ...patch,
                    name: patch.name.trim(),
                    description: patch.description?.trim() || null,
                  }
                : category,
            ),
          },
        }));
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/categories/${categoryId}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          }),
        );
      },
      reorderCategories: (restaurantId, orderedIds) => {
        set((state) => {
          const byId = new Map(
            (state.categories[restaurantId] ?? []).map((category) => [category.id, category]),
          );
          const ordered = orderedIds
            .map((id) => byId.get(id))
            .filter((category): category is MenuCategory => Boolean(category));
          return {
            categories: {
              ...state.categories,
              [restaurantId]: ordered.map((category, position) => ({
                ...category,
                position,
              })),
            },
          };
        });
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/categories/order`, {
            method: "PUT",
            body: JSON.stringify({ orderedIds }),
          }),
        );
      },
      deleteCategory: (restaurantId, categoryId) => {
        set((state) => ({
          categories: {
            ...state.categories,
            [restaurantId]: (state.categories[restaurantId] ?? []).filter(
              (category) => category.id !== categoryId,
            ),
          },
          products: {
            ...state.products,
            [restaurantId]: (state.products[restaurantId] ?? []).filter(
              (product) => product.categoryId !== categoryId,
            ),
          },
        }));
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/categories/${categoryId}`, {
            method: "DELETE",
          }),
        );
      },
      addProduct: (restaurantId, product) => {
        set((state) => {
          const current = state.products[restaurantId] ?? [];
          const item: Product = {
            ...product,
            id: id("dish"),
            restaurantId,
            position: current.length,
          };
          return {
            products: { ...state.products, [restaurantId]: [...current, item] },
          };
        });
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/products`, {
            method: "POST",
            body: JSON.stringify(product),
          }),
        );
      },
      updateProduct: (restaurantId, productId, patch) => {
        set((state) => ({
          products: {
            ...state.products,
            [restaurantId]: (state.products[restaurantId] ?? []).map((product) =>
              product.id === productId ? { ...product, ...patch } : product,
            ),
          },
        }));
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/products/${productId}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          }),
        );
      },
      deleteProduct: (restaurantId, productId) => {
        set((state) => ({
          products: {
            ...state.products,
            [restaurantId]: (state.products[restaurantId] ?? []).filter(
              (product) => product.id !== productId,
            ),
          },
        }));
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/products/${productId}`, {
            method: "DELETE",
          }),
        );
      },
      addTaxCategory: (restaurantId, name, ratePercentage) => {
        set((state) => {
          const current = state.taxCategories[restaurantId] ?? [];
          const tax: TaxCategory = {
            id: id("tax"),
            restaurantId,
            name: name.trim(),
            ratePercentage,
          };
          return {
            taxCategories: {
              ...state.taxCategories,
              [restaurantId]: [...current, tax],
            },
          };
        });
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/tax-categories`, {
            method: "POST",
            body: JSON.stringify({ name, ratePercentage }),
          }),
        );
      },
      updateTaxRate: (restaurantId, taxCategoryId, ratePercentage) => {
        set((state) => ({
          taxCategories: {
            ...state.taxCategories,
            [restaurantId]: (state.taxCategories[restaurantId] ?? []).map((tax) =>
              tax.id === taxCategoryId ? { ...tax, ratePercentage } : tax,
            ),
          },
        }));
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/tax-categories/${taxCategoryId}`, {
            method: "PATCH",
            body: JSON.stringify({ ratePercentage }),
          }),
        );
      },
      updateTaxCategory: (restaurantId, taxCategoryId, patch) => {
        set((state) => ({
          taxCategories: {
            ...state.taxCategories,
            [restaurantId]: (state.taxCategories[restaurantId] ?? []).map((tax) =>
              tax.id === taxCategoryId
                ? {
                    ...tax,
                    name: patch.name.trim(),
                    ratePercentage: patch.ratePercentage,
                  }
                : tax,
            ),
          },
        }));
        syncMenu(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/menu/tax-categories/${taxCategoryId}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          }),
        );
      },
      updateTheme: (restaurantId, patch) => {
        set((state) => {
          const current = state.themes[restaurantId] ?? defaultTheme(restaurantId);
          return {
            themes: {
              ...state.themes,
              [restaurantId]: { ...current, ...patch, updatedAt: timestamp() },
            },
          };
        });
        void queueMenuThemeWrite(restaurantId, () =>
          apiRequest(`/api/restaurants/${restaurantId}/menu/theme/draft`, {
            method: "PATCH",
            body: JSON.stringify({ patch }),
          }),
        ).catch(() => refreshMenu(restaurantId));
      },
      publishTheme: async (restaurantId) => {
        try {
          const published = await queueMenuThemeWrite(restaurantId, () =>
            apiRequest<GuestMenuTheme>(`/api/restaurants/${restaurantId}/menu/theme/publish`, {
              method: "POST",
            }),
          );
          await refreshMenu(restaurantId);
          set((state) => ({
            publishedThemes: {
              ...state.publishedThemes,
              [restaurantId]: published,
            },
          }));
        } catch (error) {
          await refreshMenu(restaurantId).catch(() => undefined);
          throw error;
        }
      },
      refreshMenu,
    }),
    {
      name: "astron_menus",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: () => ({}),
    },
  ),
);
