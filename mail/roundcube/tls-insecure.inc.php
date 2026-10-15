<?php
// LOCAL DEVELOPMENT ONLY: the local mail server uses a self-signed certificate.
$config['imap_conn_options'] = ['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]];
$config['smtp_conn_options'] = ['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]];
