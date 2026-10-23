<?php
// Notes du panel commercial (loyna.fr/espace-commercial/) : serveur « aveugle ». Le navigateur chiffre chaque bloc
// de notes (AES-256-GCM) avant l'envoi : ce script ne voit jamais le texte, seulement des blocs opaques.
//
//   GET  + en-tête X-Panel-Jeton  → 200 {"blocs": {"<prospect>": {"iv", "donnees", "modifie_le"}}}
//   POST + en-tête X-Panel-Jeton  {"prospect", "iv", "donnees", "modifie_le_precedent"}
//        → 200 {"ok": true, "prospect", "modifie_le"}
//        → 409 {"erreur": "conflit", "actuel": {"iv", "donnees", "modifie_le"} | null}  (version différente)
//   Autres réponses : 400 requête invalide · 401 jeton absent · 403 jeton refusé · 405 méthode · 413 trop grand ·
//   429 trop d'essais de jeton faux depuis cette adresse (20 par heure) · 500 / 503 stockage (sans détail).
//
// Stockage hors de www/, dans le dossier personnel de l'hébergement (__DIR__/../../panel-commercial) :
//   jeton.sha256   SHA-256 (hexadécimal) du jeton d'écriture, déposé par _systeme/panel.py du coffre
//   notes.json     {"version": 1, "blocs": {…}}, réécrit sous verrou (flock) puis renommé
//   sauvegardes/   copie datée de notes.json après chaque écriture (les 50 dernières)
//   essais.json    jetons faux récents par adresse IP (empreintes SHA-256 des adresses, jamais en clair)
// Même comportement que tools/commercial/notes_local.py (essais en local). Compatible PHP 7.4 et 8.x.

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

const DOSSIER = __DIR__ . '/../../panel-commercial';
const TAILLE_BLOC_MAX = 65536;      // longueur maximale de « donnees » (base64)
const TAILLE_REQUETE_MAX = 131072;  // corps de requête
const ESSAIS_MAX = 20;              // jetons faux par adresse IP…
const FENETRE_ESSAIS = 3600;        // … sur une heure glissante
const SAUVEGARDES_MAX = 50;

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

