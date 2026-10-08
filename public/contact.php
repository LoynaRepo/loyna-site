<?php
// Formulaires de contact de loyna.fr : demande envoyée à contact@loyna.fr (fonction mail() d'OVH).
//  - contact : page /contact/
//  - rappel  : « Être rappelé » (accueil, tarifs) : téléphone obligatoire, créneau souhaité
//  - apercu  : « Recevoir cet aperçu » (configurateur) : commerce et aperçu de carte joints
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
const CRENEAUX = [
    'Dès que possible',
    'En matinée (9 h – 12 h)',
    'En début d’après-midi (14 h – 16 h)',
    'En fin d’après-midi (16 h – 19 h)',
];

function erreur(string $code): void
{
    aller('/contact/?erreur=' . $code . '#contact-form');
}

$piege = false;
$code = controle_envoi($piege);
if ($code === 'methode') {
    aller('/contact/');
}
if ($piege) {
    aller('/contact/envoye/'); // robot : on fait comme si tout allait bien
}
if ($code !== '') {
    erreur($code);
}

$type = in_array($_POST['type'] ?? '', TYPES, true) ? (string) $_POST['type'] : 'contact';
$page = preg_match('#^/[a-z0-9/-]{0,80}$#', (string) ($_POST['page'] ?? '')) ? (string) $_POST['page'] : '/contact/';
$nom = ligne('nom', 80);
$commerce = ligne('commerce', 100);
$email = ligne('email', 120);
$tel = ligne('telephone', 30);
$sujet = ligne('sujet', 60);
$offre = preg_match('/^[a-z-]{3,30}$/', (string) ($_POST['offre'] ?? '')) ? (string) $_POST['offre'] : '';
$apercu = texte('apercu', 600);
$message = texte('message', 3000);

if ($type === 'rappel') {
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

if ($nom === '' || $commerce === '' || $message === '') {
    erreur('champs');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    erreur('email');
}
// Plus de 3 liens dans le message : très probablement un spam.
if (preg_match_all('#https?://#i', $message) > 3) {
    erreur('liens');
}
if (limite_atteinte('contact', 5)) {
    erreur('limite');
}

$corps = "Nouveau message depuis le site loyna.fr\n\n"
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
noter_envoi('contact');
aller('/contact/envoye/');
