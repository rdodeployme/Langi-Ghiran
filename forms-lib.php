<?php
// Shared helpers for the LG Recycling form handlers. Not a page.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'forms-lib.php') { http_response_code(404); exit; }

date_default_timezone_set('Australia/Melbourne');

function lg_config(): array {
    static $cfg = null;
    if ($cfg === null) $cfg = require __DIR__ . '/forms-config.php';
    return $cfg;
}

function lg_reply(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body);
    exit;
}

function lg_guard(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') lg_reply(405, ['ok' => false, 'error' => 'Method not allowed']);
    // Honeypot: real people never fill this in. Pretend success to bots.
    if (trim($_POST['website'] ?? '') !== '') lg_reply(200, ['ok' => true, 'reference' => 'OK']);
}

function lg_field(string $name, int $max = 2000): string {
    $v = $_POST[$name] ?? '';
    if (is_array($v)) $v = implode(', ', $v);
    $v = trim(str_replace(["\r\n", "\r"], "\n", (string) $v));
    return mb_substr($v, 0, $max);
}

function lg_require(array $names): void {
    foreach ($names as $n) {
        if (lg_field($n) === '') lg_reply(422, ['ok' => false, 'error' => "Missing required field: $n"]);
    }
}

function lg_reference(string $prefix): string {
    return $prefix . '-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(2)));
}

function lg_clean_header(string $v): string {
    return trim(preg_replace('/[\r\n]+/', ' ', $v));
}

/**
 * Send a plain-text email with optional attachments.
 * $attachments: list of ['name' => ..., 'type' => ..., 'data' => raw bytes]
 */
function lg_mail(string $subject, string $body, ?string $replyTo = null, array $attachments = []): bool {
    $cfg = lg_config();
    $boundary = 'lg_' . bin2hex(random_bytes(12));
    $headers = [
        'From: ' . lg_clean_header($cfg['from_name']) . ' <' . lg_clean_header($cfg['from']) . '>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
    ];
    if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $headers[] = 'Reply-To: ' . $replyTo;

    $msg  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n";
    $msg .= $body . "\r\n";
    foreach ($attachments as $a) {
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', $a['name']);
        $msg .= "--$boundary\r\nContent-Type: {$a['type']}; name=\"$name\"\r\n";
        $msg .= "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$name\"\r\n\r\n";
        $msg .= chunk_split(base64_encode($a['data'])) . "\r\n";
    }
    $msg .= "--$boundary--";

    return mail(lg_clean_header($cfg['to']), '=?UTF-8?B?' . base64_encode($subject) . '?=', $msg, implode("\r\n", $headers));
}

function lg_lines(array $pairs): string {
    $out = '';
    foreach ($pairs as $label => $value) {
        if ($value === null) { $out .= "\n== $label ==\n"; continue; }
        $out .= str_pad($label . ':', 34) . ($value === '' ? '-' : $value) . "\n";
    }
    return $out;
}
