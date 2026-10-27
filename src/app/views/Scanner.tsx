// Scanner LOYNA Business : scan réussi = passage validé, sans bouton « Confirmer ».
// Le serveur renvoie un bloc `display` prêt à afficher : aucune règle métier n'est calculée ici.
import {useEffect, useRef, useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, can, go, toastError} from '../state';
import {Btn} from '../ui';
import {uuid} from '../util';

type Tone = 'success' | 'reward' | 'warning' | 'error' | 'info';
interface Action {
  type: 'UNDO' | 'OVERRIDE' | 'REDEEM' | 'ENTER_AMOUNT';
  label: string;
  until?: string;
  customer_reward_id?: string;
}
interface Display {
  tone: Tone;
  title: string;
  subtitle?: string;
  lines: string[];
  vibrate?: number[];
  actions: Action[];
}
interface ScanResult {
  status: string;
  transaction_id?: string;
  customer?: {id: string; first_name: string};
  display: Display;
  referral_bonus?: {bonus: number; referrer_credited: boolean} | null; // première visite d'un ami parrainé (Pro)
  program?: {unit_singular: string; unit_plural: string};
  // contexte local (pour rejouer un scan : montant, forçage)
  qr?: string;
  at: number;
}
type Cam = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable' | 'insecure';

const SOUND_KEY = 'loyna-scan-sound';
const RESUME_MS = 6000;
const SAME_QR_MS = 3000;

