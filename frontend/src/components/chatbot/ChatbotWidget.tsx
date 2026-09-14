import { useState } from "react";
import { HelpCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MarkdownMessage from "@/components/chatbot/MarkdownMessage";
import { streamChat } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    // Bulle vide affichee tout de suite : elle se remplit au fil du flux.
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    try {
      await streamChat(next, {
        onToken: (token) =>
          setMessages((current) => {
            const updated = [...current];
            const last = updated[updated.length - 1];
            if (!last) return current;
            updated[updated.length - 1] = { ...last, content: last.content + token };
            return updated;
          }),
      });
    } catch (e) {
      const err = e as Error;
      const friendly =
        err.message.toLowerCase().includes("ollama") || err.message.toLowerCase().includes("pas demarre")
          ? "Le service d'assistant n'est pas disponible (Ollama). Vérifiez que le conteneur ollama tourne."
          : err.message;
      // On garde la reponse partielle si des jetons sont deja arrives.
      setMessages((current) => {
        const updated = [...current];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          updated[updated.length - 1] = { role: "assistant", content: "Erreur : " + friendly };
          return updated;
        }
        return [...updated, { role: "assistant", content: "Erreur : " + friendly }];
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
        title="Assistant RAM"
      >
        {open ? <X className="h-6 w-6" /> : <HelpCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[500px] w-96 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="bg-primary px-4 py-3 font-semibold text-primary-foreground">
            Assistant RAM
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>Posez une question sur l'application RAM Flight Cost Calculator.</div>
                <div className="flex flex-wrap gap-1.5">
                  {["Comment calculer le coût d'un vol ?", "Que signifie BELF ?", "Comment simuler un scénario ?"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto whitespace-pre-wrap bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground",
                )}
              >
                {m.role === "user" ? m.content : <MarkdownMessage content={m.content} />}
              </div>
            ))}
            {loading && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "120ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "240ms" }} />
                </span>
                <span>Je réfléchis…</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Votre question..."
            />
            <Button size="icon" onClick={send} disabled={loading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
