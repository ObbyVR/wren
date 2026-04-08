import { useState, useCallback } from "react";
import { useProviders, PROVIDER_META } from "../../store/providerStore";
import { useProjects } from "../../store/projectStore";
import styles from "./OnboardingWizard.module.css";

const STORAGE_KEY = "wren:onboarding:done";

export function isOnboardingDone(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function markOnboardingDone(): void {
  localStorage.setItem(STORAGE_KEY, "true");
}

export function resetOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Step 1: Welcome + Theme ───────────────────────────────────────────────────

interface Step1Props {
  theme: "dark" | "light";
  onTheme: (t: "dark" | "light") => void;
}

function Step1({ theme, onTheme }: Step1Props) {
  return (
    <div className={styles.stepContent}>
      <div className={styles.stepIcon}>✦</div>
      <h2 className={styles.stepTitle}>Welcome to Wren</h2>
      <p className={styles.stepDesc}>
        Your AI-native multi-project IDE. Let's get you set up in 4 quick steps.
      </p>
      <div className={styles.themeToggle}>
        <span className={styles.themeLabel}>Choose your theme</span>
        <div className={styles.themeOptions}>
          <button
            className={`${styles.themeBtn} ${theme === "dark" ? styles.themeBtnActive : ""}`}
            onClick={() => onTheme("dark")}
          >
            🌙 Dark
          </button>
          <button
            className={`${styles.themeBtn} ${theme === "light" ? styles.themeBtnActive : ""}`}
            onClick={() => onTheme("light")}
          >
            ☀️ Light
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Subscriptions & API Keys ─────────────────────────────────────────

type ProviderChoice = "anthropic" | "openai" | "gemini";

interface Step2Props {
  onKeySaved: () => void;
}

function Step2({ onKeySaved }: Step2Props) {
  const { setProviderKey, setProviderStatus, getProvider, providers } = useProviders();
  const [mode, setMode] = useState<"choose" | "existing" | "new">("choose");
  const [provider, setProvider] = useState<ProviderChoice>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Check if any keys already exist
  const existingKeys = providers.filter((p) => p.keyMasked);
  const hasExisting = existingKeys.length > 0;

  const handleSave = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) return;
    setSaving(true);
    setError(null);
    try {
      if (provider === "anthropic") {
        const result = await window.wren.invoke("ai:set-key", { key });
        if (result.valid) {
          setProviderKey("anthropic", key);
          setProviderStatus("anthropic", "valid");
          setSaved(true);
          onKeySaved();
        } else {
          setError(result.error ?? "Invalid API key");
        }
      } else {
        setProviderKey(provider, key);
        setSaved(true);
        onKeySaved();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [provider, apiKey, setProviderKey, setProviderStatus, onKeySaved]);

  const handleUseExisting = useCallback(() => {
    setMode("existing");
    setSaved(true);
    onKeySaved();
  }, [onKeySaved]);

  const hasKey = !!getProvider(provider)?.keyMasked;

  const placeholder =
    provider === "anthropic" ? "sk-ant-…" :
    provider === "openai" ? "sk-…" :
    "AIza…";

  const providerLabel = (p: string) =>
    p === "anthropic" ? "Claude" : p === "openai" ? "OpenAI" : p === "gemini" ? "Gemini" : p;

  // ── Choose mode: reuse existing or add new ──
  if (mode === "choose" && hasExisting) {
    return (
      <div className={styles.stepContent}>
        <div className={styles.stepIcon}>🔑</div>
        <h2 className={styles.stepTitle}>Your subscriptions</h2>
        <p className={styles.stepDesc}>
          You have existing API keys configured. Use them for this project or add new ones.
        </p>

        <div className={styles.existingKeys}>
          {existingKeys.map((p) => (
            <div key={p.id} className={styles.existingKeyRow}>
              <span className={styles.existingKeyDot} style={{ background: PROVIDER_META[p.id as keyof typeof PROVIDER_META]?.color ?? "#888" }} />
              <span className={styles.existingKeyLabel}>{providerLabel(p.id)}</span>
              <span className={styles.existingKeyMask}>{p.keyMasked}</span>
            </div>
          ))}
        </div>

        <div className={styles.choiceButtons}>
          <button className={styles.nextBtn} onClick={handleUseExisting}>
            Use these keys
          </button>
          <button className={styles.backBtn} onClick={() => setMode("new")}>
            Add new key
          </button>
        </div>
      </div>
    );
  }

  // ── Existing keys confirmed ──
  if (mode === "existing" && saved) {
    return (
      <div className={styles.stepContent}>
        <div className={styles.stepIcon}>✓</div>
        <h2 className={styles.stepTitle}>Keys ready</h2>
        <p className={styles.stepDesc}>
          Your existing subscriptions will be used for this project.
        </p>
        <div className={styles.savedMsg}>
          {existingKeys.map((p) => providerLabel(p.id)).join(", ")} configured
        </div>
      </div>
    );
  }

  // ── New key form ──
  return (
    <div className={styles.stepContent}>
      <div className={styles.stepIcon}>🔑</div>
      <h2 className={styles.stepTitle}>Add your AI key</h2>
      <p className={styles.stepDesc}>
        Wren uses your own API keys — your data never leaves your machine.
      </p>

      <div className={styles.providerTabs}>
        {(["anthropic", "openai", "gemini"] as ProviderChoice[]).map((p) => (
          <button
            key={p}
            className={`${styles.providerTab} ${provider === p ? styles.providerTabActive : ""}`}
            onClick={() => { setProvider(p); setApiKey(""); setError(null); setSaved(false); }}
          >
            {providerLabel(p)}
          </button>
        ))}
      </div>

      {hasKey && !saved && (
        <div className={styles.alreadyConfigured}>
          ✓ {providerLabel(provider)} key already configured
        </div>
      )}

      {saved ? (
        <div className={styles.savedMsg}>✓ Key saved successfully!</div>
      ) : (
        <>
          <input
            className={styles.keyInput}
            type="password"
            placeholder={placeholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
            autoFocus
          />
          {error && <div className={styles.errorMsg}>{error}</div>}
          <button
            className={styles.saveKeyBtn}
            onClick={() => void handleSave()}
            disabled={!apiKey.trim() || saving}
          >
            {saving ? "Validating…" : "Save key"}
          </button>
        </>
      )}

      {hasExisting && (
        <button className={styles.skipBtn} onClick={() => setMode("choose")} style={{ marginTop: 8 }}>
          ← Back to existing keys
        </button>
      )}
    </div>
  );
}

// ── Step 3: Open Project ──────────────────────────────────────────────────────

interface Step3Props {
  onProjectOpened: () => void;
}

function Step3({ onProjectOpened }: Step3Props) {
  const { addProject } = useProjects();
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  const handleOpen = useCallback(async () => {
    setOpening(true);
    try {
      let folderPath: string | null = null;
      try {
        folderPath = await window.wren.invoke("dialog:open-folder");
      } catch {
        const p = window.prompt("Enter folder path:");
        folderPath = p?.trim() ?? null;
      }
      if (!folderPath) return;

      const name = folderPath.split(/[\\/]/).filter(Boolean).pop() ?? "Project";
      addProject(name, folderPath, "anthropic");
      setOpened(name);
      onProjectOpened();
    } finally {
      setOpening(false);
    }
  }, [addProject, onProjectOpened]);

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepIcon}>📁</div>
      <h2 className={styles.stepTitle}>Open a project</h2>
      <p className={styles.stepDesc}>
        Point Wren to a local folder to start working with your code.
      </p>

      {opened ? (
        <div className={styles.savedMsg}>✓ "{opened}" opened!</div>
      ) : (
        <button
          className={styles.openFolderBtn}
          onClick={() => void handleOpen()}
          disabled={opening}
        >
          {opening ? "Opening…" : "Choose folder"}
        </button>
      )}
    </div>
  );
}

// ── Step 4: First Chat ────────────────────────────────────────────────────────

function Step4() {
  return (
    <div className={styles.stepContent}>
      <div className={styles.stepIcon}>🤖</div>
      <h2 className={styles.stepTitle}>You're all set!</h2>
      <p className={styles.stepDesc}>
        Wren is ready. Open the chat panel and ask anything about your project.
        The AI can read files, write code, run commands, and more.
      </p>
      <div className={styles.tipList}>
        <div className={styles.tip}>
          <span className={styles.tipIcon}>💬</span>
          <span>Press <kbd>✦ Chat</kbd> in the status bar to open the chat</span>
        </div>
        <div className={styles.tip}>
          <span className={styles.tipIcon}>⚙</span>
          <span>Press <kbd>Cmd+,</kbd> to open Settings at any time</span>
        </div>
        <div className={styles.tip}>
          <span className={styles.tipIcon}>⎇</span>
          <span>Click the Git icon in the sidebar to manage git</span>
        </div>
      </div>
    </div>
  );
}

// ── Wizard shell ──────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = ["Welcome", "Subscriptions", "Project", "Done"];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [keySaved, setKeySaved] = useState(false);
  const [projectOpened, setProjectOpened] = useState(false);

  const applyTheme = useCallback((t: "dark" | "light") => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("wren:theme", t);
  }, []);

  const handleComplete = () => {
    markOnboardingDone();
    onComplete();
  };

  const canAdvance =
    step === 0 ? true :               // welcome: always ok
    step === 1 ? keySaved :           // api key: must save a key
    step === 2 ? true :               // project: optional (can skip)
    true;

  return (
    <div className={styles.overlay}>
      <div className={styles.wizard}>
        {/* Progress dots */}
        <div className={styles.progressBar}>
          {STEPS.map((s, i) => (
            <div key={s} className={styles.progressStep}>
              <div
                className={`${styles.progressDot} ${i === step ? styles.progressDotActive : ""} ${i < step ? styles.progressDotDone : ""}`}
              />
              <span className={`${styles.progressLabel} ${i === step ? styles.progressLabelActive : ""}`}>
                {s}
              </span>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className={styles.stepArea}>
          {step === 0 && <Step1 theme={theme} onTheme={applyTheme} />}
          {step === 1 && <Step2 onKeySaved={() => setKeySaved(true)} />}
          {step === 2 && <Step3 onProjectOpened={() => setProjectOpened(true)} />}
          {step === 3 && <Step4 />}
        </div>

        {/* Navigation */}
        <div className={styles.nav}>
          <button
            className={styles.skipBtn}
            onClick={handleComplete}
          >
            Skip setup
          </button>

          <div className={styles.navRight}>
            {step > 0 && (
              <button className={styles.backBtn} onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                className={styles.nextBtn}
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance}
              >
                {step === 2 && !projectOpened ? "Skip →" : "Next →"}
              </button>
            ) : (
              <button className={styles.nextBtn} onClick={handleComplete}>
                Start using Wren ✦
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
