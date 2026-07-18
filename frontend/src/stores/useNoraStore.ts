import { create } from "zustand";
import type { NoraConversationSummary, NoraProposal } from "@/lib/api/client";

export type NoraMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  proposals?: NoraProposal[];
  streaming?: boolean;
};
type NoraState = {
  isOpen: boolean;
  activeConversationIds: Record<string, string>;
  sessions: Record<string, NoraConversationSummary[]>;
  messages: Record<string, NoraMessage[]>;
};
type NoraActions = {
  setOpen: (isOpen: boolean) => void;
  setSessions: (restaurantId: string, sessions: NoraConversationSummary[]) => void;
  activateConversation: (restaurantId: string, conversationId: string) => void;
  hydrateConversation: (conversationId: string, messages: NoraMessage[]) => void;
  addMessage: (conversationId: string, message: NoraMessage) => void;
  appendMessage: (conversationId: string, messageId: string, delta: string) => void;
  resetMessage: (conversationId: string, messageId: string) => void;
  finishMessage: (
    conversationId: string,
    messageId: string,
    content: string,
    proposals: NoraProposal[],
  ) => void;
  resolveProposal: (
    conversationId: string,
    proposalId: string,
    status: NoraProposal["status"],
  ) => void;
  touchSession: (
    restaurantId: string,
    conversationId: string,
    input: string,
    preview?: string,
  ) => void;
  removeSession: (restaurantId: string, conversationId: string) => void;
};

export const useNoraStore = create<NoraState & NoraActions>()((set) => ({
  isOpen: false,
  activeConversationIds: {},
  sessions: {},
  messages: {},
  setOpen: (isOpen) => set({ isOpen }),
  setSessions: (restaurantId, sessions) =>
    set((state) => ({ sessions: { ...state.sessions, [restaurantId]: sessions } })),
  activateConversation: (restaurantId, conversationId) =>
    set((state) => ({
      activeConversationIds: { ...state.activeConversationIds, [restaurantId]: conversationId },
    })),
  hydrateConversation: (conversationId, messages) =>
    set((state) => ({ messages: { ...state.messages, [conversationId]: messages } })),
  addMessage: (conversationId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] ?? []), message],
      },
    })),
  appendMessage: (conversationId, messageId, delta) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] ?? []).map((message) =>
          message.id === messageId ? { ...message, content: message.content + delta } : message,
        ),
      },
    })),
  resetMessage: (conversationId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] ?? []).map((message) =>
          message.id === messageId ? { ...message, content: "" } : message,
        ),
      },
    })),
  finishMessage: (conversationId, messageId, content, proposals) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] ?? []).map((message) =>
          message.id === messageId ? { ...message, content, proposals, streaming: false } : message,
        ),
      },
    })),
  resolveProposal: (conversationId, proposalId, status) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] ?? []).map((message) => ({
          ...message,
          proposals: message.proposals?.map((proposal) =>
            proposal.id === proposalId ? { ...proposal, status } : proposal,
          ),
        })),
      },
    })),
  touchSession: (restaurantId, conversationId, input, preview) =>
    set((state) => {
      const current = state.sessions[restaurantId] ?? [],
        existing = current.find((session) => session.id === conversationId),
        now = new Date().toISOString();
      const title =
        existing && existing.messageCount > 0
          ? existing.title
          : input.length > 48
            ? `${input.slice(0, 48).trimEnd()}…`
            : input;
      const next: NoraConversationSummary = {
        id: conversationId,
        title,
        preview: preview ?? input,
        messageCount: (existing?.messageCount ?? 0) + (preview ? 2 : 0),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      return {
        sessions: {
          ...state.sessions,
          [restaurantId]: [next, ...current.filter((session) => session.id !== conversationId)],
        },
      };
    }),
  removeSession: (restaurantId, conversationId) =>
    set((state) => {
      const remaining = (state.sessions[restaurantId] ?? []).filter(
          (session) => session.id !== conversationId,
        ),
        messages = { ...state.messages };
      delete messages[conversationId];
      return {
        sessions: { ...state.sessions, [restaurantId]: remaining },
        messages,
        activeConversationIds: {
          ...state.activeConversationIds,
          [restaurantId]:
            state.activeConversationIds[restaurantId] === conversationId
              ? (remaining[0]?.id ?? "")
              : state.activeConversationIds[restaurantId],
        },
      };
    }),
}));