// Aucune erreur PHP n'est montrée : avertissements changés en exceptions, erreurs fatales en JSON générique.
set_error_handler(function (int $niveau, string $message, string $fichier = '', int $ligne = 0): bool {
    if (!(error_reporting() & $niveau)) {
        return false; // erreur masquée par « @ »
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
    $contenu = file_get_contents($fichier);
    $donnees = json_decode((string) $contenu, true);
    if (!is_array($donnees)) {
        throw new RuntimeException('fichier illisible');
    }
    return $donnees;
}

/** Écriture atomique : fichier temporaire puis renommage. */
function ecrire_json(string $fichier, $donnees): void
{
    $json = json_encode($donnees, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $tmp = $fichier . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if ($json === false || file_put_contents($tmp, $json) === false || !rename($tmp, $fichier)) {
        throw new RuntimeException('écriture impossible');
    }
}

function ouvrir_verrou()
{
    $verrou = fopen(chemin('notes.lock'), 'c');
    if ($verrou === false) {
        throw new RuntimeException('verrou');
    }
    return $verrou;
}

function lire_notes(): array
{
    $etat = lire_json(chemin('notes.json'));
    if ($etat === null) {
        return ['version' => 1, 'blocs' => []];
    }
    if (!isset($etat['blocs']) || !is_array($etat['blocs'])) {
        throw new RuntimeException('notes.json illisible'); // jamais réécrit à l'aveugle
    }
    return $etat;
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

/** Compteurs d'essais (un fichier abîmé repart de zéro plutôt que de bloquer le service). */
function lire_essais(): array
{
    try {
        return lire_json(chemin('essais.json')) ?? [];
    } catch (RuntimeException $e) {
        return [];
    }
}

/** Essais de jeton faux de cette adresse dans l'heure. */
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
    $verrou = ouvrir_verrou();
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

/** Version du bloc : date UTC à la microseconde, toujours postérieure à la précédente. */
function horodatage_apres(string $precedent): string
{
    $t = microtime(true);
    $secondes = (int) floor($t);
    $micro = (int) (($t - $secondes) * 1000000);
    $nouveau = gmdate('Y-m-d\TH:i:s', $secondes) . sprintf('.%06d', $micro) . 'Z';
    if ($precedent !== '' && strcmp($nouveau, $precedent) <= 0) {
        $p = DateTime::createFromFormat('Y-m-d\TH:i:s.u\Z', $precedent, new DateTimeZone('UTC'));
        if ($p !== false) {
            $secondes = (int) $p->format('U');
            $micro = (int) $p->format('u') + 1;
            if ($micro >= 1000000) {
                $secondes++;
                $micro = 0;
            }
            $nouveau = gmdate('Y-m-d\TH:i:s', $secondes) . sprintf('.%06d', $micro) . 'Z';
        }
    }
    return $nouveau;
}

/** Copie datée de notes.json après chaque écriture ; seules les 50 dernières sont gardées. */
function sauvegarder(): void
{
    $dossier = chemin('sauvegardes');
    if (!is_dir($dossier)) {
        mkdir($dossier, 0700, true);
    }
    $t = microtime(true);
    $nom = sprintf('%s/notes-%s-%06d.json', $dossier, gmdate('Ymd-His', (int) floor($t)), (int) (($t - floor($t)) * 1000000));
    copy(chemin('notes.json'), $nom);
    $liste = glob($dossier . '/notes-*.json');
    if (is_array($liste) && count($liste) > SAUVEGARDES_MAX) {
        sort($liste, SORT_STRING);
        foreach (array_slice($liste, 0, count($liste) - SAUVEGARDES_MAX) as $ancienne) {
            unlink($ancienne);
        }
    }
}

try {
    $methode = isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : 'GET';
    if ($methode !== 'GET' && $methode !== 'POST') {
        header('Allow: GET, POST');
        repondre(405, ['erreur' => 'methode']);
    }
    try {
        $stockage = is_dir(DOSSIER) || @mkdir(DOSSIER, 0700, true);
    } catch (Throwable $e) {
        $stockage = false; // dossier hors d'atteinte (open_basedir, droits)
    }
    if (!$stockage) {
        repondre(503, ['erreur' => 'stockage']);
    }
    $empreinte = empreinte_attendue();
    if ($empreinte === null) {
        repondre(503, ['erreur' => 'non_active']); // panel.py publier n'a pas encore déposé l'empreinte du jeton
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
        $verrou = ouvrir_verrou();
        flock($verrou, LOCK_SH);
        $etat = lire_notes();
        flock($verrou, LOCK_UN);
        fclose($verrou);
        repondre(200, ['blocs' => (object) $etat['blocs']]);
    }

    // POST : vérifications avant tout verrou
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
    $prospect = $requete['prospect'] ?? null;
    $iv = $requete['iv'] ?? null;
    $donnees = $requete['donnees'] ?? null;
    $precedent = $requete['modifie_le_precedent'] ?? null;
    if (!is_string($prospect) || preg_match('/^[0-9a-f]{10,64}$/D', $prospect) !== 1) {
        repondre(400, ['erreur' => 'prospect']);
    }
    if (!is_string($iv) || preg_match('/^[A-Za-z0-9+\/]{16}$/D', $iv) !== 1) {
        repondre(400, ['erreur' => 'iv']);
    }
    if (!is_string($donnees)) {
        repondre(400, ['erreur' => 'donnees']);
    }
    if (strlen($donnees) > TAILLE_BLOC_MAX) {
        repondre(413, ['erreur' => 'bloc_trop_grand']);
    }
    if (strlen($donnees) < 24 || strlen($donnees) % 4 !== 0 || preg_match('/^[A-Za-z0-9+\/]+={0,2}$/D', $donnees) !== 1) {
        repondre(400, ['erreur' => 'donnees']);
    }
    if ($precedent !== null && (!is_string($precedent) || strlen($precedent) > 40)) {
        repondre(400, ['erreur' => 'version']);
    }
    $precedent = (string) $precedent;

    $verrou = ouvrir_verrou();
    flock($verrou, LOCK_EX);
    $etat = lire_notes();
    $actuel = isset($etat['blocs'][$prospect]) && is_array($etat['blocs'][$prospect]) ? $etat['blocs'][$prospect] : null;
    $version = $actuel !== null ? (string) ($actuel['modifie_le'] ?? '') : '';
    if ($version !== $precedent) {
        flock($verrou, LOCK_UN);
        fclose($verrou);
        repondre(409, ['erreur' => 'conflit', 'actuel' => $actuel]);
    }
    $modifie_le = horodatage_apres($version);
    $etat['blocs'][$prospect] = ['iv' => $iv, 'donnees' => $donnees, 'modifie_le' => $modifie_le];
    ecrire_json(chemin('notes.json'), ['version' => 1, 'blocs' => (object) $etat['blocs']]);
    try {
        sauvegarder();
    } catch (Throwable $e) {
        error_log('notes.php : sauvegarde impossible : ' . $e->getMessage()); // l'écriture elle-même a réussi
    }
    flock($verrou, LOCK_UN);
    fclose($verrou);
    repondre(200, ['ok' => true, 'prospect' => $prospect, 'modifie_le' => $modifie_le]);
} catch (Throwable $e) {
    error_log('notes.php : ' . $e->getMessage());
    repondre(500, ['erreur' => 'serveur']);
}
