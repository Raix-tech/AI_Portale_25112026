export const AUTO_APPROVE_STORAGE_KEY = 'free-ai-hub:auto-approve:v1';

export const AUTO_APPROVE_SECTIONS = [
  {
    label: 'File e cartelle',
    reason: 'Le operazioni sui file restano manuali dove disponibili: il permesso del browser non autorizza scritture, scansioni o l’invio di dati all’AI.',
    permissions: [
      ['readFile', 'Leggere file', true],
      ['createFile', 'Creare file', true],
      ['editFile', 'Modificare file', true],
      ['renameFile', 'Rinominare file', true],
      ['moveFile', 'Spostare file', true],
      ['deleteFile', 'Eliminare file', false],
      ['createFolder', 'Creare cartelle', true],
      ['listFolder', 'Leggere il contenuto delle cartelle', true],
      ['editFolder', 'Modificare cartelle', true],
      ['deleteFolder', 'Eliminare cartelle', false],
      ['copyFilesAndFolders', 'Copiare file e cartelle', true],
      ['searchPcFiles', 'Cercare file sul PC', true],
      ['viewImages', 'Visualizzare immagini', true],
      ['readPdf', 'Leggere documenti PDF', true],
      ['editOffice', 'Leggere e modificare documenti Office', true],
    ],
  },
  {
    label: 'Terminale e comandi',
    reason: 'Il portale richiede la conferma per comandi e script; non concede elevazione automatica.',
    permissions: [
      ['runPowerShell', 'Eseguire PowerShell', true],
      ['runCmd', 'Eseguire CMD', true],
      ['runWindowsTerminal', 'Eseguire Windows Terminal', true],
      ['runPythonScripts', 'Eseguire script Python', true],
      ['runBatchScripts', 'Eseguire script Batch', true],
      ['runPowerShellScripts', 'Eseguire script PowerShell', true],
      ['runCli', 'Eseguire altri strumenti CLI', true],
      ['runGit', 'Eseguire Git', true],
      ['runNpm', 'Eseguire npm / npx', true],
      ['runAsAdministrator', 'Eseguire comandi come amministratore', false],
    ],
  },
  {
    label: 'Applicazioni',
    reason: 'Avvio, controllo e chiusura di app non hanno un’autorizzazione automatica dedicata.',
    permissions: [
      ['startApps', 'Avviare applicazioni', true],
      ['interactWithApps', 'Interagire con applicazioni autorizzate', true],
      ['closeApps', 'Chiudere applicazioni', true],
      ['openAssociatedFiles', 'Aprire file con le applicazioni associate', true],
      ['useOffice', 'Utilizzare Microsoft Office', true],
      ['editWord', 'Creare e modificare file Word', true],
      ['editExcel', 'Creare e modificare file Excel', true],
      ['editPowerPoint', 'Creare e modificare presentazioni PowerPoint', true],
    ],
  },
  {
    label: 'Web e browser',
    reason: 'Non vengono automatizzati navigazione, download, invio di dati, moduli, login o uso di account autenticati.',
    permissions: [
      ['openBrowser', 'Aprire il browser', true],
      ['openUrl', 'Aprire URL', true],
      ['searchWeb', 'Effettuare ricerche Internet', true],
      ['readWebPages', 'Consultare pagine Web', true],
      ['downloadFiles', 'Scaricare file', true],
      ['uploadFiles', 'Caricare file su Internet', false],
      ['fillWebForms', 'Compilare moduli Web', false],
      ['submitWebForms', 'Confermare/inviare moduli Web', false],
      ['logIn', 'Effettuare login automaticamente', false],
      ['interactWithAccounts', 'Interagire con account autenticati', false],
    ],
  },
  {
    label: 'Software e pacchetti',
    reason: 'Ricerca e download non sono collegati ad Auto-Approve; installazioni e cambi di sistema restano manuali.',
    permissions: [
      ['searchSoftware', 'Cercare software e pacchetti', true],
      ['downloadInstallers', 'Scaricare installer', true],
      ['installApps', 'Installare applicazioni', false],
      ['uninstallApps', 'Disinstallare applicazioni', false],
      ['installPipPackages', 'Installare pacchetti Python tramite pip', true],
      ['installNpmPackages', 'Installare pacchetti npm', true],
      ['installRequiredDependencies', 'Installare dipendenze necessarie ai progetti', true],
      ['changePathOrEnvironment', 'Modificare PATH o variabili d’ambiente', false],
      ['changeSystemConfiguration', 'Modificare configurazioni di sistema', false],
    ],
  },
  {
    label: 'Processi e sistema',
    reason: 'Accesso a processi e informazioni di sistema richiede operazioni PC esplicite; nessuna modifica di sistema è automatica.',
    permissions: [
      ['viewProcesses', 'Visualizzare i processi', true],
      ['startProcesses', 'Avviare processi', true],
      ['stopProcesses', 'Terminare processi', false],
      ['readSystemInformation', 'Leggere informazioni hardware/software del PC', true],
      ['readSafeEnvironment', 'Leggere variabili d’ambiente non sensibili', true],
      ['changeEnvironment', 'Modificare variabili d’ambiente', false],
      ['editRegistry', 'Modificare il Registro di Windows', false],
      ['manageWindowsServices', 'Avviare o arrestare servizi Windows', false],
      ['changeNetworkConfiguration', 'Modificare configurazioni di rete', false],
      ['powerOffOrRestart', 'Riavviare o spegnere il computer', false],
    ],
  },
  {
    label: 'Clipboard e interazione desktop',
    reason: 'Appunti, input, finestre e schermo non sono accessibili tramite Auto-Approve.',
    permissions: [
      ['readClipboard', 'Leggere gli appunti', true],
      ['writeClipboard', 'Scrivere negli appunti', true],
      ['controlInput', 'Controllare mouse e tastiera', false],
      ['controlWindows', 'Interagire automaticamente con finestre e GUI', false],
      ['captureScreenshots', 'Acquisire screenshot', false],
      ['readScreen', 'Leggere il contenuto dello schermo', false],
    ],
  },
  {
    label: 'Git e sviluppo',
    reason: 'Git, build, test e dipendenze possono eseguire codice o alterare repository: nessuna esecuzione automatica è consentita.',
    permissions: [
      ['readGitRepo', 'Leggere repository Git', true],
      ['editGitRepo', 'Modificare repository', true],
      ['createCommits', 'Creare commit', true],
      ['pushGit', 'Push verso repository remoti', false],
      ['changeRemoteBranches', 'Creare o modificare branch remoti', false],
      ['deleteBranches', 'Eliminare branch', false],
      ['runBuilds', 'Eseguire build', true],
      ['runTests', 'Eseguire test', true],
      ['installProjectDependencies', 'Installare dipendenze del progetto', true],
    ],
  },
  {
    label: 'Rete',
    reason: 'Auto-Approve non effettua traffico di rete né abilita accesso a LAN, dispositivi, server o porte.',
    permissions: [
      ['sendHttpRequests', 'Effettuare richieste HTTP/HTTPS', true],
      ['accessInternet', 'Accedere a Internet', true],
      ['accessLan', 'Accedere alla rete locale', false],
      ['contactLanDevices', 'Comunicare con dispositivi della LAN', false],
      ['startLocalServers', 'Avviare server locali', false],
      ['openNetworkPorts', 'Aprire porte di rete', false],
    ],
  },
] as const;

