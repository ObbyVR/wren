# Getting Started with Wren IDE

> Your first project in 5 minutes.

---

## Step 1 — Install Wren

Download the installer for your platform from the [releases page](https://github.com/your-org/wren/releases) or the [Wren website](#).

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Wren-mac-arm64.dmg` |
| macOS (Intel) | `Wren-mac-x64.dmg` |
| Windows | `Wren-Setup-win-x64.exe` |
| Linux | `Wren-linux-x64.AppImage` |

**macOS:** Open the `.dmg`, drag Wren to Applications. On first launch, right-click → Open if macOS blocks it.

**Windows:** Run the installer. Wren installs in your user directory — no admin rights needed.

**Linux:** Make the AppImage executable (`chmod +x Wren-*.AppImage`), then run it.

---

## Step 2 — Add your first AI provider

Wren is BYOK — you bring your own API key. Your keys are stored locally, encrypted. They never leave your machine.

1. Launch Wren. The onboarding wizard opens automatically.
2. Click **Add AI Provider**.
3. Choose your provider (Claude, GPT-4, Gemini, Mistral…).
4. Paste your API key. Wren validates it immediately.
5. Click **Save**.

**Where to get API keys:**
- **Anthropic (Claude):** [console.anthropic.com](https://console.anthropic.com) → API Keys
- **OpenAI:** [platform.openai.com](https://platform.openai.com) → API Keys
- **Google (Gemini):** [aistudio.google.com](https://aistudio.google.com) → Get API Key
- **Mistral:** [console.mistral.ai](https://console.mistral.ai) → API Keys

> **Tip:** Start with one provider. You can always add more later. If you're unsure which to pick, Claude 3.5 Sonnet (Anthropic) is a solid default for coding tasks.

---

## Step 3 — Open your first project

1. From the **Layout Hub**, click **New Project** or **Open Folder**.
2. Navigate to your codebase directory and select it.
3. Wren indexes your project — takes a few seconds depending on size.
4. You're in. The project loads in the workspace.

**What Wren can see:**
- Your file tree (left sidebar)
- Open files in the editor
- Terminal (integrated)
- AI context panel (right sidebar)

---

## Your first 5 minutes

### Ask about your codebase

Open the AI chat panel and try:
```
What does this project do? Give me a 3-sentence overview.
```
Wren reads your project context and answers based on your actual code.

### Make a change with AI

1. Open a file you want to edit.
2. Select the code you want to change.
3. Press `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux).
4. Describe what you want: "Add error handling to this function".
5. Review the diff and accept or reject.

### Switch models on the fly

Different tasks benefit from different models. In the AI panel:
- Click the model name (top right of the chat)
- Select a different model from the dropdown
- The next message uses the new model

> **Cost tip:** Use a smaller/faster model (Claude Haiku, GPT-4o-mini) for quick edits. Use a bigger model (Claude Sonnet, GPT-4o) for architectural decisions.

---

## Next steps

- **[FAQ](faq.md)** — Common questions and their answers
- **[Discord Community](https://discord.gg/wren)** — Help, tips, and showcase
- **Settings → Keyboard Shortcuts** — Customize your workflow

---

## Troubleshooting setup

**Wren won't open on macOS**
Right-click the app icon → Open. macOS Gatekeeper blocks unsigned apps by default. This is expected.

**API key validation fails**
Make sure you're pasting the full key, including any prefix (e.g., `sk-ant-...` for Anthropic). Check you haven't accidentally added trailing spaces.

**Project indexing takes too long**
Add a `.wrenignore` file (same syntax as `.gitignore`) to exclude `node_modules`, `dist`, `build`, and other large directories.

**Something else?**
Drop into [#help on Discord](https://discord.gg/wren) and describe the issue with your OS version and Wren version (Help → About Wren).
