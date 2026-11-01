// Inscription d'un client final (loyna.fr/join/<commerce>) : page publique, sans compte.
// Formulaire minimal, cases de consentement séparées et non cochées, champ piège anti-robot.
// Lien de parrainage (offre Pro) : /join/<commerce>?parrain=<code>, transmis en referral_code.
import type {ComponentChildren, JSX} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {CardPreview} from './card';
import {publicEdge} from './http';
import {Icon} from './icons';
import {frenchTypography, initials} from './util';

interface Page {
  /** PAUSED : carte en pause (essai terminé, impayé, abonnement terminé, suspension). Le serveur ne donne alors que nom, logo et couleurs. */
  status: 'OK' | 'NOT_FOUND' | 'PROGRAM_UNAVAILABLE' | 'PAUSED';
  merchant?: {name: string; slug: string; business_type: string | null; logo_url: string | null; primary_color: string; secondary_color: string; city: string | null; website: string | null};
  program?: {name: string; type: string; reward_threshold: number; unit_singular: string; unit_plural: string; points_per_event: number; spend_points_per_unit: number | null};
  rewards?: {name: string; description: string | null; threshold: number}[];
  form?: {collect_last_name: boolean; collect_phone: boolean; require_phone: boolean; collect_email: boolean; collect_birthday: boolean};
  /** false : inscriptions refusées par le serveur (plus de limite de cartes depuis la grille du 2026-10-31 : ne devrait plus arriver). */
  enrollment_open?: boolean;
  /** Parrainage ouvert chez ce commerce : bonus pour le filleul et le parrain à la première visite. */
  referral?: {bonus: number; unit: string} | null;
  legal?: {terms_url: string | null; privacy_url: string | null; consent_version: string | null};
  platform?: 'apple' | 'google' | null;
}
interface Done {
  first_name: string;
  wallet: {apple_pass_url: string | null; google_save_url: string | null; preferred: 'apple' | 'google' | null};
}

function slugFromPath(): string | null {
  const m = location.pathname.match(/^\/join\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\/?$/);
  // en développement (sans .htaccess) : /join/?slug=<commerce>
  if (!m && import.meta.env.DEV) return new URLSearchParams(location.search).get('slug');
  return m ? m[1] : null;
}

/** Code de parrainage de l'adresse (?parrain=…), seulement s'il a la forme attendue par le serveur. */
function referralFromUrl(): string | null {
  const v = (new URLSearchParams(location.search).get('parrain') ?? '').trim().toUpperCase();
  return /^[A-Z2-9]{6,10}$/.test(v) ? v : null;
}

