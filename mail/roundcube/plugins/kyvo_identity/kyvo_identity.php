<?php
/**
 * Gives every new webmail user a sender name ("KYVO Labs" by default, $config['kyvo_display_name']).
 * Mail that arrives as a bare address with no name is more likely to be filed as spam.
 */
class kyvo_identity extends rcube_plugin
{
    public $task = 'login';

    function init()
    {
        $this->add_hook('user_create', [$this, 'user_create']);
    }

    function user_create($args)
    {
        if (empty($args['user_name'])) {
            $args['user_name'] = rcmail::get_instance()->config->get('kyvo_display_name', 'KYVO Labs');
        }
        return $args;
    }
}
