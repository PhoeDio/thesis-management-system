// public-api-test.js - Test and populate the Public API
const axios = require('axios');
const { pool } = require('./src/config/database');

const BASE_URL = 'http://localhost:3000/api/public';

// Sample data for testing
const sampleAnnouncements = [
    {
        thesis_id: null, // Will be set dynamically
        title: 'Thesis Defense: AI-based Recommendation Systems in E-commerce',
        content: 'The student Alice Wilson will present her thesis on developing and evaluating AI-based recommendation systems for e-commerce platforms. The presentation will cover machine learning algorithms, user behavior analysis, and system performance metrics.',
        presentation_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
        location: 'Conference Room A, 2nd Floor, CEID Building',
        meeting_link: 'https://meet.google.com/abc-defg-hij'
    },
    {
        thesis_id: null,
        title: 'Thesis Defense: Advanced Database Optimization Techniques',
        content: 'Student Bob Johnson will defend his thesis focusing on advanced database optimization techniques for large-scale data processing. Topics include query optimization, indexing strategies, and distributed database performance.',
        presentation_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Two weeks
        location: 'Amphitheater B, Ground Floor, CEID Building',
        meeting_link: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting'
    },
    {
        thesis_id: null,
        title: 'Thesis Defense: Web Application Security Analysis',
        content: 'Defense of thesis on comprehensive security analysis of modern web applications, including vulnerability assessment, penetration testing methodologies, and security framework implementation.',
        presentation_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // Three weeks
        location: 'Room 201, 2nd Floor, CEID Building',
        meeting_link: null
    }
];

async function setupTestData() {
    const client = await pool.connect();
    
    try {
        console.log('🏗️  Setting up test data for Public API...\n');
        
        // 1. First, let's create some thesis_works if they don't exist
        console.log('📝 Creating sample thesis works...');
        
        const existingTheses = await client.query('SELECT COUNT(*) as count FROM thesis_works');
        
        if (existingTheses.rows[0].count == 0) {
            console.log('   Creating new thesis works...');
            
            // Create thesis assignments
            const thesesData = [
                { topic_id: 1, student_id: 1, supervisor_id: 1, status: 'under_examination' },
                { topic_id: 2, student_id: 2, supervisor_id: 2, status: 'under_examination' },
                { topic_id: 3, student_id: 1, supervisor_id: 3, status: 'active' }
            ];
            
            for (const thesis of thesesData) {
                const result = await client.query(`
                    INSERT INTO thesis_works (topic_id, student_id, supervisor_id, status, assigned_at, activated_at)
                    VALUES ($1, $2, $3, $4, NOW(), NOW())
                    RETURNING id
                `, [thesis.topic_id, thesis.student_id, thesis.supervisor_id, thesis.status]);
                
                console.log(`   ✅ Created thesis work ID: ${result.rows[0].id}`);
            }
        } else {
            console.log('   ✅ Thesis works already exist');
        }
        
        // 2. Get available thesis IDs for announcements
        const thesesResult = await client.query(`
            SELECT tw.id, tt.title, CONCAT(u.first_name, ' ', u.last_name) as student_name
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students s ON tw.student_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE tw.status IN ('under_examination', 'active')
            LIMIT 3
        `);
        
        if (thesesResult.rows.length === 0) {
            console.log('❌ No thesis works found. Cannot create announcements.');
            return false;
        }
        
        // 3. Clear existing announcements and create new ones
        console.log('\n📢 Creating public announcements...');
        await client.query('DELETE FROM public_announcements');
        
        for (let i = 0; i < Math.min(sampleAnnouncements.length, thesesResult.rows.length); i++) {
            const announcement = sampleAnnouncements[i];
            const thesis = thesesResult.rows[i];
            
            await client.query(`
                INSERT INTO public_announcements 
                (thesis_id, title, content, presentation_date, location, meeting_link, published_at, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), true)
            `, [
                thesis.id,
                announcement.title,
                announcement.content,
                announcement.presentation_date,
                announcement.location,
                announcement.meeting_link
            ]);
            
            console.log(`   ✅ Created announcement for: ${thesis.student_name}`);
        }
        
        console.log('\n🎉 Test data setup completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Error setting up test data:', error.message);
        return false;
    } finally {
        client.release();
    }
}

