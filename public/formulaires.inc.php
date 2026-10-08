<?php
// Fonctions communes aux formulaires du site (contact.php, elements.php). Jamais servi directement
// (.htaccess refuse les fichiers *.inc.php).
declare(strict_types=1);
date_default_timezone_set('Europe/Paris');
mb_internal_encoding('UTF-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

const DEST = 'contact@loyna.fr';

function aller(string $url): void
{
    header('Location: ' . $url, true, 303);
    exit;
}
// Texte reçu en UTF-8 (cas normal d'un navigateur) ; sinon converti depuis Windows-1252.
function utf8(string $v): string
{
    return mb_check_encoding($v, 'UTF-8') ? $v : mb_convert_encoding($v, 'UTF-8', 'Windows-1252');
}
// Champ sur une ligne (nom, commerce…) : sans retour à la ligne ni caractère de contrôle.
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
// Contrôles anti-robots communs : méthode POST, champ piège, délai de saisie (3 s à 24 h).
// Renvoie un code d'erreur, ou '' si tout va bien ; $piege vaut true si un robot a rempli le champ piège.
function controle_envoi(bool &$piege): string
{
    $piege = false;
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        return 'methode';
    }
    if (($_POST['site_web'] ?? '') !== '') {
        $piege = true;
        return '';
    }
    $t = (int) ($_POST['t'] ?? 0);
    $maintenant = (int) floor(microtime(true) * 1000);
    if ($t <= 0 || $maintenant - $t < 3000 || $maintenant - $t > 86400000) {
        return 'delai';
    }
    return '';
}
// Limite : $max envois par heure et par adresse IP (fichier temporaire, adresse IP jamais stockée en clair).
function limite_atteinte(string $canal, int $max): bool
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $fichier = sys_get_temp_dir() . '/loyna_' . $canal . '_' . hash('sha256', $ip . '|loyna') . '.json';
    $envois = [];
    if (is_file($fichier)) {
        $envois = array_filter((array) json_decode((string) @file_get_contents($fichier), true), fn ($x) => is_int($x) && $x > time() - 3600);
    }
    return count($envois) >= $max;
}
function noter_envoi(string $canal): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $fichier = sys_get_temp_dir() . '/loyna_' . $canal . '_' . hash('sha256', $ip . '|loyna') . '.json';
    $envois = [];
    if (is_file($fichier)) {
        $envois = array_filter((array) json_decode((string) @file_get_contents($fichier), true), fn ($x) => is_int($x) && $x > time() - 3600);
    }
    $envois[] = time();
    @file_put_contents($fichier, json_encode(array_values($envois)), LOCK_EX);
}
