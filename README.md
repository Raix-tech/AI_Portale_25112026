# AI Portale — Free AI Hub

Portale React/Vite (PWA) con server Express per gestire provider AI, chat e integrazioni Copilot.

## Avvio locale

Prerequisiti: **Node.js 24 LTS** e **Bun 1.3+**. Esegui i comandi dalla radice del repository.

```sh
bun install --frozen-lockfile
bun run dev
```

Apri `http://localhost:3000`. Per cambiare porta o configurare OAuth/Vault, copia `.env.example` in `.env` e compila solo i valori necessari. Le chiavi dei provider si configurano nell’interfaccia del portale; non inserirle nel codice.

## Test e produzione

```sh
bun test tests/autoApprove.test.mjs
bun run lint
bun run build
NODE_ENV=production bun run start
```

Su PowerShell, invece dell’ultima riga, esegui `$env:NODE_ENV = 'production'; bun run start`. In produzione Express serve sia `dist/` sia le API. `bun run preview` verifica solo il frontend Vite: non sostituisce Express.

## Auto-Approve: solo anteprima locale

1. In Chrome o Edge, apri il portale su `localhost` o HTTPS. In **Chat** o **Copilot Pro** collega una cartella dedicata, senza dati riservati o collegamenti, e concedi al browser la lettura.
2. In **Impostazioni → Auto-Approve**, salva la preferenza **Leggere file**, poi scegli **Attiva per…**. I preset iniziali non attivano niente.
3. Dopo una nuova risposta completata che propone una sola azione di lettura, puoi vedere in anteprima fino a due file `.txt` o `.md` UTF‑8, massimo 8 KiB ciascuno, con percorsi relativi ammessi.

L’anteprima resta in memoria: non viene salvata né inviata all’AI. **Autorizza lettura e invia all’AI** richiede un clic separato. Puoi revocare l’accesso alla funzione con **Disattiva anteprima**, togliendo la preferenza e salvando, scollegando la cartella oppure ricaricando/chiudendo la scheda. Le altre spunte sono solo preferenze: nessuna scrittura, cancellazione, esecuzione di comandi o trasmissione automatica. Le conferme esistenti non cambiano.

## GitHub e hosting

Carica il sorgente e `bun.lock` in un repository GitHub **privato**. Non includere `.env`, credenziali, `.free-ai-hub-data/`, backup, `node_modules/` o `dist/`. GitHub archivia il codice; **GitHub Pages non esegue Express**. Per un deployment usa un host Node.js, configura HTTPS, accesso autenticato e segreti lato server, e proteggi il volume dei dati del portale. Il server ascolta su tutte le interfacce: non esporlo direttamente a Internet. Imposta `APP_URL` se usi OAuth su un’origine diversa da quella locale.
