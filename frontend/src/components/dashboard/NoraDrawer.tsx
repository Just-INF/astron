import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  Check,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  PanelLeft,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, type NoraConversation, type NoraProposal } from "@/lib/api/client";
import { queryClient } from "@/lib/queryClient";
import { useDialogFocusSelector } from "@/lib/useDialogFocus";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNoraStore, type NoraMessage } from "@/stores/useNoraStore";

const actionTitles: Record<string, string> = {
  "create.category": "Add menu category",
  "update.category": "Update menu category",
  "delete.category": "Delete menu category",
  "create.tax.category": "Add tax category",
  "update.tax.category": "Update tax category",
  "delete.tax.category": "Delete tax category",
  "create.menu.item": "Add menu item",
  "update.menu.item": "Update menu item",
  "delete.menu.item": "Delete menu item",
  "create.table": "Add table",
  "update.table": "Update table",
  "delete.table": "Delete table",
  "create.reservation": "Create reservation",
  "update.reservation": "Update reservation",
  "reschedule.reservation": "Reschedule reservation",
  "cancel.reservation": "Cancel reservation",
  "update.reservation.settings": "Update booking settings",
  "update.restaurant": "Update restaurant settings",
};
const suggestionGroups = [
  { label: "Understand", items: ["Show tonight’s operations", "Which menu items perform best?"] },
  { label: "Prepare", items: ["Build a Pizza category", "Create a reservation"] },
  { label: "Guide", items: ["How do I publish my menu?", "Help me improve table flow"] },
];

function displayValue(value: unknown): string {
  return typeof value === "boolean"
    ? value
      ? "Enabled"
      : "Disabled"
    : typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(\*\*.+?\*\*|`.+?`|\*[^*\n]+?\*|\/(?:dashboard|account)(?:\/[A-Za-z0-9_-]+)+)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={index}>{part.slice(1, -1)}</code>;
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={index}>{part.slice(1, -1)}</em>;
      if (part.startsWith("/dashboard/") || part.startsWith("/account/"))
        return (
          <a key={index} href={part}>
            {part}
          </a>
        );
      return part;
    });
}

