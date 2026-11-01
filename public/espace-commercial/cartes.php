<?php
// Cartes préparées avec un commerçant depuis le panel commercial (« Préparer une carte », Ewan, 2026-10-30) : réglages
// de la carte, logo et offre, repris par les liens envoyés au commerçant (loyna.fr/panier/?carte=<id> pour payer,
// loyna.fr/essai/?carte=<id> pour essayer).
//
// Grille du 2026-10-31 : à l'écriture, offre Starter ou Pro, avec ou sans engagement. Les fiches écrites avant (offre
// « premium », champ « periode » à la place d'« engagement ») ne sont jamais réécrites d'ici : elles restent servies telles
// quelles, et le site les lit par normalizeOffer() (src/data/site.ts). Une mise à jour depuis le panel les passe au format neuf.
//
//   GET  ?id=<id>                 → public : 200 {"carte": {…}} · 404 inconnue (l'identifiant est aléatoire, sans liste)
//   GET  + en-tête X-Panel-Jeton  → 200 {"cartes": [{…, "id", "cree_le", "modifie_le", "a_logo"}]}, sans les logos
//   POST + en-tête X-Panel-Jeton  {"id"?, "carte": {…}} → 200 {"ok": true, "id", "modifie_le"}
//   POST + en-tête X-Panel-Jeton  {"supprimer": "<id>"} → 200 {"ok": true}
//   Autres réponses : 400 requête invalide · 401 jeton absent · 403 jeton refusé · 404 · 405 méthode · 413 trop grand ·
//   429 trop d'essais de jeton faux depuis cette adresse (20 par heure) · 500 / 503 stockage (sans détail).
//
// Jeton : le même que notes.php (empreinte panel-commercial/jeton.sha256, compteur essais.json). Stockage hors de www/ :
// panel-commercial/cartes/<id>.json et <id>.logo (base64 du PNG). Ces fiches ne contiennent que ce qui figure sur la
// carte et l'offre : ni contact ni e-mail ; elles sont lisibles par qui a le lien. Même comportement que
// tools/commercial/notes_local.py (essais en local). Compatible PHP 7.4 et 8.x.

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

const DOSSIER = __DIR__ . '/../../panel-commercial';
const TAILLE_REQUETE_MAX = 1600000;  // logo de 1 Mo (base64) et réglages
const TAILLE_LOGO_MAX = 1400000;     // longueur du base64
const ESSAIS_MAX = 20;
const FENETRE_ESSAIS = 3600;
const CARTES_MAX = 300;
const OFFRES = ['starter', 'pro'];
const ENGAGEMENTS = ['sans', 'engage'];
const PREFIXE_LOGO = 'data:image/png;base64,';

function repondre(int $code, array $corps): void
{
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, max-age=0');
        header('Pragma: no-cache');
        header('X-Robots-Tag: noindex, nofollow');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        header_remove('X-Powered-By');
    }
    echo json_encode($corps, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

set_error_handler(function (int $niveau, string $message, string $fichier = '', int $ligne = 0): bool {
    if (!(error_reporting() & $niveau)) {
        return false;
    }
    throw new ErrorException($message, 0, $niveau, $fichier, $ligne);
});
register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e !== null && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true) && !headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, max-age=0');
        echo '{"erreur":"serveur"}';
    }
});

function chemin(string $nom): string
{
    return DOSSIER . '/' . $nom;
}

function lire_json(string $fichier): ?array
{
    if (!is_file($fichier)) {
        return null;
    }
    $donnees = json_decode((string) file_get_contents($fichier), true);
    if (!is_array($donnees)) {
        throw new RuntimeException('fichier illisible');
    }
    return $donnees;
}

function ecrire_texte(string $fichier, string $texte): void
{
    $tmp = $fichier . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $texte) === false || !rename($tmp, $fichier)) {
        throw new RuntimeException('écriture impossible');
    }
}

function ecrire_json(string $fichier, $donnees): void
{
    $json = json_encode($donnees, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('écriture impossible');
    }
    ecrire_texte($fichier, $json);
}

function empreinte_attendue(): ?string
{
    $fichier = chemin('jeton.sha256');
    if (!is_file($fichier)) {
        return null;
    }
    $empreinte = strtolower(trim((string) file_get_contents($fichier)));
    return preg_match('/^[0-9a-f]{64}$/D', $empreinte) === 1 ? $empreinte : null;
}

function jeton_recu(): string
{
    $jeton = isset($_SERVER['HTTP_X_PANEL_JETON']) ? (string) $_SERVER['HTTP_X_PANEL_JETON'] : '';
    if ($jeton === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $nom => $valeur) {
            if (strcasecmp((string) $nom, 'X-Panel-Jeton') === 0) {
                $jeton = (string) $valeur;
                break;
            }
        }
    }
    return strtolower(trim($jeton));
}

