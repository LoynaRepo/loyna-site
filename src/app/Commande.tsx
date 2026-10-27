// Compte connecté sans commerce : écran « Votre commande » (RPC my_orders, dépôt LOYNA). Décision d'Ewan du
// 2026-10-27 : le compte est créé dans le panier avant le paiement ; après le paiement il voit ici sa commande,
// « LOYNA prépare votre carte ». Ewan crée lui-même le commerce pour ce compte : la commande y est rattachée et
// LOYNA Business s'ouvre à la connexion suivante. Sans commande : lien vers les offres.
import {useEffect, useState} from 'preact/hooks';
import {Icon} from './icons';
import {api, planLabel} from './state';
import {Badge, Btn, Spinner} from './ui';
import {date} from './util';

interface OrderItem {
  lookup_key: string | null;
  label: string;
  quantity: number;
  amount: number | null;
}
interface Order {
  plan: string;
  billing_period: 'monthly' | 'yearly';
  subscription_status: string;
  ordered_at: string;
  current_period_end: string | null;
  commitment_end: string | null;
  cancel_at: string | null;
  business_name: string | null;
  items: OrderItem[];
  merchant_linked: boolean;
}
type Tone = 'green' | 'amber' | 'red' | 'neutral';
const STATUS: Record<string, [string, Tone]> = {
  active: ['Abonnement actif', 'green'],
  trialing: ['Abonnement actif', 'green'],
  incomplete: ['Paiement en cours de validation', 'amber'],
  past_due: ['Paiement en retard', 'amber'],
  unpaid: ['Paiement en attente', 'amber'],
  paused: ['Abonnement en pause', 'neutral'],
  incomplete_expired: ['Paiement non abouti', 'red'],
  canceled: ['Abonnement terminé', 'neutral'],
};
const QR_DELIVERY_DAYS = 15; // docs/OFFRES.md du dépôt LOYNA

export function Commande({email, portal, onSignOut}: {email: string; portal: string; onSignOut: () => void}) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    setOrders(null);
    api.rpc<{orders: Order[]}>('my_orders').then(
      (r) => setOrders(r?.orders ?? []),
      (e) => setError(e instanceof Error ? e.message : 'Chargement impossible.'),
    );
  };
  useEffect(load, []);

  if (error)
    return (
      <>
        <h1>Connexion interrompue</h1>
        <p class="muted" role="alert">
          {error}
        </p>
        <div class="btn-row">
          <Btn icon="refresh-cw" onClick={load}>
            Réessayer
          </Btn>
          <Btn kind="ghost" icon="log-out" onClick={onSignOut}>
            Se déconnecter
          </Btn>
        </div>
      </>
    );
  if (!orders) return <Spinner label="Chargement de votre commande…" />;

  if (!orders.length)
    return (
      <>
        <p class="eyebrow">Votre compte LOYNA</p>
        <h1>Aucune commande pour ce compte</h1>
        <p class="muted">
          Vous êtes connecté avec <strong>{email}</strong>. Ce compte n’a pas encore de commande ni d’accès à un commerce.
        </p>
        <p class="muted small">Vous venez de payer ? Votre commande apparaît ici quelques instants après le paiement : rechargez la page.</p>
        <div class="btn-row">
          <Btn kind="gold" href="/tarifs/" icon="arrow-right">
            Voir les offres
          </Btn>
          <Btn kind="ghost" icon="refresh-cw" onClick={load}>
            Recharger
          </Btn>
        </div>
        <p class="muted small">
          Vous faites partie de l’équipe d’un commerce ? Demandez à votre responsable de vous inviter depuis le menu Équipe, ou écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a>.
        </p>
        <Btn kind="ghost" icon="log-out" onClick={onSignOut}>
          Se déconnecter
        </Btn>
      </>
    );

  const ready = orders.some((o) => o.merchant_linked);
  return (
    <>
      <p class="eyebrow">Votre compte LOYNA</p>
      <h1>{orders.length > 1 ? 'Vos commandes' : 'Votre commande'}</h1>
      {ready ? (
        <p class="note">
          <strong>Votre commerce est prêt.</strong> Rechargez la page pour ouvrir LOYNA Business.
        </p>
      ) : (
        <p class="note ord-note">
          <Icon name="sparkles" size={18} />
          <span>
            <strong>LOYNA prépare votre carte</strong> : vous recevrez un e-mail dès qu’elle est prête.
          </span>
        </p>
      )}
      {orders.map((o) => {
        const [label, tone] = STATUS[o.subscription_status] ?? [o.subscription_status, 'neutral'];
        const monthly = o.billing_period !== 'yearly';
        const qr = (o.items ?? []).filter((i) => /^loyna_qr_verre/.test(i.lookup_key ?? ''));
        const live = ['active', 'trialing', 'past_due'].includes(o.subscription_status);
        return (
          <article class="ord">
            <header class="ord-h">
              <strong>LOYNA {planLabel(o.plan)}</strong>
              <Badge tone={tone}>{label}</Badge>
            </header>
            <dl class="ord-dl">
              <div>
                <dt>Paiement</dt>
                <dd>{monthly ? 'mensuel, engagement de 12 mois' : 'annuel, 12 mois payés d’avance'}</dd>
              </div>
              <div>
                <dt>Commande du</dt>
                <dd>{date(o.ordered_at)}</dd>
              </div>
              {o.business_name && (
                <div>
                  <dt>Commerce</dt>
                  <dd>{o.business_name}</dd>
                </div>
              )}
              <div>
                <dt>QR codes sous verre</dt>
                <dd>
                  {qr.length
                    ? `${qr.map((i) => `${i.quantity} × ${i.label}`).join(', ')}, livrés sous ${QR_DELIVERY_DAYS} jours maximum à votre adresse de facturation`
                    : 'aucun'}
                </dd>
              </div>
              {live && o.current_period_end && (
                <div>
                  <dt>Prochaine échéance</dt>
                  <dd>{date(o.current_period_end)}</dd>
                </div>
              )}
              {monthly && o.commitment_end && (
                <div>
                  <dt>Fin d’engagement</dt>
                  <dd>{date(o.commitment_end)}</dd>
                </div>
              )}
              {o.cancel_at && (
                <div>
                  <dt>Fin de l’abonnement</dt>
                  <dd>{date(o.cancel_at)}</dd>
                </div>
              )}
            </dl>
          </article>
        );
      })}
      <div class="btn-row">
        {ready ? (
          <Btn kind="gold" icon="refresh-cw" onClick={() => location.reload()}>
            Ouvrir LOYNA Business
          </Btn>
        ) : (
          <Btn kind="gold" href="/merci/#elements" icon="palette">
            Envoyer logo et couleurs
          </Btn>
        )}
        <Btn kind="ghost" href={portal} icon="credit-card">
          Abonnement et factures
        </Btn>
      </div>
      <Btn kind="quiet" icon="log-out" onClick={onSignOut}>
        Se déconnecter
      </Btn>
    </>
  );
}
