<?php
// Enquiry form handler. Replies with JSON: { ok, reference } or { ok:false, error }.
require __DIR__ . '/forms-lib.php';
lg_guard();
lg_require(['first_name', 'last_name', 'phone', 'email', 'enquiry_type', 'project_details']);

$email = lg_field('email', 200);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) lg_reply(422, ['ok' => false, 'error' => 'Please enter a valid email address']);

$ref = lg_reference(lg_config()['ref_enquiry']);
$name = lg_field('first_name', 100) . ' ' . lg_field('last_name', 100);

$body = "New website enquiry — $ref\n\n" . lg_lines([
    'Name'               => $name,
    'Phone'              => lg_field('phone', 50),
    'Email'              => $email,
    'Company'            => lg_field('company', 200),
    'Looking to'         => lg_field('enquiry_type', 100),
    'Estimated quantity' => lg_field('estimated_quantity', 100),
    'Timing'             => lg_field('timing', 100),
    'Project details'    => null,
]) . lg_field('project_details', 5000) . "\n\nSubmitted " . date('D j M Y, g:ia') . "\n";

if (!lg_mail("LG Recycling enquiry $ref — $name", $body, $email)) {
    lg_reply(500, ['ok' => false, 'error' => 'Could not send your enquiry']);
}
lg_reply(200, ['ok' => true, 'reference' => $ref]);
