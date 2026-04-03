import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import styles from "./Terminal.module.css";

interface TerminalProps {
  cwd: string;
}

export function Terminal({ cwd }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);

  const spawnTerminal = useCallback(async (xterm: XTerm, fitAddon: FitAddon) => {
    try {
      const { id } = await window.wren.invoke("terminal:create", { cwd });
      termIdRef.current = id;

      // Receive output from main
      const offData = window.wren.onTerminalData((tid, data) => {
        if (tid === id) xterm.write(data);
      });

      const offExit = window.wren.onTerminalExit((tid, exitCode) => {
        if (tid === id) {
          xterm.write(`\r\n[Process exited with code ${exitCode}]\r\n`);
        }
      });

      cleanupRef.current.push(offData, offExit);

      // Send input to main
      xterm.onData((data) => {
        window.wren.invoke("terminal:input", { id, data }).catch(console.error);
      });

      // Fit and sync dimensions
      fitAddon.fit();
      const { cols, rows } = xterm;
      await window.wren.invoke("terminal:resize", { id, cols, rows });
    } catch (err) {
      console.error("terminal spawn failed", err);
    }
  }, [cwd]);

  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      theme: {
        background: "#0c0c0e",
        foreground: "#e8e8ec",
        cursor: "#34d07b",
        selectionBackground: "rgba(52, 208, 123, 0.3)",
        black: "#1a1a1d",
        brightBlack: "#4a4a54",
        red: "#ff5f5f",
        brightRed: "#ff7070",
        green: "#34d07b",
        brightGreen: "#50e890",
        yellow: "#ffd700",
        brightYellow: "#ffe44d",
        blue: "#569cd6",
        brightBlue: "#79b8ff",
        magenta: "#c586c0",
        brightMagenta: "#d7aff7",
        cyan: "#4ec9b0",
        brightCyan: "#6de8d0",
        white: "#d4d4d4",
        brightWhite: "#e8e8ec",
      },
      fontFamily: "JetBrains Mono, Fira Code, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(containerRef.current);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    spawnTerminal(xterm, fitAddon);

    // Resize observer to refit when panel size changes
    const resizeObserver = new ResizeObserver(() => {
      if (!fitAddonRef.current || !termIdRef.current) return;
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = xterm;
        window.wren
          .invoke("terminal:resize", { id: termIdRef.current, cols, rows })
          .catch(console.error);
      } catch { /* ignore during dispose */ }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
      if (termIdRef.current) {
        window.wren.invoke("terminal:destroy", { id: termIdRef.current }).catch(console.error);
      }
      xterm.dispose();
    };
  }, []); // mount only once

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>Terminal</span>
      </div>
      <div className={styles.termWrapper} ref={containerRef} />
    </div>
  );
}
