import { useState, useEffect } from "react";
import styles from "./App.module.css";

function App() {
  const [version, setVersion] = useState<string>("...");
  const [pingResult, setPingResult] = useState<string>("");

  useEffect(() => {
    window.wren.invoke("app:get-version").then(setVersion).catch(console.error);
  }, []);

  const handlePing = async () => {
    const result = await window.wren.invoke("app:ping", "hello");
    setPingResult(result);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Wren IDE</h1>
        <p className={styles.tagline}>Your keys. Your models. Your workspace.</p>
      </header>

      <main className={styles.main}>
        <section className={styles.card}>
          <h2>App Info</h2>
          <p>
            Version: <strong>{version}</strong>
          </p>
        </section>

        <section className={styles.card}>
          <h2>IPC Bridge Test</h2>
          <button className={styles.button} onClick={handlePing}>
            Ping Main Process
          </button>
          {pingResult && (
            <p className={styles.result}>
              Response: <strong>{pingResult}</strong>
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
