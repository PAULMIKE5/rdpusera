"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Send, MessageCircle, RefreshCw } from "lucide-react";
import { api } from "./workspace";
import { UserPicker } from "./user-picker";
type Message = {
  id: string;
  body: string;
  senderRole: string;
  createdAt: string;
};
type Thread = {
  id: string;
  userId: string;
  adminReadAt: string | null;
  user: { name: string; email: string };
  messages: Message[];
};
export function ChatPanel({ admin = false }: { admin?: boolean }) {
  const [userId, setUserId] = useState(""),
    [threads, setThreads] = useState<Thread[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [hasMore, setHasMore] = useState(false),
    [older, setOlder] = useState<Message[]>([]),
    [page, setPage] = useState(0),
    [pages, setPages] = useState(1),
    [q, setQ] = useState("");
  const draftKey = useRef<string | null>(null),
    generation = useRef(0),
    latestRead = useRef(""),
    historyLoaded = useRef(false),
    scrollBox = useRef<HTMLDivElement>(null),
    followLatest = useRef(true);
  const load = useCallback(async () => {
    const gen = generation.current;
    if (admin) {
      const r = await api(`chat?page=${page}&q=${encodeURIComponent(q)}`);
      if (gen !== generation.current) return;
      setThreads(r.threads);
      setPages(r.pages);
    }
    if (!admin || userId) {
      const r = await api(
        `chat${admin ? `?userId=${encodeURIComponent(userId)}` : ""}`,
      );
      if (gen !== generation.current) return;
      setMessages(r.messages);
      if (!historyLoaded.current) setHasMore(r.hasMore);
      setError("");
      const last = r.messages.at(-1)?.id;
      if (
        last &&
        latestRead.current !== last &&
        document.visibilityState === "visible"
      ) {
        await api("chat", {
          action: "read",
          userId: admin ? userId : undefined,
          messageId: last,
        });
        latestRead.current = last;
      }
    }
  }, [admin, userId, page, q]);
  useEffect(() => {
    let mounted = true,
      pending = false;
    const tick = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        await load();
      } catch (e) {
        if (mounted) setError((e as Error).message);
      } finally {
        pending = false;
      }
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    if (followLatest.current && scrollBox.current)
      scrollBox.current.scrollTop = scrollBox.current.scrollHeight;
  }, [messages]);
  function select(id: string) {
    generation.current++;
    setUserId(id);
    setMessages([]);
    setOlder([]);
    setText("");
    latestRead.current = "";
    historyLoaded.current = false;
    followLatest.current = true;
    draftKey.current = null;
  }
  const all = [
    ...new Map([...older, ...messages].map((m) => [m.id, m])).values(),
  ];
  return (
    <div
      className={
        admin ? "grid lg:grid-cols-[280px_minmax(0,1fr)] gap-5" : "max-w-4xl"
      }
    >
      {admin && (
        <aside className="panel p-4 space-y-4">
          <h2 className="text-lg">Inbox</h2>
          <UserPicker
            value={userId}
            onChange={select}
            label="Start a conversation"
          />
          <label>
            Search conversations
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <div className="space-y-2">
            {threads.map((t) => {
              const last = t.messages[0];
              const unread =
                last &&
                last.senderRole === "USER" &&
                (!t.adminReadAt || last.createdAt > t.adminReadAt);
              return (
                <button
                  key={t.id}
                  onClick={() => select(t.userId)}
                  className={`w-full text-left p-3 rounded-xl border ${userId === t.userId ? "border-lime-300 bg-lime-300/10" : "border-white/10"}`}
                >
                  <span className="block truncate">
                    {t.user.name || t.user.email}
                    {unread && <span className="text-lime-300"> • New</span>}
                  </span>
                  <small className="muted block truncate">{last?.body}</small>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              {page + 1}/{pages}
            </span>
            <button
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </aside>
      )}
      <section className="panel min-w-0 flex flex-col">
        <div className="p-5 border-b border-white/10 flex justify-between">
          <div>
            <h2 className="flex items-center gap-2">
              <MessageCircle size={20} />{" "}
              {admin ? "Customer conversation" : "Talk to support"}
            </h2>
            <p className="muted text-xs mt-2">
              Messages refresh every 5 seconds. Replies remain here when you
              return.
            </p>
          </div>
          <button
            aria-label="Refresh messages"
            className="icon-button"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <div
          className="h-[420px] overflow-y-auto p-5 space-y-4"
          ref={scrollBox}
          onScroll={() => {
            const el = scrollBox.current;
            if (el)
              followLatest.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
          role="log"
          aria-label="Conversation"
          aria-live="polite"
        >
          {(!admin || userId) && hasMore && !older.length && (
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const r = await api(
                    `chat?${admin ? `userId=${encodeURIComponent(userId)}&` : ""}before=${all[0].id}`,
                  );
                  historyLoaded.current = true;
                  setOlder(r.messages);
                  setHasMore(r.hasMore);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Load earlier messages
            </button>
          )}
          {older.length > 0 && hasMore && (
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const r = await api(
                    `chat?${admin ? `userId=${encodeURIComponent(userId)}&` : ""}before=${all[0].id}`,
                  );
                  setOlder((v) => [...r.messages, ...v]);
                  setHasMore(r.hasMore);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Load earlier messages
            </button>
          )}
          {!all.length && (
            <p className="muted text-sm">
              {admin && !userId
                ? "Select a customer to read or send messages."
                : "Send a message to start. Do not share passwords or payment keys here."}
            </p>
          )}
          {all.map((m) => (
            <article
              key={m.id}
              className={`max-w-[90%] rounded-2xl p-4 ${m.senderRole === (admin ? "ADMIN" : "USER") ? "ml-auto bg-lime-200/10 border border-lime-200/20" : "bg-white/5"}`}
            >
              <p className="text-xs muted mb-2">
                {m.senderRole === "SYSTEM"
                  ? "Server update"
                  : m.senderRole === "ADMIN"
                    ? "Support"
                    : "Customer"}{" "}
                · {new Date(m.createdAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {m.body}
              </p>
              {m.senderRole === "SYSTEM" && (
                <Link
                  className="text-lime-200 text-sm"
                  href="/dashboard/instances"
                >
                  View my instances →
                </Link>
              )}
            </article>
          ))}
        </div>
        <form
          className="p-4 border-t border-white/10"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              draftKey.current ??= crypto.randomUUID();
              await api("chat", {
                userId: admin ? userId : undefined,
                body: text,
                requestKey: draftKey.current,
              });
              setText("");
              draftKey.current = null;
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="message-text">
            Message
          </label>
          <textarea
            id="message-text"
            className="chat-input"
            value={text}
            maxLength={4000}
            onChange={(e) => {
              setText(e.target.value);
              draftKey.current = null;
            }}
            placeholder="Write a message…"
            rows={3}
            required
            disabled={busy || (admin && !userId)}
          />
          <div className="flex justify-between items-center mt-3">
            <small className="muted">{text.length}/4000</small>
            <button
              className="primary"
              disabled={busy || !text.trim() || (admin && !userId)}
            >
              <Send size={16} />
              {busy ? "Sending…" : "Send message"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-amber-200 text-sm mt-3">
              {error}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
