import React, { useState, useRef, useEffect } from "react";
import { assistantApi } from "../../lib/api/services";
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Minus,
  Maximize2,
  Sparkles,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  from: "user" | "assistant";
  text: string;
  timestamp: Date;
  suggested?: string[];
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { from: "user", text, timestamp: new Date() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setIsTyping(true);

    try {
      const res = await assistantApi.chat(text);
      const answer = res?.answer || "I'm sorry, I couldn't process that request at the moment.";
      const suggested = res?.suggested_questions || [];

      // Simulate a small delay for natural feeling
      setTimeout(() => {
        setMessages((m) => [...m, {
          from: "assistant",
          text: String(answer),
          timestamp: new Date(),
          suggested: suggested
        }]);
        setSuggestedQuestions(suggested);
        setIsTyping(false);
        setLoading(false);
      }, 600);
    } catch (err: any) {
      setMessages((m) => [...m, {
        from: "assistant",
        text: "System connection issue. Please check your network and try again.",
        timestamp: new Date()
      }]);
      setIsTyping(false);
      setLoading(false);
    }
  };

  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([
    "How is the market today?",
    "Analyze a Symbol",
    "How is my portfolio performing?",
    "How do I set alerts?",
    "What are the top market gainers?"
  ]);

  const onSelectSuggestion = (q: string) => {
    setInput(q);
    // Use a tiny timeout to ensure the input state is updated before send is called
    // or just pass the text directly to a renamed send function.
    // For simplicity, we'll just set input and wait for user to click send, 
    // OR trigger send immediately. Let's trigger immediately.
    setTimeout(() => {
      const sendButton = document.getElementById('chat-send-btn');
      sendButton?.click();
    }, 50);
  };

  return (
    <div className="fixed right-6 bottom-6 z-[100] font-sans">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="mb-4 w-[380px] sm:w-[420px] h-[600px] max-h-[80vh] max-w-[95vw] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-blue-200/50 dark:border-white/10 bg-gradient-to-br from-teal-50 via-blue-100 to-indigo-100 dark:from-[#0a1128] dark:to-[#080c1e] backdrop-blur-xl"
          >
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-teal-600 to-indigo-700 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
                    <Bot className="w-5 h-5 text-teal-100" />
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-teal-600 rounded-full animate-pulse"></span>
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">Tradexa Assistant</h3>
                  <p className="text-[10px] text-teal-100 uppercase tracking-widest font-medium">Ask Me</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  aria-label="Minimize"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div
              ref={scrollRef}
              className="flex-1 p-4 overflow-y-auto space-y-4 scroll-smooth custom-scrollbar"
            >
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-80">
                  <div className="p-4 bg-slate-100 dark:bg-[var(--color-bg-secondary)] rounded-full">
                    <Bot className="w-8 h-8 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-[var(--color-text-primary)]">Welcome to Tradexa Assistant</p>
                    <p className="text-xs text-slate-500 dark:text-[var(--color-text-tertiary)] max-w-[240px] mx-auto mt-1">
                      I can explain CSE market trends, stock analysis, or your portfolio performance.
                    </p>
                  </div>
                  <div className="w-full pt-4">
                    <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-widest font-bold mb-3">Try asking:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {suggestedQuestions.map((q, idx) => (
                        <motion.button
                          key={idx}
                          onClick={() => onSelectSuggestion(q)}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 + 0.3 }}
                          whileHover={{ scale: 1.05, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-4 py-2 text-xs font-medium bg-slate-800 dark:bg-slate-700 border border-slate-700 dark:border-slate-600 rounded-full text-white shadow-md hover:bg-teal-600 hover:border-teal-500 hover:shadow-lg hover:shadow-teal-500/20 transition-colors"
                        >
                          {q}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map((m: any, i) => (
                <div key={i} className="space-y-3">
                  <motion.div
                    initial={{ opacity: 0, x: m.from === "user" ? 10 : -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "flex w-full gap-2",
                      m.from === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs border shadow-sm",
                      m.from === "user"
                        ? "bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400"
                        : "bg-teal-50 border-teal-100 text-teal-600 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-400"
                    )}>
                      {m.from === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={cn(
                      "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-sm whitespace-pre-wrap",
                      m.from === "user"
                        ? "bg-indigo-600 text-white rounded-tr-none"
                        : "bg-white dark:bg-[var(--color-bg-secondary)] text-slate-800 dark:text-[var(--color-text-primary)] border border-slate-100 dark:border-[var(--color-border)] rounded-tl-none"
                    )}>
                      {m.text}
                      <div className={cn(
                        "text-[9px] mt-1.5 opacity-50 font-medium",
                        m.from === "user" ? "text-right" : "text-left"
                      )}>
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </motion.div>

                  {m.from === "assistant" && m.suggested && m.suggested.length > 0 && i === messages.length - 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-wrap gap-2 pl-10"
                    >
                      {m.suggested.map((q: string, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => onSelectSuggestion(q)}
                          className="px-3 py-1.5 text-xs bg-teal-50/50 dark:bg-teal-900/20 border border-teal-100/50 dark:border-teal-800/50 text-teal-700 dark:text-teal-400 rounded-full hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-all shadow-sm"
                        >
                          {q}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-900/30 border border-teal-100 dark:border-teal-800 flex items-center justify-center text-teal-600">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white dark:bg-[var(--color-bg-secondary)] px-4 py-3 rounded-2xl rounded-tl-none border border-slate-100 dark:border-[var(--color-border)] shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce"></span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/50 dark:bg-[var(--color-bg-primary)]/50 border-t border-slate-200/50 dark:border-[var(--color-border)]/50">
              <div className="relative flex items-center gap-2 bg-white dark:bg-[var(--color-bg-secondary)] rounded-xl border border-slate-200 dark:border-[var(--color-border)] p-1 shadow-inner focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent border-none px-3 py-2 text-sm focus:outline-none placeholder:text-[var(--color-text-tertiary)]"
                  disabled={loading}
                />
                <button
                  id="chat-send-btn"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    input.trim() && !loading
                      ? "bg-teal-600 text-white hover:bg-teal-700 shadow-md"
                      : "bg-slate-100 text-[var(--color-text-tertiary)] dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed"
                  )}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-[10px] text-center mt-2 text-[var(--color-text-tertiary)]">
                Market Intelligence - For Informational Purposes Only Not Financial Advice
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.15, rotate: 5 }}
        whileTap={{ scale: 0.85 }}
        animate={open ? { y: 0, rotate: 90, scale: 1 } : {
          y: [0, -12, 0],
          scale: [1, 1.05, 1],
        }}
        transition={open ? { type: "spring", stiffness: 300, damping: 20 } : {
          y: {
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut"
          },
          scale: {
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut"
          }
        }}
        onClick={() => setOpen(!open)}
        className={cn(
          "w-16 h-16 rounded-full shadow-[0_10px_25px_-5px_rgba(20,184,166,0.5)] flex items-center justify-center transition-all duration-300 z-[101]",
          open
            ? "bg-[var(--color-bg-secondary)] text-white shadow-none"
            : "bg-gradient-to-tr from-teal-500 via-teal-600 to-indigo-600 text-white"
        )}
      >
        {open ? <X className="w-7 h-7" /> : <Bot className="w-9 h-9" />}
        {!open && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-5 w-5 bg-teal-500 border-2 border-white dark:border-slate-900"></span>
          </span>
        )}
      </motion.button>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
        }
      `}} />
    </div>
  );
}

// Simple helper for class names if tailwind-merge is not working as expected
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}