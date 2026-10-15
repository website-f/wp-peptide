<?php
// Production: verify the mail server certificate (Let's Encrypt for MAIL_HOSTNAME).
$config['imap_conn_options'] = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]];
$config['smtp_conn_options'] = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]];
