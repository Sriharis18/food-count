const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDB() {
    console.log('Connecting to MySQL...');
    // Connect without specifying a database first to create it
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true
        }
    });

    try {
        console.log(`Creating database ${process.env.DB_NAME} if not exists...`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
        
        console.log(`Using database ${process.env.DB_NAME}...`);
        await connection.query(`USE \`${process.env.DB_NAME}\`;`);

        // Create Users Table
        console.log('Creating users table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                collegeId VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'student', 'mess') NOT NULL,
                course VARCHAR(100),
                batch VARCHAR(50)
            );
        `);

        // Add course and batch columns if they don't exist (for existing databases)
        console.log('Checking for new columns in users table...');
        try {
            await connection.query('ALTER TABLE users ADD COLUMN course VARCHAR(100)');
            console.log('Added course column to users table.');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('course column already exists.');
            } else {
                console.error('Error adding course column:', e.message);
            }
        }
        
        try {
            await connection.query('ALTER TABLE users ADD COLUMN batch VARCHAR(50)');
            console.log('Added batch column to users table.');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('batch column already exists.');
            } else {
                console.error('Error adding batch column:', e.message);
            }
        }

        // Create Settings Table
        console.log('Creating settings table...');
        await connection.query('DROP TABLE IF EXISTS settings;');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY DEFAULT 1,
                startTime VARCHAR(5) DEFAULT '09:00',
                cutoff_time VARCHAR(8) DEFAULT '23:59:00',
                is_holiday BOOLEAN DEFAULT false
            )
        `);

        // Create Submissions Table
        console.log('Creating submissions table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userId INT NOT NULL,
                date DATE NOT NULL,
                breakfast BOOLEAN NOT NULL DEFAULT 0,
                lunch BOOLEAN NOT NULL DEFAULT 0,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY user_date_unique (userId, date)
            );
        `);
 
        // Create Guest Counts Table
        console.log('Creating guest_counts table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS guest_counts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                date DATE NOT NULL UNIQUE,
                breakfast INT DEFAULT 0,
                lunch INT DEFAULT 0
            );
        `);

        // Insert default admin if not exists
        console.log('Checking for default admin account...');
        const [adminRows] = await connection.query(`SELECT id FROM users WHERE collegeId = 'Sheela'`);
        if (adminRows.length === 0) {
            console.log('Inserting default admin account...');
            await connection.query(`
                INSERT INTO users (collegeId, name, password, role) 
                VALUES ('Sheela', 'System Admin', 'Sheela@cbs', 'admin')
            `);
        }

        // Insert default mess staff if not exists
        console.log('Checking for default mess account...');
        const [messRows] = await connection.query(`SELECT id FROM users WHERE collegeId = 'mess'`);
        if (messRows.length === 0) {
            console.log('Inserting default mess account...');
            await connection.query(`
                INSERT INTO users (collegeId, name, password, role) 
                VALUES ('mess', 'Mess Staff', 'Mess@cbs', 'mess')
            `);
        }

        // Insert default settings if not exists
        console.log('Checking for default settings...');
        const [settingRows] = await connection.query(`SELECT id FROM settings WHERE id = 1`);
        if (settingRows.length === 0) {
            console.log('Inserting default settings...');
            await connection.query(`
                INSERT INTO settings (id, cutoff_time, is_holiday) 
                VALUES (1, '09:00:00', 0)
            `);
        }

        console.log('Database initialization completed successfully!');
    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        await connection.end();
    }
}

initDB();
