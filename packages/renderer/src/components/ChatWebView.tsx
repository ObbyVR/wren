import { useEffect, useRef, useCallback } from "react";
import type { ProviderId } from "@wren/shared";
import styles from "./ChatWebView.module.css";

interface ChatWebViewProps {
  sessionId: string;
  providerId: ProviderId;
}

/**
 * Container component for an embedded WebContentsView.
 * The actual browser content is rendered at OS level by the main process.
 * This component measures its DOM bounds and communicates them via IPC.
 *
 * The ResizeObserver handles both creation (first valid bounds) and resizing.
 */
export function ChatWebView({ sessionId, providerId }: ChatWebViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const createdRef = useRef(false);

  const getBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }, []);

  // Single ResizeObserver handles both initial creation and subsequent resizes.
  // This is more reliable than useEffect for creation because the observer fires
  // once layout is complete, even if the initial mount has 0-size containers.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const bounds = getBounds();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

      if (!createdRef.current) {
        createdRef.current = true;
        window.wren.invoke("chat-view:create", {
          sessionId,
          providerId,
          bounds,
        });
      } else {
        window.wren.invoke("chat-view:resize", { sessionId, bounds });
      }
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (createdRef.current) {
        createdRef.current = false;
        window.wren.invoke("chat-view:destroy", { sessionId });
      }
    };
  }, [sessionId, providerId, getBounds]);

  // Re-measure on window resize (sidebar toggle, window drag, etc.)
  useEffect(() => {
    const handleResize = () => {
      if (!createdRef.current) return;
      const bounds = getBounds();
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        window.wren.invoke("chat-view:resize", { sessionId, bounds });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sessionId, getBounds]);

  return (
    <div ref={containerRef} className={styles.root}>
      <div className={styles.placeholder}>Loading...</div>
    </div>
  );
}
