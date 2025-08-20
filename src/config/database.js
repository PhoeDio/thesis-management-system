const { Pool } = require('pg');  

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'thesis_management',
    port: process.env.DB_PORT || 5432,
    max: 10,  // maximum number of clients in the pool
    idleTimeoutMillis: 30000,
});

// Create promise-based connection
const promisePool = pool.promise();

// Test connection
const testConnection = async () => {
    try {
        const [rows] = await promisePool.execute('SELECT 1 as test');
        console.log('✅ Database connected successfully');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
};

// Initialize database tables
const initializeDatabase = async () => {
    try {
        // Create users table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                user_type ENUM('professor', 'student', 'secretary') NOT NULL,
                first_name VARCHAR(50) NOT NULL,
                last_name VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Create professors table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS professors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                department VARCHAR(100),
                office VARCHAR(50),
                phone VARCHAR(20),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create students table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                student_id VARCHAR(20) UNIQUE NOT NULL,
                semester INT,
                address TEXT,
                mobile_phone VARCHAR(20),
                landline_phone VARCHAR(20),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create thesis_topics table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS thesis_topics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                pdf_file VARCHAR(255),
                supervisor_id INT NOT NULL,
                status ENUM('available', 'assigned', 'completed') DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supervisor_id) REFERENCES professors(id) ON DELETE CASCADE
            )
        `);

        // Create thesis_assignments table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS thesis_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                topic_id INT NOT NULL,
                student_id INT NOT NULL,
                supervisor_id INT NOT NULL,
                status ENUM('pending', 'active', 'under_examination', 'completed', 'cancelled') DEFAULT 'pending',
                assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completion_date TIMESTAMP NULL,
                grade DECIMAL(4,2) NULL,
                FOREIGN KEY (topic_id) REFERENCES thesis_topics(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (supervisor_id) REFERENCES professors(id) ON DELETE CASCADE
            )
        `);

        // Create committee_members table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS committee_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id INT NOT NULL,
                professor_id INT NOT NULL,
                status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
                invited_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                response_date TIMESTAMP NULL,
                grade DECIMAL(4,2) NULL,
                FOREIGN KEY (assignment_id) REFERENCES thesis_assignments(id) ON DELETE CASCADE,
                FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ Database tables initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
    }
};

module.exports = {
    pool: promisePool,
    testConnection,
    initializeDatabase
};
