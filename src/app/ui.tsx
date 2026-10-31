// Composants d'interface de LOYNA Business, à la charte du site (noir, or, crème).
import type {ComponentChildren} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {Icon} from './icons';
import {can, lockLabel, merchant, readOnly, toast, toasts} from './state';
import {copy, num, qrSvg} from './util';

type BtnKind = 'primary' | 'gold' | 'ghost' | 'danger' | 'quiet';
export function Btn(props: {
  kind?: BtnKind;
  icon?: string;
  busy?: boolean;
  small?: boolean;
  block?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  href?: string;
  target?: string;
  onClick?: (e: MouseEvent) => void;
  children?: ComponentChildren;
  title?: string;
  class?: string;
}) {
  const {kind = 'primary', icon, busy, small, block, type = 'button', disabled, href, onClick, children, title} = props;
  const cls = `b b--${kind}${small ? ' b--sm' : ''}${block ? ' b--block' : ''}${busy ? ' is-busy' : ''}${props.class ? ' ' + props.class : ''}`;
  const inner = (
    <>
      {icon && <Icon name={icon} size={small ? 16 : 18} />}
      {children && <span>{children}</span>}
    </>
  );
  if (href)
    return (
      <a class={cls} href={href} target={props.target} rel={props.target ? 'noopener' : undefined} title={title}>
        {inner}
      </a>
    );
  return (
    <button class={cls} type={type} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick} title={title} aria-label={!children ? title : undefined}>
      {inner}
    </button>
  );
}

export function Field(props: {label: string; hint?: ComponentChildren; error?: string; children: ComponentChildren; class?: string}) {
  return (
    <label class={`fld ${props.error ? 'has-err' : ''} ${props.class ?? ''}`}>
      <span class="fld-l">{props.label}</span>
      {props.children}
      {props.error ? <span class="fld-err">{props.error}</span> : props.hint ? <span class="fld-h">{props.hint}</span> : null}
    </label>
  );
}

