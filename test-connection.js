
const { pool } = require('./src/config/database');

async function testDatabaseConnection() {
    try {
        console.log('🔍 Testing database connection...');
        
        // Test basic connection
        const client = await pool.connect();
        console.log('✅ Connected to PostgreSQL');
        
        // Test if tables exist
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log('📋 Available tables:');
        tablesResult.rows.forEach(row => {
            console.log('  -', row.table_name);
        });
        
        // Test user types enum
        const enumResult = await client.query(`
            SELECT unnest(enum_range(NULL::user_type)) as user_type
        `);
        
        console.log('👥 Available user types:');
        enumResult.rows.forEach(row => {
            console.log('  -', row.user_type);
        });
        
        client.release();
        console.log('✅ Database test completed successfully');
        
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
    } finally {
        await pool.end();
    }
}

testDatabaseConnection();
