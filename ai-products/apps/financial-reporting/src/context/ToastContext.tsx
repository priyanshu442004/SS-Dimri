import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  X 
} from "lucide-react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextType {
  showToast: (message: string, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-8 right-8 z-[100] flex flex-col items-end pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastComponent key={t.id} t={t} onRemove={() => removeToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

interface ToastComponentProps {
  t: Toast;
  onRemove: () => void;
}

const ToastComponent = ({ t, onRemove }: ToastComponentProps) => {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      className="flex items-center gap-4 px-6 py-4 bg-white/80 backdrop-blur-xl border border-white/20 rounded-[28px] shadow-2xl shadow-black/10 min-w-[300px] pointer-events-auto group mb-4"
    >
      <div className="flex-shrink-0">{icons[t.type]}</div>
      <p className="text-sm font-bold text-[#0b1a33] flex-1">{t.message}</p>
      <button 
        onClick={onRemove}
        className="p-1 hover:bg-black/5 rounded-full transition-colors"
      >
        <X className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
      </button>
    </motion.div>
  );
};
