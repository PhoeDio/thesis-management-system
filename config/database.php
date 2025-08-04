<?php
// Database configuration
define('DB_HOST', 'localhost');
define('DB_NAME', 'thesis_management');
define('DB_USER', 'thesis_user');
define('DB_PASS', 'SecurePassword123!');
define('DB_CHARSET', 'utf8mb4');

// PDO connection function
function getDatabaseConnection() {
    try {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    } catch (PDOException $e) {
        die("Database connection failed: " . $e->getMessage());
    }
}
?>
EOF

# Create main configuration file
cat > config/config.php << 'EOF'
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