export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number>(0);
  const detector = useRef<any>(null);
  const jsqr = useRef<any>(null);
  const last = useRef<{qr: string; at: number} | null>(null);
  const busyRef = useRef(false);
  const pausedRef = useRef(false);
  const holdRef = useRef(false); // résultat affiché : lecture suspendue ~6 s
  const resultAt = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const wasLive = useRef(false);

  const [cam, setCam] = useState<Cam>('idle');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [fresh, setFresh] = useState(false);
  const [paused, setPaused] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const [count, setCount] = useState(0);
  const [amount, setAmount] = useState('');
  const [retry, setRetry] = useState<{qr: string; key: string; extra: Extra} | null>(null);
  const [, tick] = useState(0);

  const setPause = (v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  };

  // Compte à rebours du bouton « Annuler »
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Démonstration locale : window.__demoScan('loyna:v1:…') simule la lecture d'un QR code.
  useEffect(() => {
    if (!api.demo) return;
    (window as any).__demoScan = (qr: string) => onCode(qr);
    return () => delete (window as any).__demoScan;
  });

  // Démarrage automatique si la caméra est déjà autorisée ; arrêt en quittant la page.
  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCam(window.isSecureContext ? 'unavailable' : 'insecure');
      return;
    }
    (navigator.permissions as any)
      ?.query({name: 'camera'})
      .then((p: PermissionStatus) => p.state === 'granted' && start())
      .catch(() => {});
    const onVis = () => {
      if (document.hidden) {
        wasLive.current = !!stream.current;
        stop();
      } else if (wasLive.current) start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, []);

  async function start() {
    if (stream.current) return;
    setCam('starting');
    try {
      audio.current ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      /* son indisponible */
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}});
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      v.setAttribute('playsinline', '');
      v.muted = true;
      await v.play();
      const track = s.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as any;
      setTorch(caps.torch ? false : null);
      if (!detector.current && 'BarcodeDetector' in window) {
        try {
          const formats: string[] = await (window as any).BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) detector.current = new (window as any).BarcodeDetector({formats: ['qr_code']});
        } catch {
          /* lecteur natif indisponible */
        }
      }
      if (!detector.current && !jsqr.current) jsqr.current = (await import('jsqr')).default;
      setCam('live');
      loop();
    } catch (e: any) {
      stop();
      setCam(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  }

  function stop() {
    clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCam((c) => (c === 'live' || c === 'starting' ? 'idle' : c));
  }

  async function loop() {
    if (!stream.current) return;
    const v = video.current;
    if (v && v.readyState >= 2 && !busyRef.current && !pausedRef.current && !holdRef.current) {
      try {
        let value: string | null = null;
        if (detector.current) {
          const codes = await detector.current.detect(v);
          value = codes[0]?.rawValue ?? null;
        } else if (jsqr.current) {
          const scale = Math.min(1, 720 / (v.videoWidth || 720));
          const w = Math.round((v.videoWidth || 640) * scale);
          const h = Math.round((v.videoHeight || 480) * scale);
          canvas.current ??= document.createElement('canvas');
          const c = canvas.current;
          c.width = w;
          c.height = h;
          const g = c.getContext('2d', {willReadFrequently: true})!;
          g.drawImage(v, 0, 0, w, h);
          const img = g.getImageData(0, 0, w, h);
          value = jsqr.current(img.data, w, h, {inversionAttempts: 'dontInvert'})?.data ?? null;
        }
        if (value) onCode(value);
      } catch {
        /* image illisible : on continue */
      }
    }
    timer.current = window.setTimeout(loop, detector.current ? 120 : 170);
  }

  function onCode(raw: string) {
    const qr = raw.trim();
    const now = Date.now();
    if (busyRef.current || pausedRef.current || holdRef.current) return;
    // La caméra relit le même code plusieurs fois par seconde : on l'ignore pendant 3 s.
    if (last.current && last.current.qr === qr && now - last.current.at < SAME_QR_MS) return;
    last.current = {qr, at: now};
    validate(qr, {});
  }

  type Extra = {override?: boolean; amount?: number};
  async function validate(qr: string, extra: Extra, key = uuid()) {
    busyRef.current = true;
    setBusy(true);
    setRetry(null);
    try {
      const res = await api.edge<Omit<ScanResult, 'at' | 'qr'>>('validate-visit', {
        action: 'validate',
        qr,
        idempotency_key: key,
        override_cooldown: !!extra.override,
        amount: extra.amount ?? null,
        points: null,
      });
      show({...res, qr, at: Date.now()});
      if (res.status === 'OK') setCount((n) => n + 1);
    } catch (e: any) {
      if (e?.code === 'NETWORK') {
        // Nouvel envoi possible avec la même clé : le serveur ne compte jamais deux fois le même scan.
        setRetry({qr, key, extra});
        show({status: 'NETWORK', at: Date.now(), display: {tone: 'error', title: 'Connexion perdue', subtitle: 'Le passage n’a peut-être pas été enregistré.', lines: [], actions: []}});
      } else {
        show({status: 'ERROR', at: Date.now(), display: {tone: 'error', title: 'Scan non traité', subtitle: e?.message ?? 'Réessayez.', lines: [], actions: []}});
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function show(r: ScanResult) {
    setResult(r);
    setAmount('');
    feedback(r.display);
    const needsDecision = r.display.actions.some((a) => a.type !== 'UNDO');
    setPause(needsDecision);
    setFresh(true);
    holdRef.current = true;
    resultAt.current = r.at;
    if (!needsDecision)
      setTimeout(() => {
        if (resultAt.current !== r.at) return;
        holdRef.current = false;
        setFresh(false);
      }, RESUME_MS);
  }

  function feedback(d: Display) {
    try {
      if (d.vibrate && navigator.vibrate) navigator.vibrate(d.vibrate);
    } catch {
      /* vibration indisponible (iPhone) */
    }
    if (!sound || !audio.current) return;
    const ctx = audio.current;
    const notes: Record<Tone, number[]> = {success: [880, 1320], reward: [784, 988, 1319], warning: [520], error: [220, 196], info: [660]};
    let t = ctx.currentTime;
    for (const f of notes[d.tone] ?? [660]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.15);
      t += 0.1;
    }
  }

  async function act(a: Action) {
    if (!result) return;
    if (a.type === 'OVERRIDE' && result.qr) return validate(result.qr, {override: true});
    if (a.type === 'ENTER_AMOUNT') return; // champ affiché sous la carte
    busyRef.current = true;
    setBusy(true);
    try {
      if (a.type === 'UNDO' && result.transaction_id) {
        const r = await api.edge('validate-visit', {action: 'undo', transaction_id: result.transaction_id, reason: 'Annulé depuis le scanner'});
        if (r.status === 'REVERSED') setCount((n) => Math.max(0, n - 1));
        show({...r, at: Date.now()});
      } else if (a.type === 'REDEEM' && a.customer_reward_id) {
        const r = await api.edge('redeem-reward', {customer_reward_id: a.customer_reward_id});
        show({...r, customer: result.customer, at: Date.now()});
      }
    } catch (e) {
      toastError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function submitAmount(e: Event) {
    e.preventDefault();
    const n = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!result?.qr || !isFinite(n) || n <= 0) return;
    validate(result.qr, {amount: Math.round(n * 100) / 100});
  }

  function next() {
    setResult(null);
    setFresh(false);
    setPause(false);
    holdRef.current = false;
    resultAt.current = 0;
  }

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({advanced: [{torch: !torch} as any]});
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  function toggleSound() {
    const v = !sound;
    setSound(v);
    try {
      localStorage.setItem(SOUND_KEY, v ? 'on' : 'off');
    } catch {
      /* préférence non mémorisée */
    }
  }

  const d = result?.display;
  const actions = d?.actions.filter((a) => a.type !== 'UNDO' || (a.until && new Date(a.until).getTime() > Date.now())) ?? [];
  const live = cam === 'live';
  const bonus = result?.status === 'OK' ? result.referral_bonus : null;
  const unit = (n: number) => (n > 1 ? (result?.program?.unit_plural ?? 'passages') : (result?.program?.unit_singular ?? 'passage'));

  return (
    <div class="scan">
      <div class="scan-head">
        <div>
          <p class="eyebrow">Scanner</p>
          <h1>Scannez la carte du client</h1>
        </div>
        <div class="scan-count" aria-live="polite">
          <b>{count}</b>
          <span>{count > 1 ? 'passages validés' : 'passage validé'}</span>
        </div>
      </div>

      <div class="scan-grid">
        <div class={`viewfinder ${live ? 'is-live' : ''} ${busy ? 'is-busy' : ''} ${paused ? 'is-paused' : ''}`}>
          <video ref={video} muted playsInline aria-label="Image de la caméra" />
          {live && (
            <div class="vf-frame" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              {!busy && !paused && <span class="vf-line" />}
            </div>
          )}
          {busy && (
            <div class="vf-busy" role="status">
              <span class="spin" />
              <span>Validation…</span>
            </div>
          )}
          {!live && (
            <div class="vf-idle">
              {cam === 'denied' ? (
                <>
                  <Icon name="camera-off" size={34} />
                  <strong>Accès à la caméra refusé</strong>
                  <p>Autorisez la caméra pour loyna.fr dans les réglages du navigateur (icône à gauche de l’adresse), puis réessayez.</p>
                  <Btn kind="gold" icon="refresh-cw" onClick={start}>
                    Réessayer
                  </Btn>
                </>
              ) : cam === 'unavailable' ? (
                <>
                  <Icon name="camera-off" size={34} />
                  <strong>Aucune caméra disponible</strong>
                  <p>Ouvrez cette page sur le téléphone ou la tablette du comptoir. Vous pouvez aussi retrouver un client dans l’onglet Clients.</p>
                  <div class="btn-row">
                    <Btn kind="gold" icon="refresh-cw" onClick={start}>
                      Réessayer
                    </Btn>
                    {can('customers.read_basic') && (
                      <Btn kind="ghost" icon="users" onClick={() => go('clients')}>
                        Clients
                      </Btn>
                    )}
                  </div>
                </>
              ) : cam === 'insecure' ? (
                <>
                  <Icon name="lock" size={34} />
                  <strong>Connexion non sécurisée</strong>
                  <p>Le scanner fonctionne uniquement à l’adresse https://loyna.fr.</p>
                </>
              ) : (
                <>
                  <span class="vf-icon">
                    <Icon name="scan-line" size={40} />
                  </span>
                  <strong>Prêt à scanner</strong>
                  <p>Le passage est validé dès que le QR code de la carte est lu.</p>
                  <Btn kind="gold" icon="camera" busy={cam === 'starting'} onClick={start}>
                    Activer la caméra
                  </Btn>
                </>
              )}
            </div>
          )}
        </div>

        <div class="scan-side">
          {d ? (
            <div class={`result result--${d.tone} ${fresh ? 'is-fresh' : ''} ${fresh || paused ? 'is-held' : ''}`} role="status" aria-live="assertive">
              <div class="result-top">
                <span class="result-i">
                  <Icon name={d.tone === 'success' ? 'circle-check' : d.tone === 'reward' ? 'gift' : d.tone === 'error' ? 'circle-x' : d.tone === 'warning' ? 'clock' : 'info'} size={30} />
                </span>
                <div>
                  <strong class="result-title">{d.title.replace(/^✓\s*/, '')}</strong>
                  {d.subtitle && <span class="result-sub">{d.subtitle}</span>}
                </div>
              </div>
              {result?.status === 'OK' && bonus && (
                <div class="result-tags">
                  {bonus && (
                    <span class="result-tag">
                      <Icon name="share-2" size={16} />
                      Bonus de parrainage : +{bonus.bonus} {unit(bonus.bonus)}
                      {bonus.referrer_credited ? ' (son parrain aussi)' : ''}
                    </span>
                  )}
                </div>
              )}
              {d.lines.length > 0 && (
                <ul class="result-lines">
                  {d.lines.map((l) => (
                    <li>{l}</li>
                  ))}
                </ul>
              )}
              {actions.some((a) => a.type === 'ENTER_AMOUNT') && (
                <form class="result-amount" onSubmit={submitAmount}>
                  <label>
                    <span>Montant de l’achat</span>
                    <span class="amt">
                      <input inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} autoFocus />
                      <b>€</b>
                    </span>
                  </label>
                  <Btn type="submit" kind="gold" icon="check" busy={busy}>
                    Valider
                  </Btn>
                </form>
              )}
              <div class="result-actions">
                {actions
                  .filter((a) => a.type !== 'ENTER_AMOUNT')
                  .map((a) => (
                    <Btn kind={a.type === 'REDEEM' ? 'gold' : a.type === 'UNDO' ? 'ghost' : 'primary'} icon={a.type === 'UNDO' ? 'undo-2' : a.type === 'REDEEM' ? 'gift' : 'shield-check'} busy={busy} onClick={() => act(a)}>
                      {a.type === 'UNDO' && a.until ? `${a.label} (${Math.max(0, Math.ceil((new Date(a.until).getTime() - Date.now()) / 1000))} s)` : a.label}
                    </Btn>
                  ))}
                {retry && (
                  <Btn kind="gold" icon="refresh-cw" busy={busy} onClick={() => validate(retry.qr, retry.extra, retry.key)}>
                    Renvoyer
                  </Btn>
                )}
              </div>
              <div class="result-foot">
                {result?.customer?.id && can('customers.read_basic') && <a href={`#/client/${result.customer.id}`}>Voir la fiche client</a>}
                {(paused || fresh || !live) && (
                  <Btn kind="ghost" small icon="arrow-right" onClick={next}>
                    Client suivant
                  </Btn>
                )}
              </div>
            </div>
          ) : (
            <div class="scan-help">
              <h2>Comment ça marche</h2>
              <ol>
                <li>Le client ouvre sa carte dans Apple Wallet ou Google Wallet.</li>
                <li>Placez le QR code dans le cadre, à 15–20 cm.</li>
                <li>Le passage est validé automatiquement. Une erreur ? Touchez « Annuler » dans les secondes qui suivent.</li>
              </ol>
            </div>
          )}
          <div class="scan-tools">
            {api.demo && (
              <button type="button" class="chip on" onClick={() => validate(`loyna:v1:demo-${uuid()}`, {})} disabled={busy}>
                <Icon name="qr-code" size={18} />
                Simuler un scan
              </button>
            )}
            {torch !== null && (
              <button type="button" class={`chip ${torch ? 'on' : ''}`} onClick={toggleTorch} aria-pressed={torch}>
                <Icon name={torch ? 'flashlight-off' : 'flashlight'} size={18} />
                Lampe
              </button>
            )}
            <button type="button" class={`chip ${sound ? 'on' : ''}`} onClick={toggleSound} aria-pressed={sound}>
              <Icon name={sound ? 'volume-2' : 'volume-x'} size={18} />
              Son
            </button>
            {live && (
              <button type="button" class="chip" onClick={stop}>
                <Icon name="camera-off" size={18} />
                Arrêter la caméra
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
