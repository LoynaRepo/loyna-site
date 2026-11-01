<?php
// Formulaires de contact de loyna.fr : demande envoyée à contact@loyna.fr (fonction mail() d'OVH).
//  - contact : page /contact/
//  - rappel  : « Être rappelé » (accueil, tarifs) : téléphone obligatoire, créneau souhaité
//  - apercu  : « Recevoir cet aperçu » (configurateur) : commerce et aperçu de carte joints
//  - page /devenir-partenaire/ (type contact, sujets de SUJETS_PARTENAIRES) : candidature au programme partenaires ou
//    recommandation d'un commerce par un partenaire ; champs propres, tous recopiés dans le mail ; erreurs et
//    remerciement sur cette page (/devenir-partenaire/envoye/).
// Protections : POST uniquement, champ piège, délai de saisie, limite par adresse IP, en-têtes sans retour
// à la ligne (pas d'injection), réponse de l'expéditeur en Reply-To (reprise par l'agent Trieur).
declare(strict_types=1);
require __DIR__ . '/formulaires.inc.php';

const TYPES = ['contact', 'rappel', 'apercu'];
const SUJETS = [
    'Je veux une démo',
    'Je veux un exemple de carte à mon nom',
    'Question sur les tarifs',
    'Je suis déjà client',
    'Autre question',
];
// Programme partenaires (apporteurs d'affaires) : sujet => formulaire (et ancre) de /devenir-partenaire/
const SUJETS_PARTENAIRES = [
    'Devenir partenaire' => 'candidature',
    'Recommandation partenaire' => 'recommandation',
];
// Liste « Votre profil » de la candidature (src/pages/devenir-partenaire.astro, PROFILS) : à garder identique.
const PROFILS = [
    'Expert-comptable',
    'Vendeur de caisses ou de terminaux de paiement',
    'Fournisseur ou grossiste',
    'Agence web ou community manager',
    'Union de commerçants',
    'Commercial indépendant',
    'Particulier',
    'Autre',
];
const CRENEAUX = [
    'Dès que possible',
    'En matinée (9 h – 12 h)',
    'En début d’après-midi (14 h – 16 h)',
    'En fin d’après-midi (16 h – 19 h)',
];

$type = in_array($_POST['type'] ?? '', TYPES, true) ? (string) $_POST['type'] : 'contact';
$sujet = ligne('sujet', 60);
// Formulaire partenaire ('candidature' ou 'recommandation'), sinon '' (formulaires habituels).
$partenaire = $type === 'contact' ? (SUJETS_PARTENAIRES[$sujet] ?? '') : '';

function erreur(string $code): void
{
    global $partenaire;
    if ($partenaire !== '') {
        aller('/devenir-partenaire/?erreur=' . $code . '&form=' . $partenaire . '#' . $partenaire);
    }
    aller('/contact/?erreur=' . $code . '#contact-form');
}
function envoye(): void
{
    global $partenaire;
    aller($partenaire !== '' ? '/devenir-partenaire/envoye/?f=' . $partenaire : '/contact/envoye/');
}

$piege = false;
$code = controle_envoi($piege);
if ($code === 'methode') {
    aller('/contact/');
}
if ($piege) {
    envoye(); // robot : on fait comme si tout allait bien
}
if ($code !== '') {
    erreur($code);
}

$page = preg_match('#^/[a-z0-9/-]{0,80}$#', (string) ($_POST['page'] ?? '')) ? (string) $_POST['page'] : '/contact/';
$nom = ligne('nom', 80);
$commerce = ligne('commerce', 100);
$email = ligne('email', 120);
$tel = ligne('telephone', 30);
$offre = preg_match('/^[a-z-]{3,30}$/', (string) ($_POST['offre'] ?? '')) ? (string) $_POST['offre'] : '';
$apercu = texte('apercu', 600);
$message = texte('message', 3000);

