import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, LoaderCircle } from "lucide-react";
import { PublicMenu } from "@/components/menu/PublicMenu";
import { api } from "@/lib/api/client";

export default function PublishedMenuPage() {
  const { restaurantId = "", tableNumber } = useParams();
  const [searchParams] = useSearchParams();
  const isDraftPreview = searchParams.get("preview") === "draft";
  const query = useQuery({
    queryKey: [isDraftPreview ? "draft-menu" : "public-menu", restaurantId],
    queryFn: () => (isDraftPreview ? api.menu(restaurantId) : api.publicMenu(restaurantId)),
    retry: 1,
  });
  if (query.isPending)
    return (
      <main className="public-menu-loading">
        <LoaderCircle className="spin" size={20} /> Opening menu
      </main>
    );
  if (query.isError || !query.data)
    return (
      <main className="public-menu-unavailable">
        <span>
          <BookOpenText size={23} />
        </span>
        <p>Guest menu</p>
        <h1>This menu isn&apos;t live.</h1>
        <small>
          {query.error instanceof Error
            ? query.error.message
            : "The restaurant may still be preparing its next published version."}
        </small>
        <button className="button button-primary" onClick={() => query.refetch()}>
          Retry
        </button>
      </main>
    );
  const data = query.data;
  return (
    <PublicMenu
      restaurant={data.restaurant}
      theme={data.theme}
      categories={data.categories}
      products={data.products}
      taxes={data.taxCategories}
      tableCode={isDraftPreview ? undefined : tableNumber}
    />
  );
}
