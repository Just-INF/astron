import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useDialogFocusSelector } from "@/lib/useDialogFocus";

interface GlassModalProps {
  children: ReactNode;
  className?: string;
  labelledBy: string;
  onClose: () => void;
}

export function GlassModal({ children, className = "", labelledBy, onClose }: GlassModalProps) {
  useDialogFocusSelector(".glass-modal", onClose, true);
  return (
    <motion.div
      className="glass-modal-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        className={`glass-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.section>
    </motion.div>
  );
}