$fiche = ''; // formulaires partenaires : lignes propres au formulaire, en tête du mail
if ($partenaire === 'candidature') {
    $ville = ligne('ville', 80);
    $profil = ligne('profil', 60);
    $structure = ligne('structure', 100);
    if (!in_array($profil, PROFILS, true)) {
        $profil = 'non précisé';
    }
    if ($nom === '' || $ville === '') {
        erreur('champs');
    }
    $commerce = ($structure !== '' ? $structure : $nom) . " ($ville)"; // objet du mail
    $fiche = "Candidature au programme partenaires LOYNA (apporteur d'affaires).\n"
        . "Ce n'est pas un commerçant : pas de fiche prospect.\n\n"
        . "Nom : $nom\n"
        . "E-mail : $email\n"
        . 'Téléphone : ' . ($tel !== '' ? $tel : 'non renseigné') . "\n"
        . "Ville : $ville\n"
        . "Profil : $profil\n"
        . 'Structure : ' . ($structure !== '' ? $structure : 'non renseignée') . "\n";
} elseif ($partenaire === 'recommandation') {
    $ville = ligne('ville_commerce', 80);
    $commercant = ligne('commercant', 80);
    $joindre = ligne('contact_commercant', 120);
    if ($nom === '' || $commerce === '' || $ville === '' || $joindre === '') {
        erreur('champs');
    }
    if (!filter_var($joindre, FILTER_VALIDATE_EMAIL) && !preg_match('/^[0-9+ ().-]{8,30}$/', $joindre)) {
        erreur('contact');
    }
    if (($_POST['accord'] ?? '') !== 'oui') {
        erreur('accord');
    }
    $fiche = "Recommandation d'un commerce par un partenaire LOYNA (apporteur d'affaires).\n"
        . "À confirmer au partenaire sous 2 jours ouvrés : retenue ou non (commerce déjà client, essai déjà démarré, ou échange avec LOYNA dans les 90 jours avant la recommandation).\n\n"
        . "Commerce recommandé : $commerce\n"
        . "Ville du commerce : $ville\n"
        . 'Commerçant : ' . ($commercant !== '' ? $commercant : 'nom non renseigné') . "\n"
        . "Pour joindre le commerçant : $joindre\n"
        . "Accord du commerçant pour être contacté par LOYNA : oui (case cochée par le partenaire)\n\n"
        . "Partenaire : $nom\n"
        . "E-mail du partenaire : $email\n";
    $commerce .= " ($ville)"; // objet du mail
} elseif ($type === 'rappel') {
    $creneau = ligne('creneau', 60);
    if (!in_array($creneau, CRENEAUX, true)) {
        $creneau = 'Dès que possible';
    }
    if (!preg_match('/^[0-9+ ().-]{8,30}$/', $tel)) {
        erreur('telephone');
    }
    $sujet = 'Être rappelé';
    $message = "Demande de rappel téléphonique (échange de 15 minutes).\nCréneau souhaité : $creneau.";
} elseif ($type === 'apercu') {
    $sujet = 'Je veux un exemple de carte à mon nom';
    if ($nom === '') {
        $nom = 'Non précisé';
    }
    $message = "Je souhaite recevoir l'aperçu de ma carte de fidélité à mon nom, préparé dans le configurateur du site.";
} elseif (!in_array($sujet, SUJETS, true)) {
    $sujet = 'Autre question';
}

if ($partenaire === '' && ($nom === '' || $commerce === '' || $message === '')) {
    erreur('champs');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    erreur('email');
}
// Plus de 3 liens dans le message : très probablement un spam.
if (preg_match_all('#https?://#i', $message) > 3) {
    erreur('liens');
}
// Partenaires : compteur à part, un peu plus large (plusieurs recommandations à la suite)
$canal = $partenaire !== '' ? 'partenaire' : 'contact';
if (limite_atteinte($canal, $partenaire !== '' ? 10 : 5)) {
    erreur('limite');
}

$corps = $partenaire !== ''
    ? "Nouveau message depuis le site loyna.fr\n\n"
    . $fiche
    . "Demande : $sujet\n"
    . "\nMessage :\n" . ($message !== '' ? $message : '(aucun message)') . "\n\n"
    . '— Envoyé le ' . date('d/m/Y à H:i') . " depuis https://loyna.fr$page\n"
    . "Répondre à ce message écrit directement à $email.\n"
    : "Nouveau message depuis le site loyna.fr\n\n"
    . "Nom : $nom\n"
    . "Commerce : $commerce\n"
    . "E-mail : $email\n"
    . 'Téléphone : ' . ($tel !== '' ? $tel : 'non renseigné') . "\n"
    . "Demande : $sujet\n"
    . ($offre !== '' ? "Offre consultée : $offre\n" : '')
    . ($apercu !== '' ? "\nAperçu de carte préparé sur le site :\n$apercu\n" : '')
    . "\nMessage :\n$message\n\n"
    . '— Envoyé le ' . date('d/m/Y à H:i') . " depuis https://loyna.fr$page\n"
    . "Répondre à ce message écrit directement à $email.\n";

$entetes = implode("\r\n", [
    'From: ' . entete('Site LOYNA') . ' <' . DEST . '>',
    'Reply-To: ' . entete($nom) . ' <' . $email . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: loyna.fr',
]);

if (!mail(DEST, entete("[Site LOYNA] $sujet · $commerce"), $corps, $entetes, '-f' . DEST)) {
    erreur('envoi');
}
noter_envoi($canal);
envoye();
