
const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'thesis_management',
    port: process.env.DB_PORT || 5432,

    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,

});

// Test connection
const testConnection = async () => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('✅ PostgreSQL connected successfully at:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ PostgreSQL connection failed:', error.message);
        return false;
    }
};

// Simple initialization - χρησιμοποιεί το υπάρχον SQL schema σας
const initializeDatabase = async () => {
    try {
        console.log('📄 Using existing SQL schema from ThesisManagementSystem.sql');
        console.log('💡 Run the SQL file manually in PostgreSQL to create tables');
        return true;
    } catch (error) {
        console.error('❌ Error in database initialization:', error.message);
        return false;
    }
};

module.exports = {
    pool,
    testConnection,
    initializeDatabase
<<<<<<< HEAD
};
=======
};
>>>>>>> 9745299ff62c6b661783167c3511c9775ecf91c6
