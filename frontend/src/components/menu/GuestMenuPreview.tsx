import { AnimatePresence, motion } from "framer-motion";
import type { GuestMenuTheme, MenuCategory, Product, TaxCategory } from "@/types";
import { priceAfterTax } from "@/stores/useMenuStore";

interface GuestMenuPreviewProps {
  theme: GuestMenuTheme;
  categories: MenuCategory[];
  products: Product[];
  taxes: TaxCategory[];
  restaurantName: string;
  restaurantLocation: string;
  mode: "mobile" | "desktop";
}

export function GuestMenuPreview({
  theme,
  categories,
  products,
  taxes,
  restaurantName,
  restaurantLocation,
  mode,
}: GuestMenuPreviewProps) {
  const visibleCategories = categories.filter((category) =>
    products.some((product) => product.categoryId === category.id && product.isAvailable),
  );
  const animation =
    theme.entranceAnimationPreset === "slide-up-stagger"
      ? { initial: { opacity: 0, y: 13 }, animate: { opacity: 1, y: 0 } }
      : theme.entranceAnimationPreset === "reveal-editorial"
        ? { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 } }
        : { initial: { opacity: 0 }, animate: { opacity: 1 } };
  return (
    <div className={`guest-preview-frame ${mode}`}>
      <div
        className={`guest-menu theme-${theme.paletteId} density-${theme.density} font-${theme.fontPairingId}`}
      >
        <header>
          <p>{restaurantName}</p>
          <span>{restaurantLocation}</span>
          <h2>
            Evening
            <br />
            menu
          </h2>
        </header>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${theme.paletteId}-${theme.density}-${theme.entranceAnimationPreset}`}
            initial="initial"
            animate="animate"
            variants={{ initial: animation.initial, animate: animation.animate }}
            transition={{
              duration: theme.entranceAnimationPreset === "reveal-editorial" ? 0.7 : 0.35,
              staggerChildren: 0.04,
            }}
            className="guest-menu-courses"
          >
            {visibleCategories.map((category) => (
              <section key={category.id}>
                <h3>{category.name}</h3>
                {products
                  .filter((product) => product.categoryId === category.id && product.isAvailable)
                  .map((product, index) => (
                    <motion.article
                      key={product.id}
                      variants={{ initial: animation.initial, animate: animation.animate }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <div>
                        <h4>{product.name}</h4>
                        <p>{product.description}</p>
                        <b>€{priceAfterTax(product, taxes).toFixed(2)}</b>
                      </div>
                      {theme.density !== "minimalist" && product.imageUrl && (
                        <img src={product.imageUrl} alt={product.name} width={90} height={90} />
                      )}
                    </motion.article>
                  ))}
              </section>
            ))}
          </motion.div>
        </AnimatePresence>
        <footer>Our kitchen observes allergens with care. Ask your server for guidance.</footer>
      </div>
    </div>
  );
}
