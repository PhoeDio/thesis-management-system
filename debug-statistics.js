// debug-statistics.js - Diagnostic script to identify the exact issue

const { pool } = require('./src/config/database');

async function debugStatistics() {
    console.log('🔍 Debugging Statistics Endpoint Issues...\n');
    
    const client = await pool.connect();
    
    try {
        // Step 1: Check if we have any thesis_works data at all
        console.log('1️⃣ Checking thesis_works table data...');
        const totalTheses = await client.query('SELECT COUNT(*) as count FROM thesis_works');
        console.log(`   Total thesis works in database: ${totalTheses.rows[0].count}`);
        
        if (totalTheses.rows[0].count == 0) {
            console.log('   ❌ No thesis works found! This explains the statistics issue.');
            console.log('   💡 Run the public-api-test.js script first to create sample data.');
            return;
        }
        
        // Step 2: Check status distribution
        console.log('\n2️⃣ Checking thesis status distribution...');
        const statusDist = await client.query(`
            SELECT status, COUNT(*) as count
            FROM thesis_works 
            GROUP BY status
        `);
        
        console.log('   Status distribution:');
        statusDist.rows.forEach(row => {
            console.log(`     ${row.status}: ${row.count}`);
        });
        
        // Step 3: Test each query individually
        console.log('\n3️⃣ Testing individual queries...');
        
        // Test generalStats query
        console.log('   Testing generalStats query...');
        try {
            const generalStats = await client.query(`
                SELECT 
                    COUNT(CASE WHEN tw.status = 'completed' THEN 1 END) as total_completed,
                    COUNT(CASE WHEN tw.status = 'active' THEN 1 END) as active_theses,
                    COUNT(CASE WHEN tw.status = 'under_examination' THEN 1 END) as under_examination,
                    AVG(CASE WHEN tw.status = 'completed' AND tw.final_grade IS NOT NULL 
                        THEN tw.final_grade END) as avg_grade,
                    AVG(CASE WHEN tw.status = 'completed' AND tw.completed_at IS NOT NULL 
                        THEN EXTRACT(EPOCH FROM (tw.completed_at - tw.activated_at))/86400 
                        END) as avg_completion_days
                FROM thesis_works tw
            `);
            console.log('   ✅ generalStats query successful');
            console.log('   Results:', generalStats.rows[0]);
        } catch (error) {
            console.log('   ❌ generalStats query failed:', error.message);
        }
        
        // Test yearlyStats query
        console.log('\n   Testing yearlyStats query...');
        try {
            const yearlyStats = await client.query(`
                SELECT 
                    EXTRACT(YEAR FROM completed_at) as year,
                    COUNT(*) as completed_count,
                    AVG(final_grade) as avg_grade
                FROM thesis_works
                WHERE status = 'completed' AND completed_at IS NOT NULL
                GROUP BY EXTRACT(YEAR FROM completed_at)
                ORDER BY year DESC
                LIMIT 5
            `);
            console.log('   ✅ yearlyStats query successful');
            console.log(`   Results: ${yearlyStats.rows.length} yearly records found`);
            if (yearlyStats.rows.length > 0) {
                console.log('   Sample:', yearlyStats.rows[0]);
            }
        } catch (error) {
            console.log('   ❌ yearlyStats query failed:', error.message);
        }
        
        // Test gradeDistribution query - THIS MIGHT BE THE CULPRIT
        console.log('\n   Testing gradeDistribution query...');
        try {
            const gradeDistribution = await client.query(`
                SELECT 
                    CASE 
                        WHEN final_grade >= 8.5 THEN 'Excellent (8.5-10)'
                        WHEN final_grade >= 6.5 THEN 'Very Good (6.5-8.4)'
                        WHEN final_grade >= 5.0 THEN 'Good (5.0-6.4)'
                        ELSE 'Other'
                    END as grade_category,
                    COUNT(*) as count
                FROM thesis_works
                WHERE status = 'completed' AND final_grade IS NOT NULL
                GROUP BY 
                    CASE 
                        WHEN final_grade >= 8.5 THEN 'Excellent (8.5-10)'
                        WHEN final_grade >= 6.5 THEN 'Very Good (6.5-8.4)'
                        WHEN final_grade >= 5.0 THEN 'Good (5.0-6.4)'
                        ELSE 'Other'
                    END
                ORDER BY 
                    CASE grade_category
                        WHEN 'Excellent (8.5-10)' THEN 1
                        WHEN 'Very Good (6.5-8.4)' THEN 2
                        WHEN 'Good (5.0-6.4)' THEN 3
                        ELSE 4
                    END
            `);
            console.log('   ✅ gradeDistribution query successful');
            console.log(`   Results: ${gradeDistribution.rows.length} grade categories found`);
        } catch (error) {
            console.log('   ❌ gradeDistribution query failed:', error.message);
            console.log('   🔍 This is likely the problem! Let me test a simpler version...');
            
            // Test simpler version without complex ORDER BY
            try {
                const simpleGradeQuery = await client.query(`
                    SELECT 
                        CASE 
                            WHEN final_grade >= 8.5 THEN 'Excellent (8.5-10)'
                            WHEN final_grade >= 6.5 THEN 'Very Good (6.5-8.4)'
                            WHEN final_grade >= 5.0 THEN 'Good (5.0-6.4)'
                            ELSE 'Other'
                        END as grade_category,
                        COUNT(*) as count
                    FROM thesis_works
                    WHERE status = 'completed' AND final_grade IS NOT NULL
                    GROUP BY 
                        CASE 
                            WHEN final_grade >= 8.5 THEN 'Excellent (8.5-10)'
                            WHEN final_grade >= 6.5 THEN 'Very Good (6.5-8.4)'
                            WHEN final_grade >= 5.0 THEN 'Good (5.0-6.4)'
                            ELSE 'Other'
                        END
                `);
                console.log('   ✅ Simplified gradeDistribution query works!');
                console.log('   🔧 The issue is with the ORDER BY clause referencing grade_category');
                
            } catch (simpleError) {
                console.log('   ❌ Even simplified query failed:', simpleError.message);
            }
        }
        
        // Step 4: Check for completed theses with grades
        console.log('\n4️⃣ Checking completed theses with grades...');
        const completedWithGrades = await client.query(`
            SELECT COUNT(*) as count 
            FROM thesis_works 
            WHERE status = 'completed' AND final_grade IS NOT NULL
        `);
        console.log(`   Completed theses with grades: ${completedWithGrades.rows[0].count}`);
        
        if (completedWithGrades.rows[0].count == 0) {
            console.log('   ℹ️  No completed theses with grades found.');
            console.log('   💡 This means some statistics will be empty, but shouldn\'t cause errors.');
        }
        
    } catch (error) {
        console.error('❌ Debug script failed:', error.message);
    } finally {
        client.release();
    }
}

