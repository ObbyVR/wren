# Wren IDE — FAQ

> Risposte alle domande più comuni. Non trovi quello che cerchi? [#help su Discord](https://discord.gg/wren).

---

## 1. Wren è gratuito?

Wren IDE è gratuito da scaricare e usare. Non ci sono piani, subscription o seat license.

Paghi solo i provider AI che colleghi — e paghi direttamente a loro, ai loro prezzi. Noi non prendiamo nessuna percentuale e non facciamo markup sulle chiamate API.

---

## 2. Dove vengono salvate le mie API key?

Localmente, sul tuo computer, cifrate. Le chiavi non passano mai per i nostri server — Wren fa le chiamate API direttamente dal tuo dispositivo al provider.

Puoi verificarlo con qualsiasi network inspector: vedrai le richieste andare direttamente a `api.anthropic.com`, `api.openai.com`, ecc.

---

## 3. Quale provider AI devo usare?

Dipende dal tuo workflow. Come orientamento generale:

| Use case | Provider consigliato |
|----------|---------------------|
| Coding generale | Claude 3.5 Sonnet (Anthropic) |
| Completamenti veloci | Claude Haiku o GPT-4o-mini |
| Analisi architetturale | Claude 3 Opus o GPT-4o |
| Ragionamento complesso | Claude 3 Opus |
| Integrazione Google Workspace | Gemini |

Wren funziona con tutti. Puoi cambiarli in qualsiasi momento, anche mid-chat.

---

## 4. Il mio codice viene inviato ai server di Wren?

No. Wren non ha server di backend per il tuo codice. Quando Wren manda contesto a un modello AI, la richiesta va **direttamente** dal tuo computer al provider (Anthropic, OpenAI, ecc.).

Verifica le privacy policy del provider che usi se vuoi sapere come gestiscono i dati in input.

---

## 5. Quante API key posso aggiungere?

Nessun limite. Puoi aggiungere più chiavi per lo stesso provider (utile per separare progetti su billing account diversi) e chiavi per provider diversi. Assegni una key di default e puoi sovrascriverla per singolo progetto.

---

## 6. Posso usare Wren senza connessione internet?

Parzialmente. L'app funziona offline per editing standard. Le funzionalità AI richiedono connessione perché le chiamate vanno ai provider cloud.

Supporto per modelli locali (Ollama, LM Studio) è nella roadmap.

---

## 7. Come aggiungo un provider non nella lista?

Se il provider supporta API OpenAI-compatible (molti lo fanno), puoi configurarlo come custom provider:

1. **Settings → AI Providers → Add Custom**
2. Inserisci base URL, API key, nome modello
3. Testa la connessione

Funziona con Groq, Together AI, Perplexity, Fireworks, e altri.

---

## 8. Wren funziona con monorepo e progetti grandi?

Sì. Per performance ottimali su repository grandi:

1. Crea un file `.wrenignore` nella root del progetto (stesso formato di `.gitignore`)
2. Aggiungi directory pesanti che non servono al contesto AI:
   ```
   node_modules/
   dist/
   build/
   .next/
   coverage/
   ```

Questo riduce il tempo di indicizzazione e mantiene il contesto rilevante.

---

## 9. C'è un'estensione per VS Code o un'integrazione con altri editor?

Al momento Wren è un'applicazione desktop standalone. Integrazione con VS Code e altri editor è nella roadmap — se è importante per te, votala su [#feature-requests su Discord](https://discord.gg/wren).

---

## 10. Come aggiorno Wren?

Wren controlla gli aggiornamenti all'avvio automaticamente. Quando è disponibile una nuova versione:
- Ricevi una notifica in-app
- Clicca **Update Now** per scaricare e applicare
- Wren si riavvia con la nuova versione

Per aggiornare manualmente: **Help → Check for Updates**.

---

## Hai altre domande?

**Discord:** [discord.gg/wren](https://discord.gg/wren) → `#help`

Descrivi il problema con: sistema operativo, versione di Wren (Help → About), e cosa hai provato già.
