<?php
// Soil declaration handler. Replies with JSON: { ok, reference } or { ok:false, error }.
// Emails the declaration with the signature (PNG) and any classification report attached.
require __DIR__ . '/forms-lib.php';
lg_guard();
lg_require([
    'company', 'waste_producer', 'transport_company', 'contact_name', 'contact_email', 'contact_phone',
    'job_start', 'job_end', 'source_address', 'current_land_use', 'historic_land_use', 'current_site_use',
    'generating_activity', 'material_type', 'quantity', 'quantity_unit', 'solid_inert_waste',
    'classification_done', 'demolition_on_site', 'potentially_contaminated', 'contains_rpw',
    'contains_asbestos', 'signs_of_contamination', 'contains_wass', 'declaration_agreed',
    'signatory_name', 'signatory_position', 'signature_date', 'sig_image',
]);

$email = lg_field('contact_email', 200);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) lg_reply(422, ['ok' => false, 'error' => 'Please enter a valid email address']);

foreach (['contains_rpw' => 'reportable priority waste', 'contains_asbestos' => 'asbestos', 'contains_wass' => 'waste acid sulfate soil'] as $f => $label) {
    if (lg_field($f) === 'Yes') lg_reply(422, ['ok' => false, 'error' => "We can't accept material containing $label"]);
}

// Signature: PNG data URL from the signature pad
$sig = lg_field('sig_image', 2000000);
if (!preg_match('#^data:image/png;base64,([A-Za-z0-9+/=]+)$#', $sig, $m)) lg_reply(422, ['ok' => false, 'error' => 'Signature missing']);
$sigPng = base64_decode($m[1], true);
if ($sigPng === false || substr($sigPng, 0, 8) !== "\x89PNG\r\n\x1a\n") lg_reply(422, ['ok' => false, 'error' => 'Signature invalid']);

$ref = lg_reference(lg_config()['ref_declaration']);
$attachments = [['name' => "$ref-signature.png", 'type' => 'image/png', 'data' => $sigPng]];

// Optional waste classification report
if (!empty($_FILES['classification_report']['tmp_name']) && is_uploaded_file($_FILES['classification_report']['tmp_name'])) {
    $f = $_FILES['classification_report'];
    if ($f['size'] > lg_config()['max_upload']) lg_reply(422, ['ok' => false, 'error' => 'Classification report is too large (max 8 MB)']);
    $type = mime_content_type($f['tmp_name']) ?: 'application/octet-stream';
    if ($type !== 'application/pdf' && strpos($type, 'image/') !== 0) lg_reply(422, ['ok' => false, 'error' => 'Classification report must be a PDF or image']);
    $attachments[] = ['name' => "$ref-report-" . basename($f['name']), 'type' => $type, 'data' => file_get_contents($f['tmp_name'])];
}

$body = "New soil declaration — $ref\n" . lg_lines([
    '01 Waste and company details' => null,
    'Company'                      => lg_field('company', 200),
    'Waste producer'               => lg_field('waste_producer', 200),
    'Transport company'            => lg_field('transport_company', 200),
    'Contact name'                 => lg_field('contact_name', 200),
    'Contact email'                => $email,
    'Contact phone'                => lg_field('contact_phone', 50),
    'Expected job start'           => lg_field('job_start', 20),
    'Expected job end'             => lg_field('job_end', 20),
    'Address of waste source'      => lg_field('source_address', 300),
    '02 Land use and site'         => null,
    'Current land use'             => lg_field('current_land_use', 100),
    'Historic land use'            => lg_field('historic_land_use', 100),
    'Current site use'             => lg_field('current_site_use', 300),
    'Activity generating waste'    => lg_field('generating_activity', 300),
    '03 Material'                  => null,
    'Material type'                => lg_field('material_type', 300),
    'Estimated quantity'           => lg_field('quantity', 30) . ' ' . lg_field('quantity_unit', 20),
    'Solid inert waste present'    => lg_field('solid_inert_waste', 300),
    'Description'                  => lg_field('material_description', 2000),
    '04 Contamination assessment'  => null,
    'Classification completed'     => lg_field('classification_done', 5),
    'Demolition on source site'    => lg_field('demolition_on_site', 5),
    'Potentially contaminated'     => lg_field('potentially_contaminated', 5),
    'Reportable priority waste'    => lg_field('contains_rpw', 5),
    'Asbestos'                     => lg_field('contains_asbestos', 5),
    'Signs of contamination'       => lg_field('signs_of_contamination', 5),
    'Waste acid sulfate soil'      => lg_field('contains_wass', 5),
    'Report attached'              => count($attachments) > 1 ? 'Yes' : 'No',
    '05-06 Declaration and signature' => null,
    'Declaration agreed'           => lg_field('declaration_agreed', 5),
    'Signed by'                    => lg_field('signatory_name', 200),
    'Position'                     => lg_field('signatory_position', 200),
    'Date'                         => lg_field('signature_date', 20),
]) . "\nSignature attached. Submitted " . date('D j M Y, g:ia') . " from " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n";

$subject = "LG Recycling soil declaration $ref — " . lg_field('company', 120);
if (!lg_mail($subject, $body, $email, $attachments)) {
    lg_reply(500, ['ok' => false, 'error' => 'Could not send your declaration']);
}
lg_reply(200, ['ok' => true, 'reference' => $ref]);
