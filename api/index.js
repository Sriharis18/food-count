const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large Excel files
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request Logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve static files from root in Vercel is handled by Vercel automatically
// But we keep this for local compatibility if needed
app.use(express.static(__dirname + '/../')); 

// Database Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

// Helper to test DB connection
pool.getConnection()
    .then(conn => {
        console.log('Connected to MySQL database!');
        conn.release();
    })
    .catch(err => {
        console.error('Failed to connect to the database:', err.message);
    });

// --------------------------------------------------------------------------
// AUTHENTICATION API
// --------------------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
    try {
        const { id, password } = req.body;
        const [rows] = await pool.query(
            'SELECT id, collegeId, name, role FROM users WHERE collegeId = ? AND password = ?',
            [id, password]
        );
        
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(401).json({ error: 'Invalid ID or Password.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --------------------------------------------------------------------------
// STUDENT API
// --------------------------------------------------------------------------
app.get('/api/student/status', async (req, res) => {
    try {
        const { userId, date } = req.query;
        if (!userId || !date) return res.status(400).json({ error: 'Missing parameters' });

        const [rows] = await pool.query(
            'SELECT breakfast, lunch FROM submissions WHERE userId = ? AND date = ?',
            [userId, date]
        );
        
        if (rows.length > 0) {
            res.json({ breakfast: rows[0].breakfast === 1, lunch: rows[0].lunch === 1 });
        } else {
            res.status(404).json({ message: 'No submission found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/student/submit', async (req, res) => {
    try {
        const { userId, date, breakfast, lunch } = req.body;
        
        // Strictly prevent multiple submissions per day per user
        const [existing] = await pool.query(
            'SELECT id FROM submissions WHERE userId = ? AND date = ?',
            [userId, date]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'You have already submitted your selection for today.' });
        }

        await pool.query(
            'INSERT INTO submissions (userId, date, breakfast, lunch) VALUES (?, ?, ?, ?)',
            [userId, date, breakfast, lunch]
        );
        
        res.json({ success: true, message: 'Submitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/student/edit', async (req, res) => {
    try {
        const { userId, date } = req.body;
        await pool.query(
            'DELETE FROM submissions WHERE userId = ? AND date = ?',
            [userId, date]
        );
        res.json({ success: true, message: 'Submission deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --------------------------------------------------------------------------
// ADMIN API
// --------------------------------------------------------------------------
app.get('/api/admin/settings', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT startTime, cutoff_time, is_holiday FROM settings WHERE id = 1');
        if (rows.length > 0) {
            const s = rows[0];
            const cutoff = s.cutoff_time ? String(s.cutoff_time).slice(0, 5) : '23:59';
            
            // Only manual holiday from DB, weekend holiday handled by target date
            const holiday = (s.is_holiday === 1);
            
            res.json({ startTime: s.startTime || '09:00', cutoff, holiday });
        } else {
            res.json({ startTime: '09:00', cutoff: '23:59', holiday: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/admin/settings', async (req, res) => {
    try {
        const { startTime, cutoff, holiday } = req.body;
        await pool.query(
            'UPDATE settings SET startTime = ?, cutoff_time = ?, is_holiday = ? WHERE id = 1',
            [startTime, cutoff + ':00', holiday ? 1 : 0]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'Missing date parameter' });

        // Total Students
        const [userRows] = await pool.query('SELECT COUNT(*) as total FROM users WHERE role = "student"');
        const totalStudents = userRows[0].total;

        // Submissions for date
        const [subRows] = await pool.query(
            'SELECT SUM(breakfast) as bf, SUM(lunch) as lu FROM submissions WHERE date = ?',
            [date]
        );
        
        const breakfast = subRows[0].bf || 0;
        const lunch = subRows[0].lu || 0;

        // Guest counts for date
        const [guestRows] = await pool.query(
            'SELECT breakfast, lunch FROM guest_counts WHERE date = ?',
            [date]
        );
        const guestBf = guestRows.length > 0 ? guestRows[0].breakfast : 0;
        const guestLu = guestRows.length > 0 ? guestRows[0].lunch : 0;

        res.json({ 
            totalStudents, 
            breakfast: parseInt(breakfast), 
            lunch: parseInt(lunch),
            guests: { breakfast: guestBf, lunch: guestLu }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/students', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, collegeId, name, course, batch FROM users WHERE role = "student"');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/students', async (req, res) => {
    try {
        const { collegeId, name, password, course, batch } = req.body;
        
        // check if exists
        const [existing] = await pool.query('SELECT id FROM users WHERE collegeId = ?', [collegeId]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'ID Exists' });
        }

        await pool.query(
            'INSERT INTO users (collegeId, name, password, role, course, batch) VALUES (?, ?, ?, "student", ?, ?)',
            [collegeId, name, password, course || null, batch || null]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/students/bulk', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { students } = req.body;
        console.log(`Bulk Add Request: Received ${students ? students.length : 0} students`);
        
        if (!students || !Array.isArray(students)) {
            return res.status(400).json({ error: 'Invalid students data' });
        }

        await connection.beginTransaction();

        for (const student of students) {
            const { collegeId, name, password, course, batch } = student;
            
            // Check if exists
            const [existing] = await connection.query('SELECT id FROM users WHERE collegeId = ?', [collegeId]);
            if (existing.length > 0) {
                continue;
            }

            await connection.query(
                'INSERT INTO users (collegeId, name, password, role, course, batch) VALUES (?, ?, ?, "student", ?, ?)',
                [collegeId, name, password, course || null, batch || null]
            );
        }

        await connection.commit();
        console.log(`Bulk Add Success: Processed ${students.length} students`);
        res.json({ success: true, message: `${students.length} students processed.` });
    } catch (err) {
        await connection.rollback();
        console.error('Bulk add error details:', err);
        res.status(500).json({ error: 'Failed to process bulk student addition: ' + err.message });
    } finally {
        connection.release();
    }
});

app.delete('/api/admin/students/:collegeId', async (req, res) => {
    try {
        const { collegeId } = req.params;
        await pool.query('DELETE FROM users WHERE collegeId = ? AND role = "student"', [collegeId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/monthly-report', async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) return res.status(400).json({ error: 'Missing month/year parameters' });

        // Total Monthly Summary
        const [totals] = await pool.query(
            `SELECT SUM(breakfast) as bf, SUM(lunch) as lu 
             FROM submissions 
             WHERE MONTH(date) = ? AND YEAR(date) = ?`,
            [month, year]
        );

        // Daily Breakdown for the month
        const [daily] = await pool.query(
            `SELECT date, SUM(breakfast) as bf, SUM(lunch) as lu 
             FROM submissions 
             WHERE MONTH(date) = ? AND YEAR(date) = ?
             GROUP BY date 
             ORDER BY date ASC`,
            [month, year]
        );

        // Fetch monthly guest counts
        const [guests] = await pool.query(
            `SELECT date, breakfast, lunch FROM guest_counts 
             WHERE MONTH(date) = ? AND YEAR(date) = ?`,
            [month, year]
        );

        // Calculate guest totals
        let guestTotalBf = 0;
        let guestTotalLu = 0;
        guests.forEach(g => {
            guestTotalBf += g.breakfast;
            guestTotalLu += g.lunch;
        });

        res.json({
            month: parseInt(month),
            year: parseInt(year),
            totals: {
                breakfast: parseInt(totals[0].bf || 0),
                lunch: parseInt(totals[0].lu || 0),
                guests: { breakfast: guestTotalBf, lunch: guestTotalLu }
            },
            daily: daily.map(d => {
                const guestForDay = guests.find(g => {
                    const d1 = new Date(d.date).toISOString().split('T')[0];
                    const d2 = new Date(g.date).toISOString().split('T')[0];
                    return d1 === d2;
                });
                return {
                    date: d.date,
                    breakfast: parseInt(d.bf || 0),
                    lunch: parseInt(d.lu || 0),
                    guests: guestForDay ? { breakfast: guestForDay.breakfast, lunch: guestForDay.lunch } : { breakfast: 0, lunch: 0 }
                };
            })
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/guests', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'Missing date parameter' });
        const [rows] = await pool.query('SELECT breakfast, lunch FROM guest_counts WHERE date = ?', [date]);
        if (rows.length > 0) res.json(rows[0]);
        else res.json({ breakfast: 0, lunch: 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/guests', async (req, res) => {
    try {
        const { date, breakfast, lunch } = req.body;
        if (!date) return res.status(400).json({ error: 'Missing date' });

        await pool.query(
            'REPLACE INTO guest_counts (date, breakfast, lunch) VALUES (?, ?, ?)',
            [date, breakfast || 0, lunch || 0]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Guest update DB error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --------------------------------------------------------------------------
// MESS API
// --------------------------------------------------------------------------
app.get('/api/mess/report', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'Missing date parameter' });

        const [rows] = await pool.query(
            `SELECT u.collegeId as userId, u.name as userName, u.course, u.batch, s.breakfast, s.lunch 
             FROM submissions s
             JOIN users u ON s.userId = u.id
             WHERE s.date = ?`,
            [date]
        );
        
        res.json(rows.map(r => ({
            userId: r.userId,
            userName: r.userName,
            course: r.course,
            batch: r.batch,
            breakfast: r.breakfast === 1,
            lunch: r.lunch === 1
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server (only if run directly, not as a serverless function)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

module.exports = app;
