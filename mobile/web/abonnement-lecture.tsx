// Application mobile : l'écran Abonnement complet du site (offres, panier, portail Stripe) n'y entre pas (règle 3.1.1
// d'Apple) ; vite.config.ts le remplace par la version en lecture seule.
export {AbonnementApp as Abonnement} from '../../src/app/views/AbonnementApp';
