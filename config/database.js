/**
 * Database Configuration
 * PostgreSQL Connection Pool Setup
 * Support: Railway, Render, Heroku, Local PostgreSQL
 */

const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Configuring database connection...');
console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🌐 Using: ${process.env.DATABASE_URL ? 'Cloud Database (Railway/Render)' : 'Local Database'}`);

// Create pool configuration
let poolConfig;

if (process.env.DATABASE_URL) {
    // ========== CLOUD DATABASE (Railway, Render, Heroku) ==========
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false  // Required for Railway SSL
        },
        max: 20,                        // Max connections
        idleTimeoutMillis: 30000,       // Close idle after 30s
        connectionTimeoutMillis: 5000,  // Timeout after 5s
    };
    console.log('✅ Cloud database configuration ready');
} else {
    // ========== LOCAL DATABASE ==========
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5433,
        database: process.env.DB_NAME || 'attendance',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: false,
    };
    console.log(`📺 Local database: ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);
}

// Create connection pool
const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client:', err.message);
    // Don't exit, just log the error
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Failed to connect to database:');
        console.error('   Error:', err.message);
        console.error('   Hint: Check DATABASE_URL or local PostgreSQL settings');
        // Continue without exiting
    } else {
        console.log('✅ Successfully connected to PostgreSQL database');
        
        // Test query
        client.query('SELECT NOW() as current_time, version() as postgres_version', (queryErr, result) => {
            release();
            if (queryErr) {
                console.error('❌ Database query test failed:', queryErr.message);
            } else {
                console.log('✅ Database verification successful');
                console.log(`   Time: ${result.rows[0].current_time}`);
                console.log(`   Version: ${result.rows[0].postgres_version.substring(0, 50)}...`);
            }
        });
    }
});

/**
 * Query Helper Function
 * Executes a query and returns results with error handling
 * 
 * @param {string} query - SQL query
 * @param {array} params - Query parameters
 * @returns {Promise} - Query results
 */
async function query(queryText, params = []) {
    const start = Date.now();
    try {
        const result = await pool.query(queryText, params);
        const duration = Date.now() - start;
        console.log(`Executed query: ${duration}ms`);
        return result;
    } catch (error) {
        console.error('Database error:', error.message);
        throw error;
    }
}

/**
 * Transaction Helper
 * Executes multiple queries in a transaction
 * 
 * @param {function} callback - Function with queries to execute
 * @returns {Promise} - Transaction results
 */
async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Transaction error:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    query,
    transaction
};
