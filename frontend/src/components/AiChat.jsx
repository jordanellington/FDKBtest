import { motion } from 'framer-motion';
import { X, Sparkles, Send } from 'lucide-react';
import { useState, useEffect } from 'react';

const examplePrompts = [
  "What FDA guidance applies to biosimilar interchangeability?",
  "Summarize the history of ANDA paragraph IV certifications",
  "Find all consent decrees related to GMP violations since 2000",
  "Compare the FDA's approach to gene therapy regulation over time",
  "What are the key cases on market exclusivity under Hatch-Waxman?",
];

function TypingDots() {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-accent/40"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.5, delay: i * 0.12, repeat: Infinity }}
        />
      ))}
    </div>
  );
}

export default function AiChat({ onClose }) {
  const [currentPrompt, setCurrentPrompt] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentPrompt(p => (p + 1) % examplePrompts.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="w-[380px] bg-bg-secondary border-l border-border flex flex-col shrink-0 h-full"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <h2 className="font-display text-base">Research Assistant</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="w-16 h-16 rounded-2xl bg-accent/5 flex items-center justify-center mb-5"
        >
          <Sparkles size={28} className="text-accent" />
        </motion.div>

        <h3 className="font-display text-xl mb-2">AI-Powered Research</h3>
        <p className="text-text-secondary text-sm leading-relaxed mb-8 max-w-[280px]">
          Ask questions about 80 years of FDA regulatory history. Get synthesized answers with citations to specific documents.
        </p>

        {/* Rotating prompts */}
        <div className="w-full space-y-3 mb-8">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Example queries</p>
          <motion.div
            key={currentPrompt}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-bg-elevated rounded-lg p-4 text-left"
          >
            <p className="text-sm text-text-secondary italic leading-relaxed">
              "{examplePrompts[currentPrompt]}"
            </p>
            <div className="mt-3">
              <TypingDots />
            </div>
          </motion.div>
        </div>

        <div className="bg-accent-gold/10 border border-accent-gold/20 rounded-lg px-4 py-2.5">
          <p className="text-accent-gold text-sm font-semibold">Coming Soon</p>
          <p className="text-text-muted text-xs mt-0.5">Powered by Claude AI</p>
        </div>
      </div>

      {/* Disabled input */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 bg-bg-elevated rounded-lg px-4 py-2.5 opacity-40 cursor-not-allowed">
          <input
            disabled
            placeholder="Ask about FDA regulations..."
            className="flex-1 bg-transparent text-sm text-text-muted outline-none cursor-not-allowed"
          />
          <Send size={15} className="text-text-muted" />
        </div>
      </div>
    </motion.div>
  );
}
