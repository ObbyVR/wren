# Wren IDE — Piano Community Discord

> Documento per il founder. Struttura, tono e setup della community Discord di Wren IDE.

---

## Filosofia della community

Wren è per sviluppatori seri che vogliono controllare i propri strumenti. La community deve riflettere questo: **tecnica, diretta, zero hype**. No NFT vibes, no AI evangelism. Dev che aiutano altri dev.

---

## Struttura canali

### INFORMAZIONI (read-only)
| Canale | Scopo |
|--------|-------|
| `#announcements` | Release ufficiali, breaking changes, novità importanti |
| `#roadmap` | Funzionalità pianificate, feedback priorità |
| `#rules` | Regole community, codice di condotta |
| `#changelog` | Aggiornamenti di versione automatici (bot) |

### GENERALE
| Canale | Scopo |
|--------|-------|
| `#general` | Chat libera, tutto ciò che non ha una home migliore |
| `#introductions` | Presentati: chi sei, cosa usi con Wren, quale provider AI |
| `#showcase` | Mostra cosa hai costruito o automatizzato con Wren |

### SUPPORTO
| Canale | Scopo |
|--------|-------|
| `#help` | Domande tecniche, problemi di setup, troubleshooting |
| `#bug-reports` | Bug confermati con steps to reproduce |
| `#feature-requests` | Richieste funzionalità (con votazione emoji) |

### AI & PROVIDER
| Canale | Scopo |
|--------|-------|
| `#byok-tips` | Tips su come ottimizzare costi, quale modello per quale task |
| `#provider-news` | Novità da Anthropic, OpenAI, Mistral, Gemini etc. |
| `#prompts-and-configs` | Condividi configurazioni, system prompt, workflow |

### SVILUPPO
| Canale | Scopo |
|--------|-------|
| `#dev-updates` | Aggiornamenti dal team (founder e contribuitori) |
| `#contributing` | Per chi vuole contribuire al progetto |
| `#beta-testing` | Canale riservato ai beta tester (accesso su invito) |

---

## Welcome message

```
👋 Benvenuto in Wren IDE Community!

Wren è il desktop IDE AI-native costruito sulla filosofia BYOK:
**your keys, your models, your workspace**. Zero lock-in.

Per iniziare:
→ #rules — leggi le regole, ci vogliono 2 minuti
→ #introductions — presentati
→ #help — se hai problemi con il setup
→ #announcements — abilita le notifiche qui

Buon coding.
```

---

## Regole community

```
**Wren Community Rules**

1. **Rispetto** — Critica il codice, non la persona.
2. **Sii specifico** — "Non funziona" non è un bug report. Include version, OS, steps.
3. **Cerca prima** — Controlla FAQ e canali esistenti prima di postare.
4. **No spam** — No promozioni non richieste, no link affiliate, no bot non autorizzati.
5. **Niente dati sensibili** — Mai API key, token, password nei messaggi.
6. **Italiano o inglese** — Siamo multilingua, entrambe le lingue sono welcome.
7. **Off-topic con misura** — #general è libero, ma mantieni il tech focus.

Violazioni ripetute → ban. Il founder e i moderatori hanno l'ultima parola.
```

---

## Bot consigliati

### MEE6
- **Ruolo**: moderation bot per welcome automatici, livelli attività, filtro spam
- **Setup**: welcome message automatico, auto-role su join
- **Comandi utili**: `/warn`, `/mute`, `/ban`, livelli per premiare i membri attivi

### Carl-bot
- **Ruolo**: gestione ruoli via reaction e pulsanti
- **Setup**: messaggio di opt-in per ruoli come `@beta-tester`, `@contributor`, `@power-user`
- **Vantaggi**: granularità fine, no bot permission abuse

### GitHub Integration (ufficiale Discord)
- **Ruolo**: notifiche automatiche da repo → `#changelog` e `#dev-updates`
- **Setup**: collega repo Wren, configura eventi: releases, issues, PRs

---

## Ruoli utenti

| Ruolo | Come si ottiene |
|-------|----------------|
| `@founder` | Solo il founder |
| `@moderator` | Assegnato manualmente |
| `@contributor` | Chi ha PR mergiato nel repo |
| `@beta-tester` | Chi partecipa al beta testing |
| `@power-user` | Livello attività MEE6 o assegnazione manuale |
| `@member` | Default per tutti dopo #introductions |

---

## Moderazione (fase iniziale)

Per i primi 3-6 mesi, il founder modererà personalmente con l'aiuto di 1-2 moderatori fidati. Suggerimento: recluta moderatori da early adopters attivi nel canale `#help`.

**Risposta target:**
- Bug critici: < 24h
- Feature request: acknowledge entro 48h
- Domande generali: community risponde (target < 4h in orario europeo)

---

## Metriche di successo community (mese 3)

- 200+ membri
- 50+ messaggi/settimana in `#general` + `#help`
- 70%+ domande risolte dalla community (non dal founder)
- 10+ showcase postati

---

## Note per il founder

- **Non lanciare il server vuoto.** Invita prima 10-15 persone di fiducia (amici dev, beta tester) e fai crescere la conversazione organicamente.
- **Mostra presenza reale.** Anche un post a settimana in `#dev-updates` fa sentire la community viva.
- **Il canale `#showcase` è magico.** Quando le persone vedono cosa gli altri costruiscono, si ispirano e restano.
- **Pinned messages**: pin le FAQ principali in `#help`, pin il changelog in `#announcements`.
