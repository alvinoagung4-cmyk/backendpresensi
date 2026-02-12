/**
 * Database Configuration
 * PostgreSQL Connection Pool Setup
 */

const { Pool } = require('pg');
require('dotenv').config();

// Support cloud database URL (Railway, Render, Heroku)
let poolConfig;

if (process.env.DATABASE_URL) {
    // Cloud database (e.g., Railway, Render)
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    };
} else {
    // Local database
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5433,
        database: process.env.DB_NAME || 'attendance',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        
        // Connection pool settings
        max: 20,                          // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,         // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000,    // Connection timeout after 2 seconds
        
        // SSL Configuration (for production)
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };
}

// Create connection pool
const pool = new Pool(poolConfig);

// Handle connection errors
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client:', err);
    process.exit(-1);
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Failed to connect to database:', err.message);
    } else {
        console.log('✅ Successfully connected to PostgreSQL database');
        client?.query('SELECT NOW()', (queryErr, result) => {
            release();
            if (queryErr) {
                console.error('Database query test failed:', queryErr);
            } else {
                console.log('Database server time:', result?.rows[0]?.now);
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
