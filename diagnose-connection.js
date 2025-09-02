// diagnose-connection.js - Διάγνωση σύνδεσης βάσης
const { pool } = require('./src/config/database');
require('dotenv').config();

async function diagnoseConnection() {
    console.log('🔍 Database Connection Diagnosis\n');
    console.log('='.repeat(50));
    
    // 1. Εμφάνιση configuration
    console.log('📋 CURRENT CONFIGURATION:');
    console.log('─'.repeat(30));
    console.log(`Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`User: ${process.env.DB_USER || 'postgres'}`);
    console.log(`Database: ${process.env.DB_NAME || 'thesis_management'}`);
    console.log(`Port: ${process.env.DB_PORT || 5432}`);
    console.log(`Password set: ${process.env.DB_PASSWORD ? 'YES' : 'NO'}`);
    console.log();
    
    try {
        const client = await pool.connect();
        
        // 2. Έλεγχος ποια βάση χρησιμοποιούμε
        console.log('🔗 CONNECTION INFO:');
        console.log('─'.repeat(30));
        
        const dbInfo = await client.query(`
            SELECT 
                current_database() as current_db,
                current_user as current_user,
                inet_server_addr() as server_address,
                inet_server_port() as server_port,
                version() as version
        `);
        
        const info = dbInfo.rows[0];
        console.log(`Connected to database: ${info.current_db}`);
        console.log(`Connected as user: ${info.current_user}`);
        console.log(`Server: ${info.server_address || 'localhost'}:${info.server_port}`);
        console.log(`PostgreSQL version: ${info.version.split(',')[0]}`);
        console.log();
        
        // 3. Έλεγχος πινάκων στη βάση που χρησιμοποιούμε
        console.log('📊 TABLES IN CURRENT DATABASE:');
        console.log('─'.repeat(40));
        
        const tablesResult = await client.query(`
            SELECT 
                table_name,
                table_type
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        if (tablesResult.rows.length === 0) {
            console.log('❌ NO TABLES FOUND!');
            console.log('   This means the schema was not imported to this database.');
        } else {
            tablesResult.rows.forEach(row => {
                console.log(`   📄 ${row.table_name} (${row.table_type})`);
            });
        }
        console.log();
        
        // 4. Έλεγχος δεδομένων στον πίνακα users (αν υπάρχει)
        console.log('👥 USERS TABLE DATA:');
        console.log('─'.repeat(30));
        
        try {
            const usersResult = await client.query(`
                SELECT 
                    id, 
                    username, 
                    email, 
                    user_type, 
                    first_name, 
                    last_name, 
                    created_at,
                    is_active
                FROM users 
                ORDER BY created_at DESC
            `);
            
            if (usersResult.rows.length === 0) {
                console.log('⚠️  No users found in database');
            } else {
                console.log(`Found ${usersResult.rows.length} users:`);
                usersResult.rows.forEach((user, index) => {
                    console.log(`   ${index + 1}. ${user.username} (${user.user_type}) - ${user.first_name} ${user.last_name}`);
                    console.log(`      📧 ${user.email}`);
                    console.log(`      📅 Created: ${user.created_at}`);
                    console.log(`      ✅ Active: ${user.is_active}`);
                    console.log();
                });
            }
        } catch (error) {
            console.log('❌ Cannot read users table:', error.message);
            console.log('   This suggests the table doesn\'t exist or has different structure');
        }
        
        // 5. Λίστα όλων των βάσεων στο server
        console.log('🗄️  ALL DATABASES ON SERVER:');
        console.log('─'.repeat(35));
        
        const allDatabases = await client.query(`
            SELECT 
                datname as database_name,
                pg_database_size(datname) as size_bytes,
                pg_size_pretty(pg_database_size(datname)) as size_pretty
            FROM pg_database 
            WHERE datistemplate = false
            ORDER BY datname
        `);
        
        allDatabases.rows.forEach(db => {
            const isCurrentDb = db.database_name === info.current_db;
            console.log(`   ${isCurrentDb ? '🎯' : '📄'} ${db.database_name} (${db.size_pretty})`);
        });
        
        console.log();
        
        // 6. Έλεγχος για άλλες βάσεις που μπορεί να έχουν το schema
        console.log('🔍 CHECKING OTHER DATABASES FOR THESIS SCHEMA:');
        console.log('─'.repeat(50));
        
        for (const dbRow of allDatabases.rows) {
            const dbName = dbRow.database_name;
            if (dbName === info.current_db || dbName === 'postgres' || dbName === 'template0' || dbName === 'template1') {
                continue; // Skip current and system databases
            }
            
            try {
                // Create temporary connection to check this database
                const { Pool } = require('pg');
                const tempPool = new Pool({
                    host: process.env.DB_HOST || 'localhost',
                    user: process.env.DB_USER || 'postgres',
                    password: process.env.DB_PASSWORD || '',
                    database: dbName,
                    port: process.env.DB_PORT || 5432
                });
                
                const tempClient = await tempPool.connect();
                const tablesInDb = await tempClient.query(`
                    SELECT COUNT(*) as table_count
                    FROM information_schema.tables 
                    WHERE table_schema = 'public'
                `);
                
                const userTableExists = await tempClient.query(`
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'users'
                    ) as has_users_table
                `);
                
                if (parseInt(tablesInDb.rows[0].table_count) > 0) {
                    console.log(`   🔍 ${dbName}: ${tablesInDb.rows[0].table_count} tables ${userTableExists.rows[0].has_users_table ? '(has users table)' : ''}`);
                    
                    if (userTableExists.rows[0].has_users_table) {
                        const userCount = await tempClient.query('SELECT COUNT(*) as count FROM users');
                        console.log(`      👥 Users in this database: ${userCount.rows[0].count}`);
                    }
                }
                
                tempClient.release();
                await tempPool.end();
                
            } catch (error) {
                // Skip databases we can't access
            }
        }
        
        client.release();
        
        console.log('\n' + '='.repeat(50));
        console.log('🎯 DIAGNOSIS COMPLETE');
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.error('Error code:', error.code);
        
        if (error.code === '3D000') {
            console.log('\n💡 SOLUTION: The database in your .env file does not exist.');
            console.log('Either:');
            console.log('1. Create the database: createdb -U postgres thesis_management');
            console.log('2. Or change DB_NAME in .env to an existing database');
        }
    } finally {
        await pool.end();
    }
}

// Helper function to show environment file content
function showEnvFile() {
    const fs = require('fs');
    const path = require('path');
    
    console.log('\n📄 CURRENT .env FILE CONTENT:');
    console.log('─'.repeat(35));
    
    const envPath = path.join(__dirname, '.env');
    
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        lines.forEach(line => {
            if (line.includes('PASSWORD')) {
                const [key] = line.split('=');
                console.log(`${key}=****** (hidden)`);
            } else {
                console.log(line);
            }
        });
    } else {
        console.log('❌ .env file not found');
        console.log('Create one with:');
        console.log('DB_HOST=localhost');
        console.log('DB_USER=postgres');
        console.log('DB_PASSWORD=your_password');
        console.log('DB_NAME=thesis_management');
        console.log('DB_PORT=5432');
    }
}

async function main() {
    showEnvFile();
    await diagnoseConnection();
}

main().catch(console.error);