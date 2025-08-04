<?php
// Application configuration
define('APP_NAME', 'Thesis Management System');
define('APP_VERSION', '1.0.0');
define('BASE_URL', 'http://thesis-management.local');

// File upload settings
define('MAX_FILE_SIZE', 64 * 1024 * 1024); // 64MB
define('ALLOWED_FILE_TYPES', ['pdf', 'doc', 'docx', 'txt']);
define('UPLOAD_PATH', __DIR__ . '/../uploads/');

// Session settings
define('SESSION_TIMEOUT', 3600); // 1 hour

// Debugging (set to false in production)
define('DEBUG_MODE', true);

// Include database configuration
require_once 'database.php';
?>