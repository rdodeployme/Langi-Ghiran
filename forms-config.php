<?php
// LG Recycling form settings.
// These only run on PHP hosting (like Nunjara's). GitHub Pages cannot run PHP.

return [
    // TBC: inbox that receives enquiries and soil declarations
    'to'        => 'TBC@example.com',
    // Sender address. Use a mailbox on the site's own domain so mail isn't flagged as spam.
    'from'      => 'no-reply@TBC.com.au',
    'from_name' => 'LG Recycling website',
    // Prefix for reference numbers, e.g. LGE-20261001-4F2A (enquiry), LGD-... (declaration)
    'ref_enquiry'     => 'LGE',
    'ref_declaration' => 'LGD',
    // Largest classification report accepted (bytes)
    'max_upload' => 8 * 1024 * 1024,
];