async function testPublicAPI() {
    console.log('\n🧪 Testing Public API Endpoints...\n');
    
    try {
        // Test 1: Health Check
        console.log('1️⃣ Testing health endpoint...');
        const healthResponse = await axios.get(`${BASE_URL}/health`);
        console.log('   ✅ Health Check:', healthResponse.data.status);
        
        // Test 2: Announcements (JSON)
        console.log('\n2️⃣ Testing announcements (JSON format)...');
        const jsonResponse = await axios.get(`${BASE_URL}/announcements`);
        console.log(`   ✅ JSON Announcements: ${jsonResponse.data.count} found`);
        console.log(`   📋 Sample titles:`, jsonResponse.data.announcements.slice(0, 2).map(a => a.title));
        
        // Test 3: Announcements (XML)
        console.log('\n3️⃣ Testing announcements (XML format)...');
        const xmlResponse = await axios.get(`${BASE_URL}/announcements?format=xml`);
        console.log('   ✅ XML Response received');
        console.log(`   📄 XML Preview (first 200 chars):`);
        console.log('   ', xmlResponse.data.substring(0, 200) + '...');
        
        // Test 4: Date Filtering
        console.log('\n4️⃣ Testing date filtering...');
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const filteredResponse = await axios.get(`${BASE_URL}/announcements?from=${nextWeek}`);
        console.log(`   ✅ Filtered Announcements: ${filteredResponse.data.count} found from ${nextWeek}`);
        
        // Test 5: Statistics
        console.log('\n5️⃣ Testing statistics endpoint...');
        const statsResponse = await axios.get(`${BASE_URL}/statistics`);
        console.log('   ✅ Statistics:', {
            total_completed: statsResponse.data.general_stats.total_completed,
            active_theses: statsResponse.data.general_stats.active_theses,
            avg_grade: statsResponse.data.general_stats.avg_grade
        });
        
        // Test 6: Search
        console.log('\n6️⃣ Testing search endpoint...');
        const searchResponse = await axios.get(`${BASE_URL}/search?q=AI&type=all`);
        console.log(`   ✅ Search Results: ${searchResponse.data.total_results} total results`);
        
        console.log('\n🎉 All API endpoints working correctly!');
        return true;
        
    } catch (error) {
        console.error('❌ API Test failed:', error.response?.data || error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Make sure the server is running:');
            console.log('   npm run dev  OR  node server.js');
        }
        return false;
    }
}

async function demonstrateAPIUsage() {
    console.log('\n📖 API Usage Examples:\n');
    
    const examples = [
        {
            name: 'Get all announcements (JSON)',
            url: `${BASE_URL}/announcements`,
            description: 'Returns all active thesis presentation announcements in JSON format'
        },
        {
            name: 'Get announcements (XML)',
            url: `${BASE_URL}/announcements?format=xml`,
            description: 'Returns all announcements in XML format for RSS feeds'
        },
        {
            name: 'Filter by date range',
            url: `${BASE_URL}/announcements?from=2025-09-15&to=2025-10-15`,
            description: 'Get announcements within specific date range'
        },
        {
            name: 'Search theses',
            url: `${BASE_URL}/search?q=machine learning&type=theses`,
            description: 'Search for completed theses containing specific keywords'
        },
        {
            name: 'Public statistics',
            url: `${BASE_URL}/statistics`,
            description: 'Get anonymized statistics about thesis completion rates'
        },
        {
            name: 'System health',
            url: `${BASE_URL}/health`,
            description: 'Check if the API and database are operational'
        }
    ];
    
    examples.forEach((example, index) => {
        console.log(`${index + 1}. ${example.name}`);
        console.log(`   URL: ${example.url}`);
        console.log(`   Description: ${example.description}\n`);
    });
    
    console.log('🔗 Integration Examples:');
    console.log('• University website can fetch announcements via AJAX');
    console.log('• RSS readers can consume XML feed');
    console.log('• Mobile apps can use JSON API');
    console.log('• Statistical dashboards can pull anonymized data');
}

// Main execution
async function main() {
    console.log('🚀 Public API Deployment & Testing Suite');
    console.log('='.repeat(50));
    
    // Step 1: Setup test data
    const dataSetupSuccess = await setupTestData();
    if (!dataSetupSuccess) {
        console.log('❌ Cannot proceed without test data');
        process.exit(1);
    }
    
    // Step 2: Test API endpoints
    const apiTestSuccess = await testPublicAPI();
    if (!apiTestSuccess) {
        console.log('❌ API testing failed');
        process.exit(1);
    }
    
    // Step 3: Show usage examples
    await demonstrateAPIUsage();
    
    console.log('\n✅ PUBLIC API DEPLOYMENT COMPLETED SUCCESSFULLY!');
    console.log('\n📝 Next Steps:');
    console.log('• API is ready for production use');
    console.log('• XML feeds can be consumed by RSS readers');
    console.log('• JSON endpoints ready for web/mobile integration');
    console.log('• Move to Caching Implementation next');
    
    await pool.end();
}

// Execute if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { setupTestData, testPublicAPI, demonstrateAPIUsage };