function lire_essais(): array
{
    try {
        return lire_json(chemin('essais.json')) ?? [];
    } catch (RuntimeException $e) {
        return [];
    }
}

function essais_recents(string $ip): int
{
    $essais = lire_essais();
    $liste = isset($essais[$ip]) && is_array($essais[$ip]) ? $essais[$ip] : [];
    $limite = time() - FENETRE_ESSAIS;
    $n = 0;
    foreach ($liste as $t) {
        if (is_int($t) && $t > $limite) {
            $n++;
        }
    }
    return $n;
}

function noter_essai(string $ip): void
{
    $verrou = fopen(chemin('notes.lock'), 'c');
    if ($verrou === false) {
        throw new RuntimeException('verrou');
    }
    flock($verrou, LOCK_EX);
    $essais = lire_essais();
    $limite = time() - FENETRE_ESSAIS;
    $propre = [];
    foreach ($essais as $cle => $liste) {
        if (!is_array($liste)) {
            continue;
        }
        $recents = array_values(array_filter($liste, function ($t) use ($limite) {
            return is_int($t) && $t > $limite;
        }));
        if ($recents) {
            $propre[(string) $cle] = $recents;
        }
    }
    $propre[$ip][] = time();
    ecrire_json(chemin('essais.json'), (object) $propre);
    flock($verrou, LOCK_UN);
    fclose($verrou);
}

function id_valide($id): bool
{
    return is_string($id) && preg_match('/^[a-z0-9]{16}$/D', $id) === 1;
}

function texte_valide($v, int $min, int $max): bool
{
    if (!is_string($v)) {
        return false;
    }
    $n = mb_strlen(trim($v), 'UTF-8');
    return $n >= $min && $n <= $max;
}

function entier_valide($v, int $min, int $max): bool
{
    return is_int($v) && $v >= $min && $v <= $max;
}

/** Réglages acceptés (liste fermée de champs) ; le logo est vérifié à part. Null si un champ est invalide. */
function carte_propre(array $c): ?array
{
    $qr = $c['qr'] ?? null;
    if (
        !texte_valide($c['nom'] ?? null, 1, 60) || !texte_valide($c['activite'] ?? '', 0, 60) || !texte_valide($c['recompense'] ?? null, 1, 80)
        || !is_string($c['fond'] ?? null) || preg_match('/^#[0-9a-f]{6}$/D', $c['fond']) !== 1
        || !is_string($c['tampons'] ?? null) || preg_match('/^#[0-9a-f]{6}$/D', $c['tampons']) !== 1
        || !entier_valide($c['passages'] ?? null, 1, 100)
        || !in_array($c['offre'] ?? null, OFFRES, true) || !in_array($c['engagement'] ?? null, ENGAGEMENTS, true)
        || !is_array($qr) || !entier_valide($qr['unit'] ?? null, 0, 20) || !entier_valide($qr['pack5'] ?? null, 0, 4) || !entier_valide($qr['pack10'] ?? null, 0, 4)
        || !texte_valide($c['prospect'] ?? '', 0, 64)
    ) {
        return null;
    }
    return [
        'nom' => trim($c['nom']),
        'activite' => trim($c['activite'] ?? ''),
        'recompense' => trim($c['recompense']),
        'fond' => $c['fond'],
        'tampons' => $c['tampons'],
        'passages' => $c['passages'],
        'offre' => $c['offre'],
        'engagement' => $c['engagement'],
        'qr' => ['unit' => $qr['unit'], 'pack5' => $qr['pack5'], 'pack10' => $qr['pack10']],
        'prospect' => trim($c['prospect'] ?? ''),
    ];
}

/** Base64 d'un vrai PNG (image affichée chez le commerçant : jamais de SVG ni de HTML). Null si invalide. */
function logo_propre($logo): ?string
{
    if (!is_string($logo) || strncmp($logo, PREFIXE_LOGO, strlen(PREFIXE_LOGO)) !== 0) {
        return null;
    }
    $b64 = substr($logo, strlen(PREFIXE_LOGO));
    if (strlen($b64) > TAILLE_LOGO_MAX) {
        return null;
    }
    $octets = base64_decode($b64, true);
    if ($octets === false || strncmp($octets, "\x89PNG\r\n\x1a\n", 8) !== 0) {
        return null;
    }
    return $b64;
}

