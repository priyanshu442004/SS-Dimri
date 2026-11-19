import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, 
  Bot, 
  User, 
  MessageSquare, 
  Sparkles, 
  ChevronRight, 
  Loader2, 
  FileText
} from "lucide-react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiUrl } from "../lib/apiPath";
import { useToast } from "../context/ToastContext";

const ALL_QUESTIONS = [
  "Give me a complete executive financial health summary of XYZ Infrastructure & Properties Limited as of September 30, 2025, covering standalone and consolidated positions — something I can share directly with the Board.",
  "How has XYZ's overall financial position evolved between FY 2023-24, FY 2024-25, and H1 FY 2025-26? What are the key growth drivers and areas of concern the CEO and CFO should be aware of?",
  "What are the top 3 strategic red flags and top 3 strengths in XYZ's latest financials that require immediate attention from the Managing Director and senior leadership?",
  "Provide a consolidated investment portfolio overview — subsidiaries, joint ventures, quoted and unquoted investments — with recommendations on portfolio rationalization the Board should consider.",
  "Based on the latest data, how is liquidity, solvency, and profitability looking relative to the prior periods (FY 2024-25 and FY 2023-24)? Are there any specific ratios that indicate a worrying trend, and what is the recommended plan for the company?",
  "What was the total Revenue from Operations of XYZ for the period ended September 30, 2025, and how does it compare with FY 2024-25 and FY 2023-24?",
  "Break down the Cost of Material Consumption and Changes in Inventories for H1 FY 2025-26 — how significant are these cost heads relative to total expenses?",
  "What is the Profit Before Tax (PBT) and Profit After Tax (PAT) of XYZ for the latest period, and how has profitability evolved year-on-year?",
  "What were the Finance Costs and Depreciation & Amortization expenses for the period, and what do they indicate about the company's leverage and capex position?",
  "How do the Employee Benefit Expenses and Other Expenses for H1 FY 2025-26 compare with previous periods, and what is the operative efficiency of the firm?",
  "What is the total size of XYZ’s Balance Sheet (Total Assets) as of September 30, 2025, and how has it grown compared to March 31, 2025 and March 31, 2024?",
  "Provide a detailed breakup of Inventories — including work-in-progress, finished goods, and raw material — and flag any concerns around inventory buildup in the real estate business.",
  "What is XYZ’s total Borrowings position as of September 30, 2025? Please split it between current and non-current borrowings and compare the movement with previous periods.",
  "What constitutes XYZ’s Other Financial Assets and Trade Receivables — are there any major outstanding dues from related parties or long-term stagnant receivables that the Board should review?",
  "Summarize the Investment portfolio of XYZ — equity investments, preference shares, debentures in subsidiaries, and investments in joint ventures. What is the current total carrying value?",
  "Provide a summary of XYZ's Cash Flow Statement — Operating, Investing, and Financing activities — for the period ended September 30, 2025, and highlight the net cash movement.",
  "What is the company's Cash and Bank Balance position (including bank deposits) as of September 30, 2025, and how adequate is it relative to short-term obligations?",
  "Calculate and share the key financial ratios for XYZ — Debt-to-Equity, Current Ratio, Return on Equity (ROE), Return on Capital Employed (ROCE), and Net Profit Margin — for the latest reported period.",
  "How has the Debt-to-Equity Ratio of XYZ moved over the past three periods, and what does the trend indicate about the company's leverage strategy?",
  "What is the Inventory Turnover Ratio and Trade Receivable Days for XYZ — given the real estate nature of the business, are these within healthy industry benchmarks?"
];

