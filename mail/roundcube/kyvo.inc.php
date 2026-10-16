<?php
// KYVO webmail, served at https://<domain>/webmail/ through the store's nginx.

$config['product_name'] = 'KYVO Webmail';
// Behind a reverse proxy on a sub-path: build every URL under /webmail/ and assume HTTPS.
$config['request_path'] = '/webmail/';
$config['use_https'] = true;
$config['proxy_whitelist'] = ['172.16.0.0/12', '192.168.0.0/16', '10.0.0.0/8'];

// People may sign in with just "name" instead of "name@domain".
$config['username_domain'] = getenv('MAIL_DOMAIN') ?: 'kyvomethod.com';
$config['mail_domain'] = '%d';
$config['login_lc'] = 2;

// SMTP uses the same login as IMAP.
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';

$config['session_lifetime'] = 60;
$config['ip_check'] = true;
$config['login_rate_limit'] = 5;
$config['x_frame_options'] = 'sameorigin';
$config['create_default_folders'] = true;
$config['draft_autosave'] = 60;
$config['mime_param_folding'] = 0;
$config['enable_installer'] = false;
$config['display_version'] = false;
$config['support_url'] = '';

// Sender name for new webmail users (plugins/kyvo_identity). Each user can change it under Settings > Identities.
$config['kyvo_display_name'] = 'KYVO Labs';