export function Toggle(props: {checked: boolean; onChange: (v: boolean) => void; label: ComponentChildren; hint?: ComponentChildren; disabled?: boolean}) {
  return (
    <label class={`tgl ${props.disabled ? 'is-off' : ''}`}>
      <span class="tgl-t">
        <span class="tgl-l">{props.label}</span>
        {props.hint && <span class="tgl-h">{props.hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
      <span class="tgl-s" aria-hidden="true" />
    </label>
  );
}

export function Segmented<T extends string | number>(props: {value: T; options: {value: T; label: string; disabled?: boolean}[]; onChange: (v: T) => void; label: string}) {
  return (
    <div class="seg" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button type="button" role="radio" aria-checked={o.value === props.value} disabled={o.disabled} class={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({tone = 'neutral', children}: {tone?: 'neutral' | 'green' | 'gold' | 'red' | 'amber' | 'dark' | 'blue'; children: ComponentChildren}) {
  return <span class={`bdg bdg--${tone}`}>{children}</span>;
}

export function Spinner({label = 'Chargement…'}: {label?: string}) {
  return (
    <div class="spin-wrap" role="status">
      <span class="spin" aria-hidden="true" />
      <span class="sr-only">{label}</span>
    </div>
  );
}

export function Empty({icon = 'sparkles', title, children}: {icon?: string; title: string; children?: ComponentChildren}) {
  return (
    <div class="empty">
      <span class="empty-i">
        <Icon name={icon} size={26} />
      </span>
      <strong>{title}</strong>
      {children && <div class="empty-t">{children}</div>}
    </div>
  );
}

export function ErrorBox({error, retry}: {error: string; retry?: () => void}) {
  return (
    <div class="errbox" role="alert">
      <Icon name="triangle-alert" />
      <span>{error}</span>
      {retry && (
        <Btn kind="ghost" small icon="refresh-cw" onClick={retry}>
          Réessayer
        </Btn>
      )}
    </div>
  );
}

export function PageHead(props: {eyebrow?: string; title: string; children?: ComponentChildren; back?: {href: string; label: string}}) {
  return (
    <header class="ph">
      <div class="ph-t">
        {props.back && (
          <a class="ph-back" href={props.back.href}>
            <Icon name="chevron-left" size={16} />
            {props.back.label}
          </a>
        )}
        {props.eyebrow && <p class="eyebrow">{props.eyebrow}</p>}
        <h1>{props.title}</h1>
      </div>
      {props.children && <div class="ph-a">{props.children}</div>}
    </header>
  );
}

export function Panel(props: {title?: string; sub?: ComponentChildren; actions?: ComponentChildren; children: ComponentChildren; class?: string; dark?: boolean}) {
  return (
    <section class={`pnl ${props.dark ? 'pnl--dark' : ''} ${props.class ?? ''}`}>
      {(props.title || props.actions) && (
        <div class="pnl-h">
          <div>
            {props.title && <h2>{props.title}</h2>}
            {props.sub && <p class="pnl-sub">{props.sub}</p>}
          </div>
          {props.actions && <div class="pnl-a">{props.actions}</div>}
        </div>
      )}
      {props.children}
    </section>
  );
}

/** Fenêtre modale (élément <dialog> natif : focus et touche Échap gérés par le navigateur). */
export function Modal(props: {open: boolean; onClose: () => void; title: string; children: ComponentChildren; footer?: ComponentChildren; wide?: boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      class={`mdl ${props.wide ? 'mdl--wide' : ''}`}
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose();
      }}
    >
      {props.open && (
        <div class="mdl-c">
          <div class="mdl-h">
            <h2>{props.title}</h2>
            <button type="button" class="mdl-x" onClick={props.onClose} aria-label="Fermer">
              <Icon name="x" />
            </button>
          </div>
          <div class="mdl-b">{props.children}</div>
          {props.footer && <div class="mdl-f">{props.footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast toast--${t.tone}`}>
          <Icon name={t.tone === 'error' ? 'circle-x' : t.tone === 'info' ? 'info' : 'circle-check'} size={18} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Lien à copier, avec son QR code (lien d'inscription, lien d'activation d'un employé…). */
export function LinkBox({url, qr = true, note}: {url: string; qr?: boolean; note?: ComponentChildren}) {
  return (
    <div class={`linkbox ${qr ? '' : 'linkbox--noqr'}`}>
      {qr &&<div class="linkbox-qr" dangerouslySetInnerHTML={{__html: qrSvg(url)}} />}
      <div class="linkbox-t">
        <code>{url}</code>
        <div class="btn-row">
          <Btn small kind="ghost" icon="copy" onClick={async () => toast((await copy(url)) ? 'Lien copié' : 'Copie impossible : sélectionnez le lien.', 'info')}>
            Copier
          </Btn>
          <Btn small kind="ghost" icon="external-link" href={url} target="_blank">
            Ouvrir
          </Btn>
        </div>
        {note && <p class="muted small">{note}</p>}
      </div>
    </div>
  );
}

export {CardPreview} from './card';

/** Indicateur chiffré comparé à la période précédente (« +12 % vs 30 j précédents »). */
export function Kpi({label, def, cur, prev, pct, vs}: {label: string; def?: string; cur: number | null; prev: number | null; pct?: boolean; vs: string}) {
  const value = cur === null || cur === undefined ? '–' : pct ? `${num(cur)} %` : num(cur);
  let delta: {up: boolean; text: string} | null = null;
  if (cur !== null && cur !== undefined && prev !== null && prev !== undefined) {
    if (pct) {
      const d = Math.round((cur - prev) * 10) / 10;
      if (d !== 0) delta = {up: d > 0, text: `${d > 0 ? '+' : ''}${num(d)} pt`};
    } else if (prev > 0) {
      const d = Math.round(((cur - prev) / prev) * 100);
      if (d !== 0) delta = {up: d > 0, text: `${d > 0 ? '+' : ''}${d} %`};
    } else if (cur > 0) delta = {up: true, text: 'nouveau'};
  }
  return (
    <div class="kpi" title={def}>
      <span class="kpi-l">{label}</span>
      <strong class="kpi-v">{value}</strong>
      <span class="kpi-d">
        {delta ? (
          <span class={delta.up ? 'up' : 'down'}>
            <Icon name={delta.up ? 'trending-up' : 'trending-down'} size={15} />
            {delta.text}
          </span>
        ) : (
          <span class="flat">stable</span>
        )}{' '}
        {vs}
      </span>
    </div>
  );
}

/** Jauge de consommation de l'offre (cartes, notifications du mois) : limite null = illimité. */
export function UsageMeter({label, used, limit, extra}: {label: string; used: number; limit: number | null; extra?: ComponentChildren}) {
  const p = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  return (
    <div class={`meter ${p === null ? '' : p >= 100 ? 'is-full' : p >= 80 ? 'is-high' : ''}`}>
      <p class="meter-t">
        {label} : <b>{num(used)}</b>
        {limit === null ? ' · illimitées' : ` / ${num(limit)}`}
        {extra}
      </p>
      {p !== null && (
        <div class="meter-b" role="progressbar" aria-valuemin={0} aria-valuemax={limit ?? undefined} aria-valuenow={used} aria-label={label}>
          <span style={{width: `${Math.max(p, used > 0 ? 2 : 0)}%`}} />
        </div>
      )}
    </div>
  );
}

/** Pastille d'une fonction absente de l'offre : « Inclus dans Premium », « Inclus dans Pro ». */
export function LockBadge({feature}: {feature: string}) {
  return (
    <span class="bdg bdg--lock">
      <Icon name="lock" size={13} />
      {lockLabel(feature)}
    </span>
  );
}

/**
 * Zone de formulaires et d'actions : en consultation opérateur (lecture seule), tous ses champs et boutons sont
 * désactivés (fieldset disabled) et ses boutons d'action masqués ; les liens restent utilisables. Hors consultation,
 * aucun effet sur la page.
 */
export function ReadOnlyZone({children}: {children: ComponentChildren}) {
  if (!readOnly()) return <>{children}</>;
  return (
    <fieldset class="ro-zone" disabled>
      {children}
    </fieldset>
  );
}

/** Lien vers la page Abonnement (réservée aux profils qui gèrent les réglages). */
export function OffersLink({label = 'Voir les offres'}: {label?: string}) {
  if (!can('settings.manage')) return null;
  return (
    <Btn kind="ghost" small href="#/abonnement" icon="arrow-right">
      {label}
    </Btn>
  );
}

/** Notification telle qu'elle s'affiche sur le téléphone du client (aux couleurs du commerce). */
export function NotifPreview({title, body, when = 'maintenant'}: {title?: string | null; body: string; when?: string}) {
  const m = merchant.value!;
  return (
    <div class="notif">
      <span class="notif-app" style={{background: m.primary_color, color: m.secondary_color}}>
        {m.logo_url ? <img src={m.logo_url} alt="" /> : m.merchant_name.slice(0, 1)}
      </span>
      <span class="notif-t">
        <strong>{title || m.merchant_name}</strong>
        <span>{body}</span>
      </span>
      <small>{when}</small>
    </div>
  );
}

/** Déclenche une action asynchrone en gérant l'état « en cours ». */
export function useBusy(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

/** Charge des données et expose {data, error, loading, reload}. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{data: T | null; error: string | null; loading: boolean}>({data: null, error: null, loading: true});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({...s, loading: true, error: null}));
    fn().then(
      (data) => alive && setState({data, error: null, loading: false}),
      (e) => alive && setState({data: null, error: e instanceof Error ? e.message : 'Chargement impossible.', loading: false}),
    );
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  return {...state, reload: () => setTick((t) => t + 1), set: (data: T) => setState({data, error: null, loading: false})};
}