const AIAssistantPage = () => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your Trial Balance AI Assistant. I can help you analyze financial statements, explain complex notes, and provide strategic insights.\n\nHow can I assist you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    const shuffled = [...ALL_QUESTIONS].sort(() => 0.5 - Math.random());
    setSuggestedQuestions(shuffled.slice(0, 5));
  }, []);

  const parseAIResponse = (data) => {
    let aiContent = "Analysis complete. How can I help further?";
    if (typeof data === "string") {
      aiContent = data;
    } else if (Array.isArray(data) && data.length > 0) {
      const firstItem = data[0];
      aiContent = typeof firstItem === "string" ? firstItem : (firstItem.output || firstItem.reply || firstItem.response || firstItem.text || firstItem.message || firstItem.content || firstItem.data || aiContent);
    } else if (typeof data === "object" && data !== null) {
      aiContent = data.output || data.reply || data.response || data.text || data.message || data.content || data.data || JSON.stringify(data);
    }
    return aiContent;
  };

  // DeepSeek, grounded in the statements generated from the current trial balance
  const askAssistant = async (question, history) => {
    const { data } = await axios.post(apiUrl("/api/ai/assistant"), {
      question,
      history: history.filter((m) => m.id !== "1").map((m) => ({ role: m.role, content: m.content })),
    }, { timeout: 180000 });
    return parseAIResponse(data);
  };
  const errorText = (error) => error.response?.data?.error || "The assistant couldn't be reached. Please try again.";

  const handleSendMessage = async (text = input) => {
    if (!text.trim()) return;

    const userMessage = {
      id: "user_" + Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const aiContent = await askAssistant(text, messages);

      const aiMessage = {
        id: "assistant_" + Date.now().toString(),
        role: "assistant",
        content: aiContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      showToast(errorText(error), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAISummary = async () => {
    setIsSummarizing(true);
    setIsLoading(true);
    const summaryPrompt = `Write a concise executive summary of XYZ Infrastructure & Properties Limited's latest financial statements for senior management.

Format (max 180 words):
- **Verdict:** Strong / Stable / Cautious / Concerning, with one-line reason.
- 5 bullets: scale, profitability, liquidity, leverage, cash flow; each with one key figure and its period (₹ millions).
- **Watch:** the single biggest risk and the action to take.

Only figures from the statements. If the current period is shorter than the comparative (half-year vs full year), don't present P&L changes as growth or decline unless annualised and labelled.`;

    // Add user message to UI
    const userMessage = {
      id: "user_summary_" + Date.now().toString(),
      role: "user",
      content: "Generate Executive Summary",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const aiContent = await askAssistant(summaryPrompt, messages);

      const aiMessage = {
        id: "assistant_summary_" + Date.now().toString(),
        role: "assistant",
        content: aiContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      showToast(errorText(error), "error");
    } finally {
      setIsSummarizing(false);
      setIsLoading(false);
    }
  };


  const formatContent = (content, role) => role === "user" ? <p className="whitespace-pre-wrap">{content}</p> : (
    <div className="fr-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>
  );

  return (
    <div className="flex flex-col h-full bg-[#f3f5f1]">
      {/* Header */}
      <div className="px-8 py-6 bg-white border-b border-gray-100 flex items-center justify-between shadow-sm z-10 transition-all">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0b1a33] flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-xl">
                <Bot className="w-6 h-6 text-blue-600" />
              </div>
              AI Financial Assistant
            </h1>
            <p className="text-sm text-[#566176] mt-1">
              Connected to XYZ Infrastructure & Properties Limited Intelligence
            </p>
          </div>
          <div className="h-10 w-[1px] bg-gray-100" />
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            AI Mode: Active
          </div>
        </div>

        <div className="flex items-center gap-4">
            <button
                onClick={handleAISummary}
                disabled={isSummarizing}
                className="flex items-center gap-2 px-5 py-2.5 bg-lime text-ink hover:brightness-95 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
            >
                {isSummarizing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Executive Summary
            </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 p-6 min-h-0">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col bg-white rounded-3xl border border-gray-100 shadow-xl shadow-blue-900/5 overflow-hidden">
          {/* Messages */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-200"
          >
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                  msg.role === "assistant" ? "bg-white border border-gray-100" : "bg-blue-600"
                }`}>
                  {msg.role === "assistant" ? (
                    <Bot className="w-5 h-5 text-blue-600" />
                  ) : (
                    <User className="w-5 h-5 text-white" />
                  )}
                </div>

                <div className={`flex flex-col max-w-[80%] ${msg.role === "user" ? "items-end" : ""}`}>
                  <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "assistant" 
                      ? "bg-[#f3f5f1] text-[#3a4659] border border-gray-100 rounded-tl-sm"
                      : "bg-blue-600 text-white shadow-lg shadow-blue-600/20 rounded-tr-sm"
                  }`}>
                    {formatContent(msg.content, msg.role)}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1.5 font-medium px-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            ))}
            
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                <div className="w-10 h-10 rounded-2xl bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 animate-pulse">
                  <Bot className="w-5 h-5 text-blue-600" />
                </div>
                <div className="bg-[#f3f5f1] border border-gray-100 rounded-2xl rounded-tl-sm px-5 py-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-6 border-t border-gray-100 bg-white">
            <div className="relative group">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Ask anything about XYZ's financial health..."
                className="w-full pl-12 pr-14 py-4 bg-[#f3f5f1] border border-gray-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              />
              <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="w-80 flex flex-col gap-6">
          {/* Suggested */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-lg shadow-blue-900/5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              Try Asking
            </h3>
            <div className="space-y-2">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSendMessage(q)}
                  disabled={isLoading}
                  className="w-full text-left p-3 text-xs text-[#3a4659] hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-transparent hover:border-blue-100 transition-all flex items-center justify-between group disabled:opacity-50"
                >
                  <span className="line-clamp-2">{q}</span>
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>

          {/* Assistant Info */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
            <Bot className="absolute -right-4 -bottom-4 w-24 h-24 text-white/10 rotate-12" />
            <div className="relative z-10">
              <h3 className="font-bold flex items-center gap-2 text-sm mb-2">
                Knowledge Base
              </h3>
              <p className="text-xs text-white/80 leading-relaxed">
                I answer from the statements, notes and trial balance generated from your current upload.
              </p>
              <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[10px] font-medium">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  Live Sync Active
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantPage;