function NoraContent({ content }: { content: string }) {
  const blocks: ReactNode[] = [],
    lines = content.split(/\r?\n/);
  let bullets: string[] = [];
  function flushBullets(key: number) {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`list_${key}`}>
        {bullets.map((bullet, index) => (
          <li key={index}>{renderInlineMarkdown(bullet)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  }
  lines.forEach((line, index) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets(index);
    if (line.trim())
      blocks.push(<p key={`paragraph_${index}`}>{renderInlineMarkdown(line.trim())}</p>);
  });
  flushBullets(lines.length);
  return <div className="nora-message-content">{blocks}</div>;
}

function hydrateMessages(conversation: NoraConversation): NoraMessage[] {
  const messages = conversation.messages.map((message) => ({
    ...message,
    role: message.role as "user" | "assistant",
  })) as NoraMessage[];
  if (conversation.proposals.length) {
    const index = messages.findLastIndex((message) => message.role === "assistant");
    if (index >= 0) messages[index] = { ...messages[index], proposals: conversation.proposals };
    else
      messages.push({
        id: `proposals_${conversation.id}`,
        role: "assistant",
        content: "These changes are attached to this conversation.",
        createdAt: conversation.updatedAt,
        proposals: conversation.proposals,
      });
  }
  return messages;
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function ProposalCard({
  proposal,
  restaurantId,
  conversationId,
}: {
  proposal: NoraProposal;
  restaurantId: string;
  conversationId: string;
}) {
  const resolveProposal = useNoraStore((state) => state.resolveProposal);
  const [isExecuting, setIsExecuting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const disabled = proposal.status !== "pending" || isExecuting;
  async function confirm() {
    setIsExecuting(true);
    setError(null);
    try {
      const resolved = await api.noraConfirmProposal(restaurantId, proposal.id);
      resolveProposal(conversationId, proposal.id, resolved.status);
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change could not be applied.");
    } finally {
      setIsExecuting(false);
    }
  }
  async function reject() {
    setIsExecuting(true);
    setError(null);
    try {
      const resolved = await api.noraRejectProposal(restaurantId, proposal.id);
      resolveProposal(conversationId, proposal.id, resolved.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The proposal could not be rejected.");
    } finally {
      setIsExecuting(false);
    }
  }
  const warning =
    proposal.action === "delete.category"
      ? "This archives the category and every active menu item in it."
      : proposal.action === "delete.menu.item"
        ? "This archives the item and removes it from the live menu."
        : proposal.action === "delete.tax.category"
          ? "This fails if an active menu item still uses the tax category."
          : proposal.action === "delete.table"
            ? "Tables with reservation or order history must be unlinked instead."
            : proposal.action === "cancel.reservation"
              ? "The guest is emailed when an address is available."
              : null;
  return (
    <section className={`nora-proposal ${proposal.status}`}>
      <div className="nora-proposal-heading">
        <span>{actionTitles[proposal.action] ?? proposal.action}</span>
        {proposal.status === "executed" && (
          <b>
            <Check size={12} /> Applied
          </b>
        )}
        {proposal.status === "rejected" && (
          <b>
            <XCircle size={12} /> Rejected
          </b>
        )}
        {proposal.status === "failed" && (
          <b>
            <XCircle size={12} /> Failed
          </b>
        )}
      </div>
      {warning && <p className="nora-proposal-warning">{warning}</p>}
      <dl>
        {Object.entries(proposal.payload)
          .filter(([label]) => !/(^id$|Id$)/.test(label))
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label.replace(/([A-Z])/g, " $1")}</dt>
              <dd>{displayValue(value)}</dd>
            </div>
          ))}
      </dl>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {proposal.status === "pending" && (
        <footer>
          <button type="button" onClick={() => void reject()} disabled={disabled}>
            Reject
          </button>
          <button type="button" onClick={() => void confirm()} disabled={disabled}>
            {isExecuting ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{" "}
            Approve
          </button>
        </footer>
      )}
    </section>
  );
}

export function NoraDrawer() {
  const currentUser = useAuthStore((state) => state.currentUser),
    restaurants = useAuthStore((state) => state.restaurants);
  const isOpen = useNoraStore((state) => state.isOpen),
    setOpen = useNoraStore((state) => state.setOpen);
  const activeIds = useNoraStore((state) => state.activeConversationIds),
    sessionMap = useNoraStore((state) => state.sessions),
    messageMap = useNoraStore((state) => state.messages);
  const setSessions = useNoraStore((state) => state.setSessions),
    activateConversation = useNoraStore((state) => state.activateConversation),
    hydrateConversation = useNoraStore((state) => state.hydrateConversation);
  const addMessage = useNoraStore((state) => state.addMessage),
    appendMessage = useNoraStore((state) => state.appendMessage),
    resetMessage = useNoraStore((state) => state.resetMessage),
    finishMessage = useNoraStore((state) => state.finishMessage),
    touchSession = useNoraStore((state) => state.touchSession),
    removeSession = useNoraStore((state) => state.removeSession);
  const [draft, setDraft] = useState(""),
    [isSending, setIsSending] = useState(false),
    [activity, setActivity] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [showSessions, setShowSessions] = useState(false),
    [showLatest, setShowLatest] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    closeRef = useRef<HTMLButtonElement>(null),
    logRef = useRef<HTMLDivElement>(null),
    followOutput = useRef(true);
  const activeRestaurant = restaurants.find(
      (restaurant) => restaurant.id === currentUser?.activeRestaurantId,
    ),
    restaurantId = activeRestaurant?.id ?? "";
  const sessions = sessionMap[restaurantId] ?? [],
    conversationId = activeIds[restaurantId] ?? "",
    messages = useMemo(() => messageMap[conversationId] ?? [], [conversationId, messageMap]);
  const closeDrawer = useCallback(() => setOpen(false), [setOpen]);
  useDialogFocusSelector(".nora-drawer", closeDrawer, isOpen);

  const loadConversation = useCallback(
    async (id: string) => {
      const conversation = await api.noraConversation(restaurantId, id);
      hydrateConversation(id, hydrateMessages(conversation));
    },
    [hydrateConversation, restaurantId],
  );

  useEffect(() => {
    if (!isOpen || !restaurantId) return;
    let active = true;
    void (async () => {
      try {
        let list = await api.noraConversations(restaurantId);
        if (!list.length) list = [await api.createNoraConversation(restaurantId)];
        if (!active) return;
        setSessions(restaurantId, list);
        const preferred = useNoraStore.getState().activeConversationIds[restaurantId],
          selected = list.some((session) => session.id === preferred) ? preferred : list[0].id;
        activateConversation(restaurantId, selected);
        await loadConversation(selected);
      } catch (cause) {
        if (active)
          setError(cause instanceof Error ? cause.message : "Nora could not load conversations.");
      }
    })();
    return () => {
      active = false;
    };
  }, [activateConversation, isOpen, loadConversation, restaurantId, setSessions]);

  useEffect(() => {
    if (!followOutput.current) return;
    const frame = requestAnimationFrame(() => {
      const log = logRef.current;
      if (log) log.scrollTop = log.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, activity]);

  function onScroll() {
    const log = logRef.current;
    if (!log) return;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 56;
    followOutput.current = nearBottom;
    setShowLatest(!nearBottom);
  }

  async function selectConversation(id: string) {
    if (id === conversationId || isSending) return;
    setError(null);
    setShowSessions(false);
    followOutput.current = true;
    setShowLatest(false);
    activateConversation(restaurantId, id);
    try {
      await loadConversation(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Conversation could not be loaded.");
    }
  }

  async function createConversation() {
    if (isSending) return;
    setError(null);
    try {
      const created = await api.createNoraConversation(restaurantId);
      setSessions(restaurantId, [
        created,
        ...(useNoraStore.getState().sessions[restaurantId] ?? []),
      ]);
      activateConversation(restaurantId, created.id);
      hydrateConversation(created.id, []);
      setShowSessions(false);
      followOutput.current = true;
      window.setTimeout(() => inputRef.current?.focus(), 50);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A new conversation could not be created.");
    }
  }

  async function deleteConversation(id: string) {
    if (isSending) return;
    setError(null);
    try {
      await api.deleteNoraConversation(restaurantId, id);
      const next = sessions.find((session) => session.id !== id);
      removeSession(restaurantId, id);
      if (conversationId === id) {
        if (next) {
          activateConversation(restaurantId, next.id);
          await loadConversation(next.id);
        } else await createConversation();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The conversation could not be deleted.");
    }
  }

  async function send(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const input = (suggested ?? draft).trim();
    if (!input || !restaurantId || !conversationId || isSending) return;
    setDraft("");
    setError(null);
    setActivity("Connecting to Nora");
    setIsSending(true);
    addMessage(conversationId, {
      id: `local_${crypto.randomUUID()}`,
      role: "user",
      content: input,
      createdAt: new Date().toISOString(),
    });
    touchSession(restaurantId, conversationId, input);
    let assistantId = `stream_${crypto.randomUUID()}`;
    try {
      await api.noraChatStream(restaurantId, input, conversationId, (streamEvent) => {
        if (streamEvent.type === "assistant_start") {
          assistantId = streamEvent.id;
          addMessage(conversationId, {
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: streamEvent.createdAt,
            streaming: true,
          });
        } else if (streamEvent.type === "activity") setActivity(streamEvent.label);
        else if (streamEvent.type === "delta") {
          setActivity(null);
          appendMessage(conversationId, assistantId, streamEvent.delta);
        } else if (streamEvent.type === "reset") resetMessage(conversationId, assistantId);
        else if (streamEvent.type === "done") {
          setActivity(null);
          finishMessage(
            conversationId,
            assistantId,
            streamEvent.message.content,
            streamEvent.proposals,
          );
          touchSession(restaurantId, conversationId, input, streamEvent.message.content);
        }
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Nora could not answer right now.";
      setError(message);
      setActivity(null);
      finishMessage(
        conversationId,
        assistantId,
        "I lost the connection before finishing that response. Please try again.",
        [],
      );
    } finally {
      setIsSending(false);
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function jumpToLatest() {
    followOutput.current = true;
    setShowLatest(false);
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            className="nora-scrim"
            aria-label="Close Nora"
            onClick={closeDrawer}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="nora-drawer nora-workspace"
            aria-label="Nora restaurant assistant"
            aria-modal="true"
            role="dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <header className="nora-workspace-header">
              <button
                className="nora-session-toggle"
                type="button"
                aria-label="Show conversations"
                onClick={() => setShowSessions((value) => !value)}
              >
                <PanelLeft size={17} />
              </button>
              <div className="nora-identity">
                <span className="nora-brand-mark">
                  <Sparkles size={15} />
                </span>
                <div>
                  <h2>Nora</h2>
                  <p>Operations copilot for {activeRestaurant?.name ?? "your restaurant"}</p>
                </div>
              </div>
              <span className="nora-context-chip">
                <i /> Connected to live restaurant data
              </span>
              <button
                ref={closeRef}
                className="nora-close"
                type="button"
                aria-label="Close Nora"
                onClick={closeDrawer}
              >
                <X size={18} />
              </button>
            </header>

            <div className="nora-workbench">
              <aside className={`nora-sessions ${showSessions ? "open" : ""}`}>
                <div className="nora-sessions-heading">
                  <span>Conversations</span>
                  <button
                    type="button"
                    onClick={() => void createConversation()}
                    aria-label="New conversation"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <div className="nora-session-list">
                  {sessions.map((session) => (
                    <article
                      className={session.id === conversationId ? "active" : ""}
                      key={session.id}
                    >
                      <button
                        className="nora-session-main"
                        type="button"
                        onClick={() => void selectConversation(session.id)}
                        disabled={isSending}
                      >
                        <span>
                          <MessageSquare size={13} />
                          {session.title}
                        </span>
                        <small>{session.preview}</small>
                        <time>
                          <Clock3 size={11} /> {relativeTime(session.updatedAt)}
                        </time>
                      </button>
                      <button
                        className="nora-session-delete"
                        type="button"
                        onClick={() => void deleteConversation(session.id)}
                        aria-label={`Delete ${session.title}`}
                        disabled={isSending}
                      >
                        <Trash2 size={13} />
                      </button>
                    </article>
                  ))}
                </div>
                <div className="nora-sessions-foot">
                  <LockKeyhole size={14} />
                  <p>
                    <b>You stay in control</b>
                    <span>Every write waits for your approval.</span>
                  </p>
                </div>
              </aside>

              <section className="nora-conversation">
                <div className="nora-conversation-bar">
                  <div>
                    <span>Current thread</span>
                    <b>
                      {sessions.find((session) => session.id === conversationId)?.title ??
                        "New conversation"}
                    </b>
                  </div>
                  <p>
                    <i /> Read, reason, then propose
                  </p>
                </div>
                <div className="nora-log" ref={logRef} onScroll={onScroll} aria-live="polite">
                  {!messages.length && (
                    <section className="nora-empty-thread">
                      <p className="eyebrow">Restaurant intelligence</p>
                      <h3>What would you like to move forward?</h3>
                      <p>
                        Nora can inspect live operations, explain workflows, and prepare safe
                        changes. Nothing is applied until you approve it.
                      </p>
                      <div className="nora-task-groups">
                        {suggestionGroups.map((group) => (
                          <section key={group.label}>
                            <b>{group.label}</b>
                            {group.items.map((suggestion) => (
                              <button
                                type="button"
                                key={suggestion}
                                onClick={() => void send(undefined, suggestion)}
                              >
                                <span>{suggestion}</span>
                                <ArrowDown size={12} />
                              </button>
                            ))}
                          </section>
                        ))}
                      </div>
                    </section>
                  )}
                  {messages.map((message, index) => (
                    <motion.article
                      className={`nora-message-row ${message.role} ${message.streaming ? "streaming" : ""}`}
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.018, 0.12) }}
                    >
                      <div className="nora-message-meta">
                        <span>{message.role === "assistant" ? "Nora" : "You"}</span>
                        <time>
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      {message.content ? (
                        <NoraContent content={message.content} />
                      ) : (
                        message.streaming && (
                          <div className="nora-stream-shell">
                            <i />
                            <i />
                            <i />
                          </div>
                        )
                      )}
                      {message.streaming && message.content && (
                        <span className="nora-stream-caret" aria-hidden="true" />
                      )}
                      {message.proposals?.map((proposal) => (
                        <ProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          restaurantId={restaurantId}
                          conversationId={conversationId}
                        />
                      ))}
                    </motion.article>
                  ))}
                  {isSending && activity && (
                    <div className="nora-activity">
                      <span>
                        <i />
                        <i />
                        <i />
                      </span>
                      {activity}
                    </div>
                  )}
                </div>
                <AnimatePresence>
                  {showLatest && (
                    <motion.button
                      className="nora-jump-latest"
                      type="button"
                      onClick={jumpToLatest}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                    >
                      <ArrowDown size={14} /> New output
                    </motion.button>
                  )}
                </AnimatePresence>
                {error && (
                  <p className="nora-error" role="alert">
                    {error}
                  </p>
                )}
                <form className="nora-composer" onSubmit={(event) => void send(event)}>
                  <div className="nora-composer-box">
                    <textarea
                      ref={inputRef}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder="Ask Nora to inspect, explain, or prepare a change…"
                      disabled={isSending}
                      rows={2}
                    />
                    <button
                      aria-label="Send message"
                      type="submit"
                      disabled={isSending || !draft.trim()}
                    >
                      {isSending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
                    </button>
                  </div>
                  <p>
                    <span>
                      <LockKeyhole size={11} /> Changes always require approval
                    </span>
                    <span>Enter to send · Shift+Enter for a new line</span>
                  </p>
                </form>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
