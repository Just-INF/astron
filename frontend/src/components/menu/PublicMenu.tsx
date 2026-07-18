import { motion } from "framer-motion";
import { useState, type CSSProperties } from "react";
import type { GuestMenuTheme, MenuCategory, Product, Restaurant, TaxCategory } from "@/types";
import { priceAfterTax } from "@/stores/useMenuStore";
import { formatCurrency } from "@/lib/currency";
import { PublicTableActions } from "@/components/menu/PublicTableActions";

interface PublicMenuProps {
  restaurant: Pick<
    Restaurant,
    "id" | "name" | "logoUrl" | "cuisineType" | "currency" | "language" | "timezone"
  >;
  theme: GuestMenuTheme;
  categories: MenuCategory[];
  products: Product[];
  taxes: TaxCategory[];
  tableCode?: string;
}

export function PublicMenu({
  restaurant,
  theme,
  categories,
  products,
  taxes,
  tableCode,
}: PublicMenuProps) {
  const visibleCategories = categories
    .filter((category) =>
      products.some((product) => product.categoryId === category.id && product.isAvailable),
    )
    .sort((a, b) => a.position - b.position);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const activeCategory =
    visibleCategories.find((category) => category.id === activeCategoryId) ?? visibleCategories[0];
  const entrance =
    theme.entranceAnimationPreset === "slide-up-stagger"
      ? "slide"
      : theme.entranceAnimationPreset === "reveal-editorial"
        ? "scale"
        : theme.entranceAnimationPreset === "fade-in"
          ? "fade"
          : theme.entranceAnimationPreset;
  const initial =
    entrance === "none"
      ? {}
      : entrance === "slide"
        ? { opacity: 0, y: 12 }
        : entrance === "scale"
          ? { opacity: 0, scale: 0.975 }
          : { opacity: 0 };
  const duration =
    theme.animationSpeed === "fast" ? 0.16 : theme.animationSpeed === "slow" ? 0.25 : 0.2;
  const style = {
    "--menu-bg": theme.backgroundColor ?? "#090d18",
    "--menu-text-primary": theme.textColor ?? "#eef3ff",
    "--menu-accent": theme.accentColor ?? "#9ee1c3",
    "--menu-base-size":
      theme.baseTextSize === "large" ? "16px" : theme.baseTextSize === "small" ? "12px" : "14px",
  } as CSSProperties;
  const categorySections = theme.renderAllCategories
    ? visibleCategories
    : activeCategory
      ? [activeCategory]
      : [];
  const price = (product: Product) =>
    theme.showCurrency === false
      ? priceAfterTax(product, taxes).toFixed(2)
      : formatCurrency(priceAfterTax(product, taxes), restaurant.currency, restaurant.language);

  return (
    <main
      className={`public-menu-page theme-${theme.paletteId} density-${theme.density} layout-${theme.layoutType ?? "list"} width-${theme.widthPreset ?? "standard"} font-${theme.fontPairingId} image-${theme.imagePosition ?? "right"} image-aspect-${theme.imageAspect ?? "square"} price-${theme.pricePosition ?? "right"}${tableCode ? " has-floating-actions" : ""}`}
      style={style}
    >
      {theme.customCss && <style>{theme.customCss}</style>}
      <div className="public-menu-shell">
        <header className="public-menu-header">
          {theme.showRestaurantLogo && restaurant.logoUrl && (
            <img className="public-menu-logo" src={restaurant.logoUrl} alt="" />
          )}
          <p>ASTRON · GUEST MENU</p>
          <span>{restaurant.cuisineType}</span>
          <h1>{restaurant.name}</h1>
          <small>
            {(restaurant.timezone || "UTC").replaceAll("_", " ")} · {restaurant.currency}
          </small>
        </header>
        {!theme.renderAllCategories && visibleCategories.length > 1 && (
          <nav
            className={`public-menu-category-nav category-nav-${theme.categoryNavigation ?? "pills"}`}
            aria-label="Menu categories"
          >
            {visibleCategories.map((category) => (
              <button
                type="button"
                className={activeCategory?.id === category.id ? "active" : ""}
                onClick={() => setActiveCategoryId(category.id)}
                key={category.id}
              >
                {category.name}
              </button>
            ))}
          </nav>
        )}
        <motion.div
          initial={initial}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
          className="public-menu-courses"
        >
          {categorySections.length === 0 ? (
            <section className="public-menu-empty">
              <h2>Menu coming soon</h2>
              <p>There are no available dishes in this section yet.</p>
            </section>
          ) : (
            categorySections.map((category) => (
              <section key={category.id}>
                <motion.h2
                  initial={initial}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration }}
                >
                  {category.name}
                </motion.h2>
                <div className="public-menu-items">
                  {products
                    .filter((product) => product.categoryId === category.id && product.isAvailable)
                    .map((product, index) => {
                      const primaryImage = product.images?.[0] ?? product.imageUrl;
                      const truncate =
                        theme.descriptionDisplay === "truncate" &&
                        !expandedDescriptions[product.id];
                      return (
                        <motion.article
                          key={product.id}
                          initial={initial}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ delay: index * 0.03, duration, ease: [0.16, 1, 0.3, 1] }}
                        >
                          <div className="menu-item-copy">
                            <div className="menu-item-title">
                              <h3>{product.name}</h3>
                              <b>{price(product)}</b>
                            </div>
                            {theme.descriptionDisplay !== "hide" && (
                              <p className={truncate ? "is-truncated" : ""}>
                                {product.description}
                                {truncate && product.description.length > 105 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedDescriptions((value) => ({
                                        ...value,
                                        [product.id]: true,
                                      }))
                                    }
                                  >
                                    more
                                  </button>
                                )}
                              </p>
                            )}
                            {theme.dietaryTagDisplay !== "hide" && product.dietaryTags?.length ? (
                              <div className={`menu-dietary-tags tags-${theme.dietaryTagDisplay}`}>
                                {product.dietaryTags.map((tag) => (
                                  <span key={tag}>
                                    {theme.dietaryTagDisplay === "icons" ? "•" : tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {theme.imagePosition !== "hidden" && primaryImage && (
                            <img src={primaryImage} alt={product.name} width={180} height={180} />
                          )}
                        </motion.article>
                      );
                    })}
                </div>
              </section>
            ))
          )}
        </motion.div>
        <footer>Ask your server for allergen and dietary guidance.</footer>
      </div>
      {tableCode && <PublicTableActions restaurantId={restaurant.id} tableCode={tableCode} />}
    </main>
  );
}
