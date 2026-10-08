<?php
// Après le paiement (/merci/) : le client envoie les éléments de sa carte (logo, couleurs, récompense).
// Envoi à contact@loyna.fr avec le logo en pièce jointe ; objet « [Site LOYNA] Éléments de carte (client) ».
declare(strict_types=1);
require __DIR__ . '/formulaires.inc.php';

const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo
const FORMATS = [
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'svg' => 'image/svg+xml',
    'pdf' => 'application/pdf',
];

function erreur(string $code): void
{
    aller('/merci/?erreur=' . $code . '#elements');
}

$piege = false;
$code = controle_envoi($piege);
if ($code === 'methode') {
    aller('/merci/');
}
if ($piege) {
    aller('/merci/?recu=1#elements');
}
if ($code !== '') {
    erreur($code);
}

$nom = ligne('nom', 80);
$commerce = ligne('commerce', 100);
$email = ligne('email', 120);
$tel = ligne('telephone', 30);
$activite = ligne('activite', 60);
$recompense = ligne('recompense', 120);
$passages = max(0, min(50, (int) ($_POST['passages'] ?? 0)));
$fond = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($_POST['fond'] ?? '')) ? (string) $_POST['fond'] : '';
$accent = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($_POST['accent'] ?? '')) ? (string) $_POST['accent'] : '';
$offre = preg_match('/^[a-z-]{3,30}$/', (string) ($_POST['offre'] ?? '')) ? (string) $_POST['offre'] : '';
$session = preg_match('/^cs_[A-Za-z0-9_]{10,200}$/', (string) ($_POST['session'] ?? '')) ? (string) $_POST['session'] : '';
$message = texte('message', 2000);

if ($nom === '' || $commerce === '') {
    erreur('champs');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    erreur('email');
}
if (limite_atteinte('elements', 4)) {
    erreur('limite');
}

// Logo facultatif : extension et type réel vérifiés, 5 Mo au plus.
$piece = null;
$f = $_FILES['logo'] ?? null;
if (is_array($f) && ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
    if (in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
        erreur('taille');
    }
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        erreur('fichier');
    }
    if ($f['size'] > TAILLE_MAX) {
        erreur('taille');
    }
    $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
    if (!isset(FORMATS[$ext])) {
        erreur('format');
    }
    if (function_exists('finfo_open')) {
        $reel = (string) finfo_file(finfo_open(FILEINFO_MIME_TYPE), $f['tmp_name']);
        $attendu = FORMATS[$ext];
        $ok = $reel === $attendu || ($ext === 'svg' && in_array($reel, ['image/svg', 'text/xml', 'text/plain', 'application/xml'], true));
        if (!$ok) {
            erreur('format');
        }
    }
    $ascii = function_exists('iconv') ? (string) @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $commerce) : '';
    $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($ascii)), '-');
    $nomFichier = 'logo-' . ($slug !== '' ? substr($slug, 0, 40) : 'commerce') . '.' . $ext;
    $piece = ['nom' => $nomFichier, 'type' => FORMATS[$ext], 'data' => (string) file_get_contents($f['tmp_name'])];
}

$corps = "Éléments de carte envoyés après un paiement sur loyna.fr\n\n"
    . "Commerce : $commerce\n"
    . "Nom : $nom\n"
    . "E-mail : $email\n"
    . 'Téléphone : ' . ($tel !== '' ? $tel : 'non renseigné') . "\n"
    . ($offre !== '' ? "Offre payée : $offre\n" : '')
    . ($session !== '' ? "Session Stripe : $session\n" : '')
    . "\nCarte souhaitée\n"
    . 'Activité : ' . ($activite !== '' ? $activite : 'non précisée') . "\n"
    . 'Couleur de fond : ' . ($fond !== '' ? $fond : 'non précisée') . "\n"
    . 'Couleur des tampons : ' . ($accent !== '' ? $accent : 'non précisée') . "\n"
    . 'Récompense : ' . ($recompense !== '' ? $recompense : 'non précisée') . ($passages ? " au bout de $passages passages" : '') . "\n"
    . 'Logo : ' . ($piece ? 'en pièce jointe (' . $piece['nom'] . ')' : 'non fourni') . "\n"
    . ($message !== '' ? "\nPrécisions :\n$message\n" : '')
    . "\n— Envoyé le " . date('d/m/Y à H:i') . " depuis https://loyna.fr/merci/\n"
    . "Répondre à ce message écrit directement à $email.\n";

$frontiere = 'loyna-' . bin2hex(random_bytes(12));
$entetes = [
    'From: ' . entete('Site LOYNA') . ' <' . DEST . '>',
    'Reply-To: ' . entete($nom) . ' <' . $email . '>',
    'MIME-Version: 1.0',
    'X-Mailer: loyna.fr',
];
if ($piece) {
    $entetes[] = 'Content-Type: multipart/mixed; boundary="' . $frontiere . '"';
    $contenu = "--$frontiere\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n"
        . str_replace("\n", "\r\n", $corps) . "\r\n"
        . "--$frontiere\r\n"
        . 'Content-Type: ' . $piece['type'] . '; name="' . $piece['nom'] . "\"\r\n"
        . "Content-Transfer-Encoding: base64\r\n"
        . 'Content-Disposition: attachment; filename="' . $piece['nom'] . "\"\r\n\r\n"
        . chunk_split(base64_encode($piece['data']))
        . "--$frontiere--\r\n";
} else {
    $entetes[] = 'Content-Type: text/plain; charset=UTF-8';
    $entetes[] = 'Content-Transfer-Encoding: 8bit';
    $contenu = $corps;
}

if (!mail(DEST, entete("[Site LOYNA] Éléments de carte (client) · $commerce"), $contenu, implode("\r\n", $entetes), '-f' . DEST)) {
    erreur('envoi');
}
noter_envoi('elements');
aller('/merci/?recu=1#elements');
