import { Check, Copy, KeyRound, RefreshCw, ServerCog, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, api, type McpKey } from "@/lib/api/client";
import { useAuthStore } from "@/stores/useAuthStore";

export function McpSettings() {
  const restaurantId = useAuthStore((state) => state.currentUser?.activeRestaurantId ?? "");
  const [keys, setKeys] = useState<McpKey[]>([]),
    [newToken, setNewToken] = useState<string | null>(null),
    [name, setName] = useState("My MCP client"),
    [copied, setCopied] = useState(false),
    [error, setError] = useState<string | null>(null),
    [activeSnippet, setActiveSnippet] = useState("Claude Desktop");
  const endpoint = `${API_BASE_URL}/mcp`;
  const token = newToken ?? "<ASTRON_MCP_KEY>";
  const snippets = useMemo(
    () => ({
      "Claude Desktop": JSON.stringify(
        {
          mcpServers: {
            astron: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2,
      ),
      Cursor: JSON.stringify(
        {
          mcpServers: { astron: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } },
        },
        null,
        2,
      ),
      "HTTP request": `POST ${endpoint}\nAuthorization: Bearer ${token}\nContent-Type: application/json\n\n{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`,
    }),
    [endpoint, token],
  );
  useEffect(() => {
    if (restaurantId)
      void api
        .mcpKeys(restaurantId)
        .then(setKeys)
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Could not load MCP keys."),
        );
  }, [restaurantId]);
  async function createKey() {
    setError(null);
    try {
      const created = await api.createMcpKey(restaurantId, name);
      setKeys((current) => [created, ...current]);
      setNewToken(created.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the key.");
    }
  }
  async function revoke(keyId: string) {
    setError(null);
    try {
      await api.revokeMcpKey(restaurantId, keyId);
      setKeys((current) => current.filter((key) => key.id !== keyId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke the key.");
    }
  }
  async function copy(value = snippets[activeSnippet as keyof typeof snippets]) {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <section className="mcp-settings">
      <header className="module-page-heading">
        <p className="eyebrow">AI and integrations</p>
        <h1>
          Nora’s tools,
          <br />
          <em>available securely.</em>
        </h1>
        <p>
          Connect trusted MCP clients to this restaurant. Read tools return bounded data; write
          tools create proposals that must be approved in Nora before they execute.
        </p>
      </header>
      <div className="mcp-status">
        <span>
          <i /> Streamable HTTP active
        </span>
        <p>Tenant-scoped · approval-controlled writes</p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="mcp-card">
        <div className="mcp-card-heading">
          <div>
            <ServerCog size={19} />
            <div>
              <p className="eyebrow">Connection</p>
              <h2>Credentials manager</h2>
            </div>
          </div>
          <span>MCP 2025-03-26</span>
        </div>
        <dl>
          <div>
            <dt>Endpoint URL</dt>
            <dd>
              <code>{endpoint}</code>
              <button onClick={() => void copy(endpoint)} aria-label="Copy endpoint">
                <Copy size={14} />
              </button>
            </dd>
          </div>
          {newToken && (
            <div>
              <dt>New key - copy it now; it will not be shown again</dt>
              <dd>
                <code>{newToken}</code>
                <button onClick={() => void copy(newToken)} aria-label="Copy MCP key">
                  <KeyRound size={14} />
                </button>
              </dd>
            </div>
          )}
        </dl>
        <footer>
          <label className="auth-field">
            <span>Credential name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          </label>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void createKey()}
            disabled={name.trim().length < 2}
          >
            <RefreshCw size={14} /> Generate key
          </button>
        </footer>
      </section>
      <section className="mcp-directory">
        <p className="eyebrow">Active credentials</p>
        {keys.length ? (
          keys.map((key) => (
            <article key={key.id}>
              <code>{key.tokenPrefix}</code>
              <span>
                {key.name}
                <br />
                {key.lastUsedAt
                  ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}`
                  : "Not used yet"}
              </span>
              <button
                type="button"
                onClick={() => void revoke(key.id)}
                aria-label={`Revoke ${key.name}`}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))
        ) : (
          <article>
            <code>No keys</code>
            <span>Generate a credential when you are ready to connect a client.</span>
          </article>
        )}
      </section>
      <section className="mcp-directory">
        <p className="eyebrow">Available behavior</p>
        {[
          [
            "get_*",
            "Reads only the requested menu, floor, reservation, analytics or restaurant data.",
          ],
          ["propose_*", "Creates a pending change; it cannot edit Astron directly."],
          [
            "Approve in Nora",
            "The authenticated user reviews and applies or rejects each proposed change.",
          ],
        ].map(([tool, description]) => (
          <article key={tool}>
            <code>{tool}</code>
            <span>{description}</span>
          </article>
        ))}
      </section>
      <section className="mcp-snippets">
        <div>
          <p className="eyebrow">Configuration examples</p>
          <h2>Connect your client.</h2>
          <div className="mcp-tabs">
            {Object.keys(snippets).map((snippetName) => (
              <button
                className={activeSnippet === snippetName ? "active" : ""}
                type="button"
                key={snippetName}
                onClick={() => setActiveSnippet(snippetName)}
              >
                {snippetName}
              </button>
            ))}
          </div>
        </div>
        <div>
          <pre aria-label={`${activeSnippet} configuration`}>
            {snippets[activeSnippet as keyof typeof snippets]}
          </pre>
          <button className="button" type="button" onClick={() => void copy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy configuration"}
          </button>
        </div>
      </section>
    </section>
  );
}
