import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AUTO_APPROVE_SECTIONS,
  defaultAutoApproveRequests,
  getSavedAutoApproveRequests,
  saveAutoApproveRequests,
  subscribeAutoApproveRequests,
  type AutoApproveRequests,
} from '../services/autoApprove';
import {
  activateWorkspaceReadPreviewScope,
  getCachedWorkspaceSnapshot,
  getWorkspaceReadPreviewScope,
  MAX_AUTO_PREVIEW_BYTES,
  MAX_AUTO_PREVIEW_FILES,
  revokeWorkspaceReadPreviewScope,
  subscribeWorkspaceReadPreviewScope,
} from '../services/localWorkspace';

export function AutoApproveSettings() {
  const [saved, setSaved] = useState(getSavedAutoApproveRequests);
  const [edits, setEdits] = useState<Partial<AutoApproveRequests>>({});
  const draft = { ...(saved ?? defaultAutoApproveRequests()), ...edits };
  const [scope, setScope] = useState(getWorkspaceReadPreviewScope);
  const [activating, setActivating] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeWorkspaceReadPreviewScope(() => setScope(getWorkspaceReadPreviewScope())), []);
  useEffect(() => subscribeAutoApproveRequests(setSaved), []);

  const dirty = !saved || AUTO_APPROVE_SECTIONS.some(({ permissions }) =>
    permissions.some(([id]) => saved[id] !== draft[id]),
  );
  const folderName = getCachedWorkspaceSnapshot().folderName;
  const savedRead = saved?.readFile === true;

  const save = () => {
    setError('');
    setNotice('');
    try {
      saveAutoApproveRequests(draft);
      setEdits({});
      setNotice('Preferenze salvate in questo browser. Il salvataggio da solo non attiva alcuna automazione.');
    } catch {
      setError('Impossibile salvare in questo browser. Le modifiche non sono state applicate.');
    }
  };

  const activate = async () => {
    setError('');
    setNotice('');
    setActivating(true);
    try {
      await activateWorkspaceReadPreviewScope();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile attivare l’anteprima locale.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <section id="auto-approve-settings" aria-labelledby="auto-approve-title" className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center shrink-0">
          <ShieldCheck aria-hidden="true" className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 id="auto-approve-title" className="font-display text-base font-semibold text-zinc-950 dark:text-white">Auto-Approve</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Le spunte sono preferenze indipendenti, salvate solo nel browser su questo dispositivo. «Solo preferenza» non concede permessi:
            quelle operazioni restano manuali, se disponibili. Non cambia Accesso al PC né le conferme esistenti.
          </p>
          {!saved && <p className="mt-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">Preset suggeriti non salvati. Tutte le azioni restano manuali.</p>}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/20 p-4">
        <h3 className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">Unica funzione disponibile: anteprima locale di testo</h3>
        <p className="text-xs text-zinc-700 dark:text-zinc-300">
          Solo dopo una nuova risposta completata in Chat o Copilot Pro: fino a {MAX_AUTO_PREVIEW_FILES} file .txt o .md, massimo{' '}
          {MAX_AUTO_PREVIEW_BYTES / 1024} KiB ciascuno. Nomi nascosti, sensibili o non riconosciuti vengono esclusi.
          Il contenuto resta qui: per inviarlo all’AI devi confermare la singola azione.
        </p>
        <p className="text-xs text-zinc-700 dark:text-zinc-300">
          Collega nella chat una cartella dedicata senza dati riservati o collegamenti. Poi salva «Leggere file» e attiva qui l’anteprima per quella cartella.
          L’attivazione vale solo per questa scheda fino al ricaricamento, alla revoca o al cambio della cartella.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span role="status" className="font-semibold text-indigo-900 dark:text-indigo-200">
            {scope ? `Attiva per: ${scope.folderName}` : 'Anteprima non attiva'}
          </span>
          {scope ? (
            <button type="button" onClick={() => { revokeWorkspaceReadPreviewScope(); setError(''); setNotice('Anteprima disattivata.'); }}
              className="rounded-md border border-indigo-300 dark:border-indigo-700 px-2.5 py-1.5 font-semibold text-indigo-900 dark:text-indigo-200">
              Disattiva anteprima
            </button>
          ) : (
            <button type="button" disabled={!savedRead || !folderName || activating} onClick={() => void activate()}
              className="rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {activating ? 'Verifica permesso…' : folderName ? `Attiva per «${folderName}»` : 'Nessuna cartella collegata'}
            </button>
          )}
        </div>
      </div>

      {AUTO_APPROVE_SECTIONS.map(({ label, reason, permissions }) => (
        <fieldset key={label} className="min-w-0 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3.5 pb-3.5 pt-2">
          <legend className="px-1 text-xs font-semibold text-zinc-950 dark:text-zinc-100">{label}</legend>
          <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">{reason}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {permissions.map(([id, name]) => (
              <label key={id} className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100">
                <input type="checkbox" checked={draft[id]} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-indigo-600"
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setEdits((prev) => ({ ...prev, [id]: checked }));
                    setNotice('');
                  }} />
                <span>
                  {name}
                  <span className="block text-[11px] text-zinc-600 dark:text-zinc-400">
                    {id === 'readFile' ? 'Supportata: solo anteprima locale con attivazione separata' : 'Solo preferenza · automazione non disponibile'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!dirty} onClick={save}
          className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          Salva preferenze Auto-Approve
        </button>
        <p role="status" className="text-xs text-zinc-600 dark:text-zinc-400">{notice || (dirty ? 'Preferenze non salvate.' : 'Nessuna modifica da salvare.')}</p>
      </div>
      {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}
