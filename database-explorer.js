// database-explorer.js - Εξερεύνηση της βάσης δεδομένων
const { pool } = require('./src/config/database');

async function exploreDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Exploring Database Structure...\n');
        
        // 1. Λίστα όλων των πινάκων
        console.log('📊 DATABASE TABLES:');
        console.log('='.repeat(50));
        const tablesResult = await client.query(`
            SELECT table_name, 
                   (SELECT COUNT(*) FROM information_schema.columns 
                    WHERE table_name = t.table_name AND table_schema = 'public') as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        tablesResult.rows.forEach(row => {
            console.log(`📋 ${row.table_name} (${row.column_count} columns)`);
        });
        
        // 2. User Types
        console.log('\n👥 USER TYPES:');
        console.log('='.repeat(30));
        const userTypesResult = await client.query(`
            SELECT unnest(enum_range(NULL::user_type)) as user_type
        `);
        userTypesResult.rows.forEach(row => {
            console.log(`   • ${row.user_type}`);
        });
        
        // 3. Thesis Status Types
        console.log('\n📝 THESIS STATUS TYPES:');
        console.log('='.repeat(35));
        const statusResult = await client.query(`
            SELECT unnest(enum_range(NULL::thesis_status)) as status
        `);
        statusResult.rows.forEach(row => {
            console.log(`   • ${row.status}`);
        });
        
        // 4. Sample Data Count
        console.log('\n📊 DATA OVERVIEW:');
        console.log('='.repeat(30));
        
        const tables = ['users', 'professors', 'students', 'thesis_topics', 'thesis_works'];
        for (const table of tables) {
            try {
                const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`📌 ${table}: ${countResult.rows[0].count} records`);
            } catch (error) {
                console.log(`❌ ${table}: Error reading`);
            }
        }
        
        // 5. Views που υπάρχουν
        console.log('\n🔍 DATABASE VIEWS:');
        console.log('='.repeat(30));
        const viewsResult = await client.query(`
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = 'public'
        `);
        viewsResult.rows.forEach(row => {
            console.log(`   👁️ ${row.table_name}`);
        });
        
    } catch (error) {
        console.error('❌ Database exploration failed:', error.message);
    } finally {
        client.release();
    }
}

// Helper function για να δούμε το schema ενός πίνακα
async function showTableSchema(tableName) {
    const client = await pool.connect();
    
    try {
        console.log(`\n📋 SCHEMA FOR TABLE: ${tableName.toUpperCase()}`);
        console.log('='.repeat(50));
        
        const schemaResult = await client.query(`
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default,
                character_maximum_length
            FROM information_schema.columns 
            WHERE table_name = $1 AND table_schema = 'public'
            ORDER BY ordinal_position
        `, [tableName]);
        
        schemaResult.rows.forEach(row => {
            const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
            const length = row.character_maximum_length ? `(${row.character_maximum_length})` : '';
            const defaultVal = row.column_default ? ` DEFAULT: ${row.column_default}` : '';
            
            console.log(`   ${row.column_name}: ${row.data_type}${length} ${nullable}${defaultVal}`);
        });
        
    } catch (error) {
        console.error(`❌ Error getting schema for ${tableName}:`, error.message);
    } finally {
        client.release();
    }
}

// Main execution
async function main() {
    await exploreDatabase();
    
    // Δείχνουμε το schema των κύριων πινάκων
    const mainTables = ['users', 'professors', 'students', 'thesis_topics', 'thesis_works'];
    for (const table of mainTables) {
        await showTableSchema(table);
    }
    
    await pool.end();
}

main().catch(console.error);