type AutoApprovePermission = (typeof AUTO_APPROVE_SECTIONS)[number]['permissions'][number];
export type AutoApproveRequests = Record<AutoApprovePermission[0], boolean>;

const permissions: readonly AutoApprovePermission[] = AUTO_APPROVE_SECTIONS.flatMap(
  ({ permissions }): readonly AutoApprovePermission[] => permissions,
);

export function defaultAutoApproveRequests(): AutoApproveRequests {
  return Object.fromEntries(permissions.map(([id, , enabled]) => [id, enabled])) as AutoApproveRequests;
}

export function parseSavedAutoApproveRequests(raw: string | null): AutoApproveRequests | null {
  try {
    if (!raw) return null;
    const { version, requested } = JSON.parse(raw);
    if (version !== 1 || !requested || typeof requested !== 'object') return null;
    if (!permissions.every(([id]) => typeof requested[id] === 'boolean')) return null;
    return Object.fromEntries(permissions.map(([id]) => [id, requested[id]])) as AutoApproveRequests;
  } catch {
    return null;
  }
}

export function getSavedAutoApproveRequests(): AutoApproveRequests | null {
  try {
    return parseSavedAutoApproveRequests(window.localStorage.getItem(AUTO_APPROVE_STORAGE_KEY));
  } catch {
    return null;
  }
}

const listeners = new Set<(saved: AutoApproveRequests | null) => void>();

export function subscribeAutoApproveRequests(listener: (saved: AutoApproveRequests | null) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === AUTO_APPROVE_STORAGE_KEY || event.key === null) {
      listener(parseSavedAutoApproveRequests(event.newValue));
    }
  };
  listeners.add(listener);
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export function saveAutoApproveRequests(requested: AutoApproveRequests): void {
  window.localStorage.setItem(AUTO_APPROVE_STORAGE_KEY, JSON.stringify({ version: 1, requested }));
  for (const listener of listeners) listener(requested);
}

export function isAutoReadRequested(): boolean {
  return getSavedAutoApproveRequests()?.readFile === true;
}