export default function Join() {
  const [slug] = useState(slugFromPath);
  const [referralCode] = useState(referralFromUrl);
  const [page, setPage] = useState<Page | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [f, setF] = useState({first_name: '', last_name: '', phone: '', email: '', birthday: '', terms: false, wallet: false, website: ''});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [full, setFull] = useState(false); // toutes les cartes du commerce sont utilisées

  useEffect(() => frenchTypography(), []);
  const demo = !!slug && /^demo-\d{4,9}$/.test(slug);
  const load = () => {
    if (!slug) return setPage({status: 'NOT_FOUND'});
    if (demo) {
      const q = new URLSearchParams(location.search);
      const plan = (q.get('offre') ?? '').toUpperCase();
      import('./mock').then((m) => setPage(m.demoJoinPage(Number(slug.slice(5)), {plan: plan === 'STARTER' || plan === 'PRO' ? plan : undefined, full: q.has('complet'), paused: q.has('arret')})));
      return;
    }
    setLoadErr('');
    publicEdge<Page>('customer-enroll', {method: 'GET', query: {slug}}).then(
      (p) => {
        setPage(p);
        if (p.merchant) document.title = `Carte de fidélité ${p.merchant.name}`;
      },
      (e) => (e?.data?.status === 'PAUSED' ? setPage(e.data) : e?.status === 404 ? setPage({status: 'NOT_FOUND'}) : setLoadErr(e?.message ?? 'Chargement impossible.')),
    );
  };
  useEffect(load, []);

  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({...x, [k]: v}));

  if (loadErr)
    return (
      <Shell>
        <div class="j-box">
          <h1>Connexion impossible</h1>
          <p>{loadErr}</p>
          <button type="button" class="b b--primary" onClick={load}>
            Réessayer
          </button>
        </div>
      </Shell>
    );
  if (!page)
    return (
      <Shell>
        <div class="spin-wrap" role="status">
          <span class="spin" />
          <span class="sr-only">Chargement…</span>
        </div>
      </Shell>
    );
  // Programme en pause : la carte reste chez le client, avec son solde (cahier des charges de la grille, section 2.2)
  if (page.status === 'PAUSED' && page.merchant) {
    const pm = page.merchant;
    return (
      <Shell>
        <header class="j-head" style={{'--m-bg': pm.primary_color, '--m-fg': pm.secondary_color} as JSX.CSSProperties}>
          <span class="j-logo">{pm.logo_url ? <img src={pm.logo_url} alt="" /> : initials(pm.name)}</span>
          <div>
            <strong>{pm.name}</strong>
            <small>Carte de fidélité</small>
          </div>
        </header>
        <div class="j-box">
          <div class="j-full" role="status">
            <Icon name="clock" size={22} />
            <div>Le programme de fidélité de {pm.name} est en pause. Si vous avez déjà la carte, votre solde est conservé.</div>
          </div>
        </div>
      </Shell>
    );
  }
  if (page.status !== 'OK' || !page.merchant || !page.program || !page.form)
    return (
      <Shell>
        <div class="j-box">
          <h1>{page.status === 'PROGRAM_UNAVAILABLE' ? 'Programme momentanément indisponible' : 'Lien d’inscription introuvable'}</h1>
          <p>
            {page.status === 'PROGRAM_UNAVAILABLE'
              ? `Le programme de fidélité ${page.merchant?.name ? `de ${page.merchant.name} ` : ''}n’accepte pas d’inscription pour le moment. Revenez un peu plus tard ou demandez en caisse.`
              : 'Ce lien d’inscription n’existe pas ou plus. Scannez de nouveau le QR code affiché au comptoir.'}
          </p>
        </div>
      </Shell>
    );

  const {merchant: m, program: p, form, legal} = page;
  const rewards = page.rewards ?? [];
  const closed = full || page.enrollment_open === false;
  const unit = (n: number) => (n > 1 ? p.unit_plural : p.unit_singular);
  const style = {'--m-bg': m.primary_color, '--m-fg': m.secondary_color} as JSX.CSSProperties;

  const submit = async (e: Event) => {
    e.preventDefault();
    setError('');
    if (!f.first_name.trim()) return setError('Indiquez votre prénom.');
    if (form.require_phone && !f.phone.trim()) return setError('Indiquez votre numéro de téléphone.');
    if (!f.terms) return setError('Cochez la case d’adhésion au programme de fidélité.');
    setBusy(true);
    if (demo) {
      await new Promise((res) => setTimeout(res, 500));
      setDone({first_name: f.first_name.trim(), wallet: {apple_pass_url: '#demo', google_save_url: '#demo', preferred: null}});
      setBusy(false);
      return;
    }
    try {
      const r = await publicEdge<Done>('customer-enroll', {
        body: {
          merchant_slug: m.slug,
          first_name: f.first_name.trim(),
          last_name: form.collect_last_name ? f.last_name.trim() || null : null,
          phone: form.collect_phone ? f.phone.trim() || null : null,
          email: form.collect_email ? f.email.trim() || null : null,
          birthday: form.collect_birthday ? f.birthday || null : null,
          consents: {loyalty_terms: true, marketing_wallet: f.wallet},
          consent_version: legal?.consent_version ?? null,
          ...(referralCode && page.referral ? {referral_code: referralCode} : {}),
          website: f.website,
        },
      });
      setDone(r);
      window.scrollTo({top: 0, behavior: 'smooth'});
    } catch (err: any) {
      if (err?.code === 'MERCHANT_PAUSED') {
        setPage({status: 'PAUSED', merchant: m}); // passé en pause depuis l'ouverture de la page
        window.scrollTo({top: 0, behavior: 'smooth'});
        return;
      }
      if (err?.code === 'CARDS_LIMIT_REACHED') {
        setFull(true);
        window.scrollTo({top: 0, behavior: 'smooth'});
        return;
      }
      const issues = err?.data?.error?.details?.issues;
      setError(Array.isArray(issues) && issues[0]?.message ? issues[0].message : (err?.message ?? 'Inscription impossible.'));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <header class="j-head" style={style}>
      <span class="j-logo">{m.logo_url ? <img src={m.logo_url} alt="" /> : initials(m.name)}</span>
      <div>
        <strong>{m.name}</strong>
        <small>{[m.business_type, m.city].filter(Boolean).join(' · ') || 'Carte de fidélité'}</small>
      </div>
    </header>
  );

  if (done) {
    const buttons = [
      done.wallet.apple_pass_url && {key: 'apple', url: done.wallet.apple_pass_url, top: 'Ajouter à', name: 'Apple Wallet'},
      done.wallet.google_save_url && {key: 'google', url: done.wallet.google_save_url, top: 'Enregistrer dans', name: 'Google Wallet'},
    ].filter(Boolean) as {key: string; url: string; top: string; name: string}[];
    buttons.sort((a) => (a.key === done.wallet.preferred ? -1 : 1));
    return (
      <Shell>
        {header}
        <div class="j-box j-done">
          <span class="j-done-i">
            <Icon name="circle-check" size={34} />
          </span>
          <h1>Bienvenue {done.first_name} !</h1>
          {buttons.length ? (
            <>
              <p>Dernière étape : ajoutez votre carte à votre téléphone. Elle sera toujours à portée de main, sans application.</p>
              <div class="j-wallets">
                {buttons.map((b) => (
                  <a class={`wallet-btn wallet-btn--${b.key}`} href={b.url} rel="noopener">
                    <Icon name="wallet" size={24} />
                    <span>
                      <small>{b.top}</small>
                      <strong>{b.name}</strong>
                    </span>
                  </a>
                ))}
              </div>
              <p class="j-small">À chaque visite, présentez votre carte en caisse : vos {p.unit_plural} s’ajoutent automatiquement.</p>
              {demo && <p class="note">Démonstration : avec un vrai commerce, ces boutons ajoutent la carte au Wallet du client. Aucune donnée n’a été enregistrée.</p>}
            </>
          ) : (
            <p>Votre inscription est bien enregistrée. L’ajout de la carte au téléphone n’est pas encore disponible : votre commerçant vous la présentera lors de votre prochaine visite.</p>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {header}
      <div class="j-hero">
        <CardPreview
          name={m.name}
          program={p.name}
          logo={m.logo_url}
          bg={m.primary_color}
          fg={m.secondary_color}
          total={p.reward_threshold}
          filled={1}
          label={p.unit_plural}
          reward={rewards[0]?.name}
          stamps={p.type === 'VISITS' && p.reward_threshold <= 20}
        />
      </div>
      <div class="j-box">
        <h1>Votre carte de fidélité {m.name}</h1>
        {rewards.length > 0 && (
          <ul class="j-rewards">
            {rewards.map((r) => (
              <li>
                <Icon name="gift" size={18} />
                <span>
                  <strong>{r.name}</strong> à {r.threshold} {unit(r.threshold)}
                  {r.description && <small>{r.description}</small>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {closed ? (
          <div class="j-full" role="status">
            <Icon name="clock" size={22} />
            <div>
              <strong>Les inscriptions sont momentanément complètes.</strong>
              <p>Parlez-en à {m.name} : le commerce vous inscrira très vite. Merci de votre patience !</p>
            </div>
          </div>
        ) : (
          <>
            {referralCode && page.referral && (
              <div class="j-ref">
                <Icon name="gift" size={22} />
                <p>
                  <strong>Vous avez été parrainé :</strong> vous et votre parrain gagnez {page.referral.bonus} {page.referral.unit} à votre première visite chez {m.name}.
                </p>
              </div>
            )}
            <form class="form j-form" onSubmit={submit} noValidate>
              <label class="fld">
                <span class="fld-l">Prénom</span>
                <input type="text" name="given-name" autoComplete="given-name" maxLength={60} required value={f.first_name} onInput={(e) => set('first_name', (e.target as HTMLInputElement).value)} />
              </label>
              {form.collect_last_name && (
                <label class="fld">
                  <span class="fld-l">Nom (facultatif)</span>
                  <input type="text" autoComplete="family-name" maxLength={80} value={f.last_name} onInput={(e) => set('last_name', (e.target as HTMLInputElement).value)} />
                </label>
              )}
              {form.collect_phone && (
                <label class="fld">
                  <span class="fld-l">Téléphone {form.require_phone ? '' : '(facultatif)'}</span>
                  <input type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required={form.require_phone} value={f.phone} onInput={(e) => set('phone', (e.target as HTMLInputElement).value)} />
                </label>
              )}
              {form.collect_email && (
                <label class="fld">
                  <span class="fld-l">E-mail (facultatif)</span>
                  <input type="email" autoComplete="email" maxLength={254} value={f.email} onInput={(e) => set('email', (e.target as HTMLInputElement).value)} />
                </label>
              )}
              {form.collect_birthday && (
                <label class="fld">
                  <span class="fld-l">Date d’anniversaire (facultatif)</span>
                  <input type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={f.birthday} onInput={(e) => set('birthday', (e.target as HTMLInputElement).value)} />
                  <span class="fld-h">Pour une attention le jour J.</span>
                </label>
              )}
              <div class="hp" aria-hidden="true">
                <label>
                  Site web
                  <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onInput={(e) => set('website', (e.target as HTMLInputElement).value)} />
                </label>
              </div>
              <div class="consents-f">
                <label class="check">
                  <input type="checkbox" checked={f.terms} onChange={(e) => set('terms', (e.target as HTMLInputElement).checked)} />
                  <span>
                    J’adhère au programme de fidélité de {m.name}
                    {legal?.terms_url && (
                      <>
                        {' '}
                        (
                        <a href={legal.terms_url} target="_blank" rel="noopener">
                          conditions
                        </a>
                        )
                      </>
                    )}
                    . <em>Obligatoire</em>
                  </span>
                </label>
                <label class="check">
                  <input type="checkbox" checked={f.wallet} onChange={(e) => set('wallet', (e.target as HTMLInputElement).checked)} />
                  <span>J’accepte de recevoir les offres de {m.name} dans mon Wallet.</span>
                </label>
              </div>
              {error && (
                <p class="form-err" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" class={`b b--gold b--block ${busy ? 'is-busy' : ''}`} disabled={busy} aria-busy={busy || undefined}>
                <Icon name="wallet" size={18} />
                <span>Créer ma carte</span>
              </button>
              <p class="j-small">
                Vos données servent uniquement au programme de fidélité de {m.name}. Vous pouvez retirer vos accords ou supprimer vos données à tout moment, depuis le lien « Mes préférences » au dos de votre carte.
                {legal?.privacy_url && (
                  <>
                    {' '}
                    <a href={legal.privacy_url} target="_blank" rel="noopener">
                      Politique de confidentialité
                    </a>
                    .
                  </>
                )}
              </p>
            </form>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({children}: {children: ComponentChildren}) {
  return (
    <div class="j">
      {children}
      <footer class="j-foot">
        Carte de fidélité propulsée par{' '}
        <a href="/" rel="noopener">
          LOYNA
        </a>
      </footer>
    </div>
  );
}
