// Clients : recherche (anti-rebond 300 ms) et filtres. Les coordonnées ne sont renvoyées par le
// serveur qu'aux comptes autorisés (contact_visible) ; un employé voit l'initiale du nom.
import {useEffect, useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, merchant} from '../state';
import {Badge, Btn, Empty, ErrorBox, PageHead, Spinner} from '../ui';
import {ago, initials, num} from '../util';

interface Row {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  balance: number | null;
  visits_count: number | null;
  rewards_available: number;
  last_activity_at: string | null;
  created_at: string;
}
interface Page {
  total: number;
  contact_visible: boolean;
  items: Row[];
}
const FILTERS = [
  {value: 'ALL', label: 'Tous'},
  {value: 'ACTIVE', label: 'Venus ce mois-ci'},
  {value: 'REWARD_AVAILABLE', label: 'Récompense à utiliser'},
  {value: 'NEW', label: 'Nouveaux'},
  {value: 'INACTIVE', label: 'Absents depuis 60 j'},
];
const PAGE = 50;

export function Clients() {
  const m = merchant.value!;
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{total: number; contact: boolean} | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async (offset: number) => {
    offset ? setMore(true) : setLoading(true);
    setError('');
    try {
      const p = await api.rpc<Page>('search_customers', {p_query: query || null, p_filter: filter, p_limit: PAGE, p_offset: offset, p_merchant_id: m.merchant_id});
      setRows((r) => (offset ? [...r, ...p.items] : p.items));
      setMeta({total: p.total, contact: p.contact_visible});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
      setMore(false);
    }
  };
  useEffect(() => {
    load(0);
  }, [query, filter, m.merchant_id]);

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Clients">
        {meta && <span class="ph-count">{meta.total > 1 ? `${num(meta.total)} clients` : `${num(meta.total)} client`}</span>}
      </PageHead>

      <div class="toolbar">
        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">Rechercher un client</span>
          <input type="search" placeholder={meta?.contact ? 'Prénom, nom, téléphone ou e-mail' : 'Prénom ou nom'} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </label>
        <div class="chips" role="radiogroup" aria-label="Filtrer">
          {FILTERS.map((f) => (
            <button type="button" role="radio" aria-checked={filter === f.value} class={`chip ${filter === f.value ? 'on' : ''}`} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorBox error={error} retry={() => load(0)} />
      ) : loading ? (
        <Spinner />
      ) : !rows.length ? (
        <Empty icon="users" title={query || filter !== 'ALL' ? 'Aucun client ne correspond' : 'Pas encore de client inscrit'}>
          {query || filter !== 'ALL' ? 'Essayez une autre recherche ou un autre filtre.' : 'Affichez le QR code d’inscription au comptoir : vos clients ajoutent leur carte en quelques secondes.'}
        </Empty>
      ) : (
        <>
          <ul class="clist">
            {rows.map((r) => (
              <li>
                <a href={`#/client/${r.id}`} class="crow">
                  <span class="avatar">{initials(`${r.first_name} ${r.last_name ?? ''}`)}</span>
                  <span class="crow-n">
                    <strong>
                      {r.first_name} {r.last_name ?? ''}
                    </strong>
                    <small>{meta?.contact ? r.phone || r.email || 'Sans coordonnées' : `Inscrit ${ago(r.created_at)}`}</small>
                  </span>
                  <span class="crow-b">
                    <b>{num(r.balance ?? 0)}</b>
                    <small>solde</small>
                  </span>
                  <span class="crow-r">{r.rewards_available > 0 ? <Badge tone="gold">{r.rewards_available > 1 ? `${r.rewards_available} récompenses` : '1 récompense'}</Badge> : null}</span>
                  <span class="crow-d">
                    <small>Dernière visite</small>
                    {ago(r.last_activity_at)}
                  </span>
                  <Icon name="chevron-right" size={18} class="crow-go" />
                </a>
              </li>
            ))}
          </ul>
          {meta && rows.length < meta.total && (
            <div class="center-row">
              <Btn kind="ghost" busy={more} onClick={() => load(rows.length)}>
                Afficher plus ({num(meta.total - rows.length)})
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}
