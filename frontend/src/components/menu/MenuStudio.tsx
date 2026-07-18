import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Edit3,
  FolderPlus,
  ImageIcon,
  Download,
  Upload,
  Percent,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { DashboardPanel } from "@/components/dashboard/EmptyState";
import { ProductDialog } from "@/components/menu/ProductDialog";
import { ThemeEditor } from "@/components/menu/ThemeEditor";
import { GlassModal } from "@/components/ui/GlassModal";
import { priceAfterTax, useMenuStore } from "@/stores/useMenuStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Product, TaxCategory } from "@/types";
import { formatCurrency } from "@/lib/currency";

const EMPTY_PRODUCTS: Product[] = [];

export function MenuStudio() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurants = useAuthStore((state) => state.restaurants);
  const categoriesMap = useMenuStore((state) => state.categories);
  const productsMap = useMenuStore((state) => state.products);
  const taxesMap = useMenuStore((state) => state.taxCategories);
  const themesMap = useMenuStore((state) => state.themes);
  const historyMap = useMenuStore((state) => state.themeHistory);
  const addCategory = useMenuStore((state) => state.addCategory);
  const updateCategory = useMenuStore((state) => state.updateCategory);
  const deleteCategory = useMenuStore((state) => state.deleteCategory);
  const addProduct = useMenuStore((state) => state.addProduct);
  const updateProduct = useMenuStore((state) => state.updateProduct);
  const deleteProduct = useMenuStore((state) => state.deleteProduct);
  const addTaxCategory = useMenuStore((state) => state.addTaxCategory);
  const updateTaxCategory = useMenuStore((state) => state.updateTaxCategory);
  const updateTheme = useMenuStore((state) => state.updateTheme);
  const publishTheme = useMenuStore((state) => state.publishTheme);
  const refreshMenu = useMenuStore((state) => state.refreshMenu);
  const restaurantId = currentUser?.activeRestaurantId ?? "";
  const restaurant = restaurants.find((item) => item.id === restaurantId);
  const categories = categoriesMap[restaurantId] ?? [];
  const products = productsMap[restaurantId] ?? EMPTY_PRODUCTS;
  const taxes = taxesMap[restaurantId] ?? [];
  const theme = themesMap[restaurantId];
  const history = historyMap[restaurantId] ?? [];
  const [activeTab, setActiveTab] = useState<"menu" | "appearance">("menu");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [taxFilter, setTaxFilter] = useState("all");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingTax, setEditingTax] = useState<TaxCategory | "new" | null>(null);
  const [taxName, setTaxName] = useState("");
  const [taxRate, setTaxRate] = useState("19");
  const [dialogProduct, setDialogProduct] = useState<Product | null | "new">(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (restaurantId && categories.length > 0 && taxes.length === 0)
      addTaxCategory(restaurantId, "Standard dine-in", 19);
  }, [addTaxCategory, categories.length, restaurantId, taxes.length]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesCategory =
          selectedCategory === "all" || product.categoryId === selectedCategory;
        const matchesTax = taxFilter === "all" || product.taxCategoryId === taxFilter;
        const matchesQuery =
          product.name.toLowerCase().includes(query.toLowerCase()) ||
          product.description.toLowerCase().includes(query.toLowerCase());
        return matchesCategory && matchesTax && matchesQuery;
      }),
    [products, query, selectedCategory, taxFilter],
  );

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    if (editingCategory)
      updateCategory(restaurantId, editingCategory, {
        name: categoryName,
        description: categoryDescription,
      });
    else addCategory(restaurantId, categoryName, categoryDescription);
    closeCategory();
  }
  function closeCategory() {
    setCategoryName("");
    setCategoryDescription("");
    setEditingCategory(null);
    setShowCategoryForm(false);
  }
  function openEditCategory(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    setEditingCategory(categoryId);
    setCategoryName(category.name);
    setCategoryDescription(category.description ?? "");
    setShowCategoryForm(true);
  }
  function openTax(tax: TaxCategory | "new") {
    setEditingTax(tax);
    setTaxName(tax === "new" ? "" : tax.name);
    setTaxRate(String(tax === "new" ? 19 : tax.ratePercentage));
  }
  function saveTax(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = Number(taxRate);
    if (!taxName.trim() || !Number.isFinite(rate)) return;
    if (editingTax === "new") addTaxCategory(restaurantId, taxName, rate);
    else if (editingTax)
      updateTaxCategory(restaurantId, editingTax.id, {
        name: taxName,
        ratePercentage: rate,
      });
    setEditingTax(null);
  }
  function saveProduct(input: Omit<Product, "id" | "restaurantId" | "position">) {
    if (dialogProduct && dialogProduct !== "new")
      updateProduct(restaurantId, dialogProduct.id, input);
    else addProduct(restaurantId, input);
    setDialogProduct(null);
  }
  function exportMenu() {
    const file = new Blob([JSON.stringify({ categories, products, taxes }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${restaurant?.name?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "menu"}-menu.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importMenu(file: File) {
    setImportError(null);
    try {
      const payload = JSON.parse(await file.text());
      await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787"}/api/restaurants/${restaurantId}/menu/import`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ).then(async (response) => {
        if (!response.ok)
          throw new Error(
            (await response.json().catch(() => null))?.error?.message ?? "Import failed.",
          );
      });
      await refreshMenu(restaurantId);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "The selected file is not a valid menu export.",
      );
    }
  }

  if (!restaurantId) return null;
  if (categories.length === 0)
    return (
      <DashboardPanel>
        <section className="menu-empty">
          <p className="eyebrow">Digital menu</p>
          <h1>
            Give the first category
            <br />a <em>place to land.</em>
          </h1>
          <p>Your guest menu begins with a useful structure. Create the first category.</p>
          <button className="button button-primary" onClick={() => setShowCategoryForm(true)}>
            Create category
          </button>
        </section>
        {showCategoryForm && (
          <CategoryModal
            name={categoryName}
            description={categoryDescription}
            editing={false}
            onName={setCategoryName}
            onDescription={setCategoryDescription}
            onClose={closeCategory}
            onSubmit={submitCategory}
          />
        )}
      </DashboardPanel>
    );

  return (
    <DashboardPanel>
      <div className="menu-page-header">
        <div>
          <p className="eyebrow">Digital menu</p>
          <h1>
            Every dish,
            <br />
            <em>clearly composed.</em>
          </h1>
          <p>Manage categories, pricing, imagery and the menu guests see.</p>
        </div>
        <div className="menu-tabs" role="tablist">
          <button
            className={activeTab === "menu" ? "active" : ""}
            onClick={() => setActiveTab("menu")}
            role="tab"
          >
            Menu content
          </button>
          <button
            className={activeTab === "appearance" ? "active" : ""}
            onClick={() => setActiveTab("appearance")}
            role="tab"
          >
            Display & publish
          </button>
        </div>
        <div className="menu-import-export">
          <button type="button" onClick={exportMenu}>
            <Download size={14} /> Export JSON
          </button>
          <label>
            <Upload size={14} /> Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importMenu(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {importError && (
        <p className="form-error" role="alert">
          {importError}
        </p>
      )}
      <AnimatePresence mode="wait">
        {activeTab === "menu" ? (
          <motion.section
            key="menu"
            className="menu-studio menu-studio-redesign"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <aside className="menu-categories">
              <div className="side-panel-heading">
                <span>Categories</span>
                <button aria-label="Add category" onClick={() => setShowCategoryForm(true)}>
                  <FolderPlus size={16} />
                </button>
              </div>
              <button
                className={selectedCategory === "all" ? "selected" : ""}
                onClick={() => setSelectedCategory("all")}
              >
                <span>All dishes</span>
                <b>{products.length}</b>
              </button>
              {categories.map((category) => (
                <div className="category-row" key={category.id}>
                  <button
                    className={selectedCategory === category.id ? "selected" : ""}
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    <span>{category.name}</span>
                    <b>{products.filter((product) => product.categoryId === category.id).length}</b>
                  </button>
                  <button
                    className="category-edit"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => openEditCategory(category.id)}
                  >
                    <Edit3 size={12} />
                  </button>
                </div>
              ))}
              <section className="tax-category-panel">
                <header>
                  <div>
                    <ReceiptText size={14} />
                    <span>Tax categories</span>
                  </div>
                  <button aria-label="Add tax category" onClick={() => openTax("new")}>
                    <Plus size={13} />
                  </button>
                </header>
                <p>Applied automatically to items assigned to each group.</p>
                <div>
                  {taxes.map((tax) => (
                    <button className="tax-category-card" onClick={() => openTax(tax)} key={tax.id}>
                      <span>
                        <b>{tax.name}</b>
                        <small>
                          {products.filter((product) => product.taxCategoryId === tax.id).length}{" "}
                          menu items
                        </small>
                      </span>
                      <strong>{tax.ratePercentage}%</strong>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
            <div className="menu-dishes">
              <div className="dish-toolbar">
                <label>
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search dishes"
                  />
                </label>
                <select
                  aria-label="Filter by tax"
                  value={taxFilter}
                  onChange={(event) => setTaxFilter(event.target.value)}
                >
                  <option value="all">All tax categories</option>
                  {taxes.map((tax) => (
                    <option value={tax.id} key={tax.id}>
                      {tax.name}
                    </option>
                  ))}
                </select>
                <button className="button button-primary" onClick={() => setDialogProduct("new")}>
                  <Plus size={15} /> Add dish
                </button>
              </div>
              <div className="dish-table-header">
                <span>Dish</span>
                <span>Category</span>
                <span>Price</span>
                <span />
              </div>
              <div className="dish-list">
                {filteredProducts.map((product, index) => {
                  const category = categories.find((item) => item.id === product.categoryId);
                  const tax = taxes.find((item) => item.id === product.taxCategoryId);
                  const primaryImage = product.images?.[0] ?? product.imageUrl;
                  return (
                    <motion.article
                      initial={{ opacity: 0, y: 7 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.025 }}
                      key={product.id}
                    >
                      <div className="dish-identity">
                        {primaryImage ? (
                          <img src={primaryImage} alt={product.name} width={62} height={62} />
                        ) : (
                          <div className="dish-image-empty">
                            <ImageIcon size={17} />
                          </div>
                        )}
                        <span>
                          <b>{product.name}</b>
                          <small>{product.description}</small>
                          {(product.images?.length ?? (product.imageUrl ? 1 : 0)) > 1 && (
                            <em>{product.images.length} images</em>
                          )}
                        </span>
                      </div>
                      <span className="dish-course">{category?.name ?? "Unsorted"}</span>
                      <span className="dish-prices">
                        <b>
                          {formatCurrency(
                            product.priceBeforeTax,
                            restaurant?.currency,
                            restaurant?.language,
                          )}
                        </b>
                        <small>
                          {formatCurrency(
                            priceAfterTax(product, taxes),
                            restaurant?.currency,
                            restaurant?.language,
                          )}{" "}
                          incl. {tax?.ratePercentage ?? 0}%
                        </small>
                      </span>
                      <span className="dish-actions">
                        <button
                          aria-label={`Edit ${product.name}`}
                          onClick={() => setDialogProduct(product)}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          aria-label={`Archive ${product.name}`}
                          onClick={() => deleteProduct(restaurantId, product.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </motion.article>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <p className="no-filter-results">No dishes match this search and tax category.</p>
                )}
              </div>
            </div>
          </motion.section>
        ) : (
          theme && (
            <motion.div
              key="appearance"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <ThemeEditor
                theme={theme}
                categories={categories}
                history={history}
                onUpdate={(patch) => updateTheme(restaurantId, patch)}
                onPublish={() => publishTheme(restaurantId)}
              />
            </motion.div>
          )
        )}
      </AnimatePresence>
      {showCategoryForm && (
        <CategoryModal
          name={categoryName}
          description={categoryDescription}
          editing={Boolean(editingCategory)}
          onName={setCategoryName}
          onDescription={setCategoryDescription}
          onClose={closeCategory}
          onSubmit={submitCategory}
          onDelete={
            editingCategory
              ? () => {
                  deleteCategory(restaurantId, editingCategory);
                  closeCategory();
                }
              : undefined
          }
        />
      )}
      {editingTax && (
        <TaxModal
          name={taxName}
          rate={taxRate}
          editing={editingTax !== "new"}
          onName={setTaxName}
          onRate={setTaxRate}
          onClose={() => setEditingTax(null)}
          onSubmit={saveTax}
        />
      )}
      {dialogProduct !== null && (
        <ProductDialog
          restaurantId={restaurantId}
          product={dialogProduct === "new" ? null : dialogProduct}
          categories={categories}
          taxes={taxes}
          onClose={() => setDialogProduct(null)}
          onSave={saveProduct}
        />
      )}
    </DashboardPanel>
  );
}

function CategoryModal({
  name,
  description,
  editing,
  onName,
  onDescription,
  onClose,
  onSubmit,
  onDelete,
}: {
  name: string;
  description: string;
  editing: boolean;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
}) {
  return (
    <GlassModal
      className="category-glass-modal"
      labelledBy="category-modal-title"
      onClose={onClose}
    >
      <form className="glass-modal-form" onSubmit={onSubmit}>
        <header className="glass-modal-header">
          <div>
            <p className="eyebrow">{editing ? "Edit category" : "New category"}</p>
            <h2 id="category-modal-title">
              {editing ? "Keep the menu clear." : "Create a useful group."}
            </h2>
            <p>Categories help guests scan the menu and find what they want quickly.</p>
          </div>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="glass-modal-body">
          <label className="auth-field">
            <span>Category name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => onName(event.target.value)}
              placeholder="e.g., Starters"
            />
          </label>
          <label className="auth-field">
            <span>Short description</span>
            <textarea
              value={description}
              onChange={(event) => onDescription(event.target.value)}
              placeholder="Optional context shown beneath the category heading."
            />
          </label>
        </div>
        <footer className="glass-modal-footer">
          {onDelete ? (
            <button type="button" className="button destructive-button" onClick={onDelete}>
              Delete category
            </button>
          ) : (
            <span />
          )}
          <div>
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button button-primary">
              {editing ? "Save category" : "Create category"}
            </button>
          </div>
        </footer>
      </form>
    </GlassModal>
  );
}

function TaxModal({
  name,
  rate,
  editing,
  onName,
  onRate,
  onClose,
  onSubmit,
}: {
  name: string;
  rate: string;
  editing: boolean;
  onName: (value: string) => void;
  onRate: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <GlassModal className="tax-glass-modal" labelledBy="tax-modal-title" onClose={onClose}>
      <form className="glass-modal-form" onSubmit={onSubmit}>
        <header className="glass-modal-header">
          <div>
            <p className="eyebrow">Tax category</p>
            <h2 id="tax-modal-title">{editing ? "Edit tax treatment." : "Add a tax group."}</h2>
            <p>Assigned dishes use this rate to calculate the guest-facing price.</p>
          </div>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="glass-modal-body tax-modal-fields">
          <label className="auth-field">
            <span>Category name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => onName(event.target.value)}
              placeholder="e.g., Standard dine-in"
            />
          </label>
          <label className="auth-field">
            <span>Rate percentage</span>
            <div className="percent-input">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={rate}
                onChange={(event) => onRate(event.target.value)}
              />
              <Percent size={15} />
            </div>
          </label>
        </div>
        <footer className="glass-modal-footer">
          <span />
          <div>
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button button-primary">Save tax category</button>
          </div>
        </footer>
      </form>
    </GlassModal>
  );
}