try {
    $methode = isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : 'GET';
    if ($methode !== 'GET' && $methode !== 'POST') {
        header('Allow: GET, POST');
        repondre(405, ['erreur' => 'methode']);
    }
    $cartes = chemin('cartes');

    // Lecture publique d'une carte : c'est le lien envoyé au commerçant
    if ($methode === 'GET' && isset($_GET['id'])) {
        $id = $_GET['id'];
        if (!id_valide($id) || !is_file("$cartes/$id.json")) {
            repondre(404, ['erreur' => 'inconnue']);
        }
        $carte = lire_json("$cartes/$id.json");
        unset($carte['prospect']); // repère interne du panel
        $logo = "$cartes/$id.logo";
        $carte['logo'] = is_file($logo) ? PREFIXE_LOGO . file_get_contents($logo) : null;
        repondre(200, ['carte' => $carte]);
    }

    try {
        $stockage = is_dir($cartes) || @mkdir($cartes, 0700, true);
    } catch (Throwable $e) {
        $stockage = false;
    }
    if (!$stockage) {
        repondre(503, ['erreur' => 'stockage']);
    }
    $empreinte = empreinte_attendue();
    if ($empreinte === null) {
        repondre(503, ['erreur' => 'non_active']);
    }
    $ip = hash('sha256', isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '');
    if (essais_recents($ip) >= ESSAIS_MAX) {
        header('Retry-After: ' . FENETRE_ESSAIS);
        repondre(429, ['erreur' => 'trop_essais']);
    }
    $jeton = jeton_recu();
    if ($jeton === '') {
        repondre(401, ['erreur' => 'jeton_absent']);
    }
    if (preg_match('/^[0-9a-f]{64}$/D', $jeton) !== 1 || !hash_equals($empreinte, hash('sha256', (string) hex2bin($jeton)))) {
        noter_essai($ip);
        repondre(403, ['erreur' => 'jeton_refuse']);
    }

    if ($methode === 'GET') {
        $liste = [];
        foreach (glob("$cartes/*.json") ?: [] as $fichier) {
            $id = basename($fichier, '.json');
            if (!id_valide($id)) {
                continue;
            }
            $carte = lire_json($fichier);
            $carte['id'] = $id;
            $carte['a_logo'] = is_file("$cartes/$id.logo");
            $liste[] = $carte;
        }
        usort($liste, function ($a, $b) {
            return strcmp((string) ($b['modifie_le'] ?? ''), (string) ($a['modifie_le'] ?? ''));
        });
        repondre(200, ['cartes' => $liste]);
    }

    $longueur = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($longueur > TAILLE_REQUETE_MAX) {
        repondre(413, ['erreur' => 'trop_grand']);
    }
    $brut = file_get_contents('php://input', false, null, 0, TAILLE_REQUETE_MAX + 1);
    if ($brut === false || strlen($brut) > TAILLE_REQUETE_MAX) {
        repondre(413, ['erreur' => 'trop_grand']);
    }
    $requete = json_decode($brut, true, 8);
    if (!is_array($requete)) {
        repondre(400, ['erreur' => 'requete']);
    }

    if (array_key_exists('supprimer', $requete)) {
        $id = $requete['supprimer'];
        if (!id_valide($id)) {
            repondre(400, ['erreur' => 'id']);
        }
        foreach (["$cartes/$id.json", "$cartes/$id.logo"] as $fichier) {
            if (is_file($fichier)) {
                unlink($fichier);
            }
        }
        repondre(200, ['ok' => true]);
    }

    $id = $requete['id'] ?? null;
    if ($id !== null && (!id_valide($id) || !is_file("$cartes/$id.json"))) {
        repondre(404, ['erreur' => 'inconnue']);
    }
    $brute = $requete['carte'] ?? null;
    $carte = is_array($brute) ? carte_propre($brute) : null;
    if ($carte === null) {
        repondre(400, ['erreur' => 'carte']);
    }
    $logo = $brute['logo'] ?? null;
    $b64 = null;
    if ($logo !== null) {
        $b64 = logo_propre($logo);
        if ($b64 === null) {
            repondre(400, ['erreur' => 'logo']);
        }
    }

    $cree_le = gmdate('Y-m-d\TH:i:s\Z');
    if ($id === null) {
        if (count(glob("$cartes/*.json") ?: []) >= CARTES_MAX) {
            repondre(413, ['erreur' => 'trop_de_cartes']);
        }
        do {
            $id = substr(strtr(bin2hex(random_bytes(10)), 'abcdef', 'ghjkmn'), 0, 16);
        } while (is_file("$cartes/$id.json"));
    } else {
        $avant = lire_json("$cartes/$id.json");
        $cree_le = (string) ($avant['cree_le'] ?? $cree_le);
    }
    $carte['cree_le'] = $cree_le;
    $carte['modifie_le'] = gmdate('Y-m-d\TH:i:s\Z');
    if ($b64 !== null) {
        ecrire_texte("$cartes/$id.logo", $b64);
    } elseif (is_file("$cartes/$id.logo")) {
        unlink("$cartes/$id.logo");
    }
    ecrire_json("$cartes/$id.json", $carte);
    repondre(200, ['ok' => true, 'id' => $id, 'modifie_le' => $carte['modifie_le']]);
} catch (Throwable $e) {
    error_log('cartes.php : ' . $e->getMessage());
    repondre(500, ['erreur' => 'serveur']);
}
