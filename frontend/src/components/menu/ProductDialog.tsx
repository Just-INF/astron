import { ChangeEvent, DragEvent, FormEvent, useRef, useState } from "react";
import { GripVertical, ImagePlus, LoaderCircle, Star, Trash2, UploadCloud, X } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { uploadMedia } from "@/lib/api/client";
import type { MenuCategory, Product, TaxCategory } from "@/types";

const MAX_IMAGES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

interface ProductDialogProps {
  restaurantId: string;
  product: Product | null;
  categories: MenuCategory[];
  taxes: TaxCategory[];
  onClose: () => void;
  onSave: (input: Omit<Product, "id" | "restaurantId" | "position">) => void;
}

export function ProductDialog({
  restaurantId,
  product,
  categories,
  taxes,
  onClose,
  onSave,
}: ProductDialogProps) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [beforeTax, setBeforeTax] = useState(String(product?.priceBeforeTax ?? ""));
  const initialTaxId = product?.taxCategoryId ?? taxes[0]?.id ?? "";
  const initialTax = taxes.find((tax) => tax.id === initialTaxId)?.ratePercentage ?? 0;
  const [afterTax, setAfterTax] = useState(
    product ? (product.priceBeforeTax * (1 + initialTax / 100)).toFixed(2) : "",
  );
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? "");
  const [taxCategoryId, setTaxCategoryId] = useState(initialTaxId);
  const [images, setImages] = useState<string[]>(
    product?.images?.length ? product.images : product?.imageUrl ? [product.imageUrl] : [],
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDialogFocus(dialogRef, onClose);

  const selectedTax = taxes.find((tax) => tax.id === taxCategoryId);
  const taxRate = selectedTax?.ratePercentage ?? 0;

  function changeBefore(value: string) {
    setBeforeTax(value);
    const numeric = Number(value);
    setAfterTax(Number.isFinite(numeric) ? (numeric * (1 + taxRate / 100)).toFixed(2) : "");
  }

  function changeAfter(value: string) {
    setAfterTax(value);
    const numeric = Number(value);
    setBeforeTax(
      Number.isFinite(numeric)
        ? (numeric / (1 + taxRate / 100)).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
        : "",
    );
  }

  function changeTax(nextId: string) {
    setTaxCategoryId(nextId);
    const rate = taxes.find((tax) => tax.id === nextId)?.ratePercentage ?? 0;
    const numeric = Number(beforeTax);
    setAfterTax(Number.isFinite(numeric) ? (numeric * (1 + rate / 100)).toFixed(2) : "");
  }

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const incoming = Array.from(files);
    if (images.length + incoming.length > MAX_IMAGES) {
      setError(`A dish can have up to ${MAX_IMAGES} images. Remove one before adding more.`);
      return;
    }
    const invalid = incoming.find(
      (file) =>
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_BYTES,
    );
    if (invalid) {
      setError(`${invalid.name} must be JPG, PNG or WebP and smaller than 5 MB.`);
      return;
    }
    setUploadProgress(12);
    const encoded = await Promise.all(incoming.map((file) => uploadMedia(restaurantId, file)));
    setUploadProgress(76);
    setImages((current) => [...current, ...encoded]);
    window.setTimeout(() => setUploadProgress(null), 240);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = "";
  }
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  }
  function reorder(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setImages((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericPrice = Number(beforeTax);
    if (name.trim().length < 2) {
      setError("Every dish requires a name to display on the guest menu.");
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError("Enter a valid price for the dish.");
      return;
    }
    if (!categoryId || !taxCategoryId) {
      setError("Choose a category and tax category before saving.");
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim(),
      priceBeforeTax: numericPrice,
      categoryId,
      taxCategoryId,
      imageUrl: images[0] ?? null,
      images,
      isAvailable: product?.isAvailable ?? true,
    });
  }

  return (
    <GlassModal className="dish-glass-modal" labelledBy="dish-dialog-title" onClose={onClose}>
      <form ref={dialogRef} className="glass-modal-form" tabIndex={-1} onSubmit={submit}>
        <header className="glass-modal-header">
          <div>
            <p className="eyebrow">{product ? "Edit menu item" : "Create menu item"}</p>
            <h2 id="dish-dialog-title">
              {product ? "Refine the dish." : "Add something memorable."}
            </h2>
            <p>Build the guest-facing story, pricing and image order in one place.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dish editor">
            <X size={18} />
          </button>
        </header>
        <div className="dish-editor-layout">
          <aside className="dish-media-panel">
            <div className="modal-section-heading">
              <span>
                <ImagePlus size={16} />
              </span>
              <div>
                <h3>Dish images</h3>
                <p>Up to five. Drag thumbnails to set their display order.</p>
              </div>
            </div>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleInput}
            />
            <div
              className={`dish-upload-zone ${images.length >= MAX_IMAGES ? "full" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <UploadCloud size={22} />
              <b>{images.length >= MAX_IMAGES ? "Image limit reached" : "Drop images here"}</b>
              <span>
                {images.length >= MAX_IMAGES
                  ? "5/5 — remove one to add more"
                  : "JPG, PNG or WebP · max 5 MB each"}
              </span>
              {images.length < MAX_IMAGES && (
                <button type="button" onClick={() => fileRef.current?.click()}>
                  Browse files
                </button>
              )}
              {uploadProgress !== null && (
                <div className="upload-progress">
                  <i style={{ width: `${uploadProgress}%` }} />
                  <small>
                    <LoaderCircle className="spin" size={11} /> Uploading
                  </small>
                </div>
              )}
            </div>
            <div className="dish-image-strip">
              {images.map((image, index) => (
                <div
                  className={`dish-image-thumb ${dragIndex === index ? "dragging" : ""}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorder(index)}
                  key={`${image.slice(0, 30)}-${index}`}
                >
                  <img src={image} alt={`${name || "Dish"} image ${index + 1}`} />
                  {index === 0 && (
                    <span>
                      <Star size={9} /> Primary
                    </span>
                  )}
                  <i>
                    <GripVertical size={13} />
                  </i>
                  <button
                    type="button"
                    aria-label={`Remove image ${index + 1}`}
                    onClick={() =>
                      setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            {images.length === 0 && (
              <p className="media-empty-note">
                The first uploaded image becomes the primary cover.
              </p>
            )}
          </aside>
          <div className="dish-fields-panel">
            <div className="modal-section-heading">
              <span>01</span>
              <div>
                <h3>Guest-facing details</h3>
                <p>Keep names clear and descriptions useful.</p>
              </div>
            </div>
            <label className="auth-field" htmlFor="dish-name">
              <span>Dish name</span>
              <input
                id="dish-name"
                autoFocus
                value={name}
                placeholder="e.g., Charred Octopus, Salsa Verde"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="auth-field" htmlFor="dish-description">
              <span>Description</span>
              <textarea
                id="dish-description"
                value={description}
                placeholder="Ingredients, preparation and a short sensory note."
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="dish-dialog-grid">
              <label className="auth-field">
                <span>Menu category</span>
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  {categories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="auth-field">
                <span>Tax category</span>
                <select value={taxCategoryId} onChange={(event) => changeTax(event.target.value)}>
                  {taxes.map((tax) => (
                    <option value={tax.id} key={tax.id}>
                      {tax.name} · {tax.ratePercentage}%
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="linked-price-fields">
              <label className="auth-field">
                <span>Price before tax</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={beforeTax}
                  placeholder="24.50"
                  onChange={(event) => changeBefore(event.target.value)}
                />
              </label>
              <span>↔</span>
              <label className="auth-field">
                <span>Price after tax</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={afterTax}
                  disabled={!selectedTax}
                  placeholder="29.16"
                  onChange={(event) => changeAfter(event.target.value)}
                />
              </label>
            </div>
            <p className="tax-calculation-note">
              {selectedTax
                ? `${selectedTax.name} · ${taxRate}% applied. Edit either price and the other updates instantly.`
                : "Assign a tax category to see price after tax."}
            </p>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="glass-modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" type="submit">
            {product ? "Save changes" : "Add dish"}
          </button>
        </footer>
      </form>
    </GlassModal>
  );
}