// Also create some sample completed theses for testing
async function createSampleCompletedTheses() {
    console.log('\n🏗️  Creating sample completed theses for testing...');
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Update one of the existing thesis works to be completed with a grade
        const updateResult = await client.query(`
            UPDATE thesis_works 
            SET status = 'completed', 
                completed_at = CURRENT_TIMESTAMP,
                final_grade = 8.5,
                general_assembly_number = 123,
                general_assembly_year = 2025
            WHERE id = (SELECT id FROM thesis_works LIMIT 1)
            RETURNING id
        `);
        
        if (updateResult.rows.length > 0) {
            console.log(`   ✅ Updated thesis ${updateResult.rows[0].id} to completed status with grade 8.5`);
            
            // Create another completed thesis
            const existingTheses = await client.query('SELECT id FROM thesis_works WHERE id != $1 LIMIT 1', [updateResult.rows[0].id]);
            
            if (existingTheses.rows.length > 0) {
                await client.query(`
                    UPDATE thesis_works 
                    SET status = 'completed', 
                        completed_at = CURRENT_TIMESTAMP - INTERVAL '6 months',
                        final_grade = 7.2,
                        general_assembly_number = 122,
                        general_assembly_year = 2024
                    WHERE id = $1
                `, [existingTheses.rows[0].id]);
                
                console.log(`   ✅ Updated thesis ${existingTheses.rows[0].id} to completed status with grade 7.2`);
            }
        }
        
        await client.query('COMMIT');
        console.log('   🎉 Sample completed theses created successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('   ❌ Failed to create sample data:', error.message);
    } finally {
        client.release();
    }
}

async function main() {
    await debugStatistics();
    
    console.log('\n📋 DIAGNOSIS SUMMARY:');
    console.log('Based on the results above, the issue is likely:');
    console.log('1. No data in thesis_works table, OR');
    console.log('2. SQL syntax error in gradeDistribution ORDER BY clause, OR');
    console.log('3. No completed theses with grades for meaningful statistics');
    
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    readline.question('\nWould you like me to create some sample completed theses with grades? (y/n): ', async (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            await createSampleCompletedTheses();
            console.log('\n💡 Now try accessing http://localhost:3000/api/public/statistics again!');
        }
        
        readline.close();
        await pool.end();
    });
}

main().catch(console.error);