import { motion } from "framer-motion";
import "./LoadingScreen.css";

interface LoadingScreenProps {
  message?: string;
}

const dotTransition = (delay: number) => ({
  duration: 0.9,
  repeat: Infinity,
  ease: "easeInOut" as const,
  delay,
});

function LoadingScreen({ message = "Loading..." }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-dots" role="status" aria-label={message}>
        <motion.span
          className="loading-dot loading-dot-purple"
          animate={{ y: [0, -14, 0] }}
          transition={dotTransition(0)}
        />
        <motion.span
          className="loading-dot loading-dot-blue"
          animate={{ y: [0, -14, 0] }}
          transition={dotTransition(0.15)}
        />
        <motion.span
          className="loading-dot loading-dot-teal"
          animate={{ y: [0, -14, 0] }}
          transition={dotTransition(0.3)}
        />
        <motion.span
          className="loading-dot loading-dot-pink"
          animate={{ y: [0, -14, 0] }}
          transition={dotTransition(0.45)}
        />
      </div>
      <p className="loading-message">{message}</p>
    </div>
  );
}

export default LoadingScreen;
