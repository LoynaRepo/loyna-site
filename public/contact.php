<?php
// Formulaire de contact de loyna.fr : envoie la demande à contact@loyna.fr (fonction mail() de l'hébergement OVH).
// Protections : méthode POST uniquement, champ piège, délai minimal de saisie, limite par adresse IP,
// en-têtes sans retour à la ligne (pas d'injection), réponse de l'expéditeur en Reply-To.
declare(strict_types=1);
date_default_timezone_set('Europe/Paris');
mb_internal_encoding('UTF-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

const DEST = 'contact@loyna.fr';
const SUJETS = [
    'Je veux une démo',
    'Je veux un exemple de carte à mon nom',
    'Question sur les tarifs',
    'Je suis déjà client',
    'Autre question',
];

function aller(string $url): void
{
    header('Location: ' . $url, true, 303);
    exit;
}
function erreur(string $code): void
{
    aller('/contact/?erreur=' . $code . '#contact-form');
}
// Champ sur une ligne (nom, commerce…) : sans retour à la ligne ni caractère de contrôle.
// Texte reçu en UTF-8 (cas normal d'un navigateur) ; sinon converti depuis Windows-1252.
function utf8(string $v): string
{
    return mb_check_encoding($v, 'UTF-8') ? $v : mb_convert_encoding($v, 'UTF-8', 'Windows-1252');
}
function ligne(string $k, int $max): string
{
    $v = utf8((string) ($_POST[$k] ?? ''));
    $v = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v) ?? '';
    return trim(mb_substr($v, 0, $max));
}
// Champ sur plusieurs lignes (message) : retours à la ligne conservés, autres caractères de contrôle retirés.
function texte(string $k, int $max): string
{
    $v = str_replace(["\r\n", "\r"], "\n", utf8((string) ($_POST[$k] ?? '')));
    $v = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]+/u', ' ', $v) ?? '';
    return trim(mb_substr($v, 0, $max));
}
function entete(string $s): string
{
    return '=?UTF-8?B?' . base64_encode($s) . '?=';
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    aller('/contact/');
}
// Champ piège rempli : robot. On fait comme si tout allait bien.
if (($_POST['site_web'] ?? '') !== '') {
    aller('/contact/envoye/');
}
// Horodatage posé par la page : au moins 3 secondes de saisie, au plus 24 h.
$t = (int) ($_POST['t'] ?? 0);
$maintenant = (int) floor(microtime(true) * 1000);
if ($t <= 0 || $maintenant - $t < 3000 || $maintenant - $t > 86400000) {
    erreur('delai');
}

$nom = ligne('nom', 80);
$commerce = ligne('commerce', 100);
$email = ligne('email', 120);
$tel = ligne('telephone', 30);
$sujet = ligne('sujet', 60);
$offre = preg_match('/^[a-z-]{3,30}$/', (string) ($_POST['offre'] ?? '')) ? (string) $_POST['offre'] : '';
$apercu = texte('apercu', 600);
$message = texte('message', 3000);

if ($nom === '' || $commerce === '' || $message === '') {
    erreur('champs');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    erreur('email');
}
if (!in_array($sujet, SUJETS, true)) {
    $sujet = 'Autre question';
}
// Plus de 3 liens dans le message : très probablement un spam.
if (preg_match_all('#https?://#i', $message) > 3) {
    erreur('liens');
}

// Limite : 5 messages par heure et par adresse IP (fichier temporaire, aucune adresse IP stockée en clair).
$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$fichier = sys_get_temp_dir() . '/loyna_contact_' . hash('sha256', $ip . '|loyna') . '.json';
$envois = [];
if (is_file($fichier)) {
    $envois = array_filter((array) json_decode((string) @file_get_contents($fichier), true), fn ($x) => is_int($x) && $x > time() - 3600);
}
if (count($envois) >= 5) {
    erreur('limite');
}

$corps = "Nouveau message depuis le formulaire de contact de loyna.fr\n\n"
    . "Nom : $nom\n"
    . "Commerce : $commerce\n"
    . "E-mail : $email\n"
    . 'Téléphone : ' . ($tel !== '' ? $tel : 'non renseigné') . "\n"
    . "Demande : $sujet\n"
    . ($offre !== '' ? "Offre consultée : $offre\n" : '')
    . ($apercu !== '' ? "\nAperçu de carte préparé sur le site :\n$apercu\n" : '')
    . "\nMessage :\n$message\n\n"
    . '— Envoyé le ' . date('d/m/Y à H:i') . " depuis https://loyna.fr/contact/\n"
    . "Répondre à ce message écrit directement à $email.\n";

$entetes = implode("\r\n", [
    'From: ' . entete('Site LOYNA') . ' <' . DEST . '>',
    'Reply-To: ' . entete($nom) . ' <' . $email . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: loyna.fr',
]);

$ok = mail(DEST, entete("[Site LOYNA] $sujet · $commerce"), $corps, $entetes, '-f' . DEST);
if (!$ok) {
    erreur('envoi');
}
$envois[] = time();
@file_put_contents($fichier, json_encode(array_values($envois)), LOCK_EX);
aller('/contact/envoye/');
