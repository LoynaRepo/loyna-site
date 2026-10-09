// Aperçu de la carte de fidélité Wallet aux couleurs du commerce (espace client et page d'inscription).
import type {JSX} from 'preact';
import {initials} from './util';

/** Aperçu de la carte de fidélité dans le Wallet (aux couleurs du commerce). */
export function CardPreview(props: {
  name: string;
  program?: string;
  logo?: string | null;
  bg: string;
  fg: string;
  total: number;
  filled?: number;
  label?: string;
  reward?: string;
  stamps?: boolean;
}) {
  const total = Math.max(1, Math.min(props.total || 10, 20));
  const filled = Math.min(props.filled ?? Math.max(1, Math.round(total * 0.6)), total);
  const cols = total <= 6 ? total : total <= 12 ? Math.ceil(total / 2) : Math.ceil(total / 3);
  return (
    <div class="wc" style={{'--bg': props.bg, '--fg': props.fg} as JSX.CSSProperties}>
      <div class="wc-h">
        <span class="wc-logo">{props.logo ? <img src={props.logo} alt="" /> : initials(props.name)}</span>
        <span class="wc-n">
          <strong>{props.name || 'Votre commerce'}</strong>
          <small>{props.program || 'Carte de fidélité'}</small>
        </span>
        <span class="wc-c">
          <small>{(props.label || 'passages').toUpperCase()}</small>
          <b>
            {filled}
            {props.stamps !== false && <i>/{props.total}</i>}
          </b>
        </span>
      </div>
      {props.stamps !== false ? (
        <div class="wc-s" style={{gridTemplateColumns: `repeat(${cols}, 1fr)`}}>
          {Array.from({length: total}, (_, i) => (
            <span class={i < filled ? 'on' : ''} />
          ))}
        </div>
      ) : (
        <div class="wc-bar">
          <span style={{width: `${Math.round((filled / Math.max(1, props.total)) * 100)}%`}} />
        </div>
      )}
      <div class="wc-r">
        <small>Récompense</small>
        <span>{props.reward || 'Récompense offerte'}</span>
      </div>
    </div>
  );
}

