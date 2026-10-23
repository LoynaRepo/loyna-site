// Composants d'interface du panel commercial : mêmes classes et même rendu que LOYNA Business
// (src/app/ui.tsx, styles src/app/styles/base.css et business.css), sans dépendre de son état ni de Supabase.
import type {ComponentChildren} from 'preact';
import {Icon} from './icons';
import {copier, fr, lienSur} from './format';
import {toast, toasts} from './store';

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
  external?: boolean;
  onClick?: (e: MouseEvent) => void;
  children?: ComponentChildren;
  title?: string;
  class?: string;
}) {
  const {kind = 'primary', icon, busy, small, block, type = 'button', disabled, href, onClick, children, title, external} = props;
  const cls = `b b--${kind}${small ? ' b--sm' : ''}${block ? ' b--block' : ''}${busy ? ' is-busy' : ''}${props.class ? ' ' + props.class : ''}`;
  const inner = (
    <>
      {icon && <Icon name={icon} size={small ? 16 : 18} />}
      {children && <span>{children}</span>}
    </>
  );
  if (href)
    return (
      <a class={cls} href={href} title={title} aria-label={!children ? title : undefined} {...(external ? {target: '_blank', rel: 'noopener noreferrer'} : {})}>
        {inner}
      </a>
    );
  return (
    <button class={cls} type={type} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick} title={title} aria-label={!children ? title : undefined}>
      {inner}
    </button>
  );
}

export function Field(props: {label: string; hint?: ComponentChildren; children: ComponentChildren; class?: string}) {
  return (
    <label class={`fld ${props.class ?? ''}`}>
      <span class="fld-l">{props.label}</span>
      {props.children}
      {props.hint ? <span class="fld-h">{props.hint}</span> : null}
    </label>
  );
}

export type Tone = 'neutral' | 'green' | 'gold' | 'red' | 'amber' | 'dark' | 'blue';
export function Badge({tone = 'neutral', children, title}: {tone?: Tone; children: ComponentChildren; title?: string}) {
  return (
    <span class={`bdg bdg--${tone}`} title={title}>
      {children}
    </span>
  );
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

export function Panel(props: {title?: string; sub?: ComponentChildren; actions?: ComponentChildren; children: ComponentChildren; class?: string; dark?: boolean; id?: string}) {
  return (
    <section class={`pnl ${props.dark ? 'pnl--dark' : ''} ${props.class ?? ''}`} id={props.id}>
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

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast toast--${t.ton}`}>
          <Icon name={t.ton === 'error' ? 'circle-x' : t.ton === 'info' ? 'info' : 'circle-check'} size={18} />
          <span>{t.texte}</span>
        </div>
      ))}
    </div>
  );
}

/** Bouton « Copier » (texte d'un mail, lien de paiement…). */
export function Copier({texte, label = 'Copier', small = true}: {texte: string; label?: string; small?: boolean}) {
  return (
    <Btn kind="ghost" small={small} icon="copy" onClick={async () => toast((await copier(texte)) ? 'Copié' : 'Copie impossible : sélectionnez le texte.', 'info')}>
      {label}
    </Btn>
  );
}

/** Lien externe sûr (http/https seulement), ouvert dans un nouvel onglet sans référent. */
export function Lien({href, children, class: cls}: {href: string; children?: ComponentChildren; class?: string}) {
  const u = lienSur(href);
  if (!u) return <span class={cls}>{children ?? href}</span>;
  return (
    <a href={u} target="_blank" rel="noopener noreferrer" class={cls}>
      {children ?? u}
    </a>
  );
}

const RE_URL = /(https?:\/\/[^\s<>"'`\]\[{}|\\^]+)/g;
const RE_FIN = /[.,;:!?»”’')]+$/;
/** Texte brut (données des fiches, vault) : les adresses web deviennent des liens, rien n'est interprété en HTML. */
export function TexteLie({texte}: {texte: string}) {
  const t = fr((texte || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b || a));
  const out: ComponentChildren[] = [];
  let i = 0;
  for (const m of t.matchAll(RE_URL)) {
    let url = m[0];
    const fin = RE_FIN.exec(url)?.[0] ?? '';
    if (fin && !(fin === ')' && url.includes('('))) url = url.slice(0, url.length - fin.length);
    out.push(t.slice(i, m.index));
    out.push(<Lien href={url}>{url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</Lien>);
    i = (m.index ?? 0) + url.length;
  }
  out.push(t.slice(i));
  return <>{out}</>;
}
