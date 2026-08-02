import type { ReactNode } from "react";
import { motion } from "framer-motion";
import "./PlaceholderPage.css";

interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}

function PlaceholderPage({ eyebrow, title, description, children }: PlaceholderPageProps) {
  return (
    <div className="placeholder-page">
      <motion.div
        className="placeholder-card card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <span className="placeholder-eyebrow">{eyebrow}</span>
        <h1 className="placeholder-title">{title}</h1>
        <p className="placeholder-description">{description}</p>
        {children}
      </motion.div>
    </div>
  );
}

export default PlaceholderPage;
