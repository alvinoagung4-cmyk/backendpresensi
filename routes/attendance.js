// =============================================
// ATTENDANCE API - Node.js/Express Implementation
// =============================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database'); // PostgreSQL connection pool
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

// =============================================
// MIDDLEWARE
// =============================================

// Verify JWT Token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token tidak ditemukan'
        });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Token tidak valid: ' + error.message
        });
    }
};

// Validate user ownership
const validateUserAccess = (req, res, next) => {
    const userId = req.params.userId;
    
    if (req.userId !== userId && !req.isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Anda tidak punya akses ke data ini'
        });
    }
    
    next();
};

// =============================================
// 1. CHECK-IN WITH FACE RECOGNITION
// =============================================
router.post('/attendance/checkin-face', verifyToken, async (req, res) => {
    let client;
    
    try {
        const { user_id, face_image, confidence, timestamp } = req.body;
        
        // Validate input
        if (!user_id || !face_image || confidence === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Data tidak lengkap'
            });
        }
        
        if (confidence < 0.85) {
            return res.status(400).json({
                success: false,
                message: 'Kepercayaan wajah terlalu rendah. Silakan coba lagi'
            });
        }
        
        client = await pool.connect();
        
        // Check if user exists
        const userResult = await client.query(
            'SELECT id, nama_lengkap FROM users WHERE id = $1 AND is_active = true',
            [user_id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }
        
        const userName = userResult.rows[0].nama_lengkap;
        
        // Check if already checked in today
        const existingCheckIn = await client.query(
            `SELECT id FROM attendances 
             WHERE user_id = $1 AND status = 'check_in' 
             AND DATE(timestamp) = CURRENT_DATE`,
            [user_id]
        );
        
        if (existingCheckIn.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Anda sudah check-in hari ini pada pukul ${moment().format('HH:mm:ss')}`
            });
        }
        
        // Insert attendance record
        const attendanceId = uuidv4();
        const ipAddress = req.ip || req.connection.remoteAddress;
        const deviceInfo = req.headers['user-agent'] || 'Unknown';
        const checkInTime = timestamp ? new Date(timestamp) : new Date();
        
        const insertResult = await client.query(
            `INSERT INTO attendances (id, user_id, type, status, timestamp, face_confidence, face_image, location, ip_address, device_info)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                attendanceId,
                user_id,
                'face',
                'check_in',
                checkInTime,
                confidence,
                Buffer.from(face_image, 'base64'), // Store base64 as binary
                'Kantor', // Default location - can be dynamic
                ipAddress,
                deviceInfo
            ]
        );
        
        // Log audit
        await client.query(
            `INSERT INTO audit_logs (user_id, action, description, ip_address, user_agent, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                user_id,
                'CHECKIN_FACE',
                `Check-in dengan face recognition (confidence: ${confidence})`,
                ipAddress,
                deviceInfo,
                'success'
            ]
        );
        
        res.json({
            success: true,
            message: `Check-in berhasil untuk ${userName}`,
            data: {
                id: insertResult.rows[0].id,
                user_id: insertResult.rows[0].user_id,
                type: insertResult.rows[0].type,
                status: insertResult.rows[0].status,
                timestamp: insertResult.rows[0].timestamp,
                face_confidence: insertResult.rows[0].face_confidence,
                created_at: insertResult.rows[0].created_at
            }
        });
        
    } catch (error) {
        console.error('Error in checkin-face:', error);
        
        // Log failed attempt
        if (client) {
            await client.query(
                `INSERT INTO audit_logs (action, description, status)
                 VALUES ($1, $2, $3)`,
                ['CHECKIN_FACE', error.message, 'failed']
            );
        }
        
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    } finally {
        if (client) client.release();
    }
});

// =============================================
// 2. CHECK-OUT WITH FACE RECOGNITION
// =============================================
router.post('/attendance/checkout-face', verifyToken, async (req, res) => {
    let client;
    
    try {
        const { user_id, face_image, confidence, timestamp } = req.body;
        
        // Validate input
        if (!user_id || !face_image || confidence === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Data tidak lengkap'
            });
        }
        
        if (confidence < 0.85) {
            return res.status(400).json({
                success: false,
                message: 'Kepercayaan wajah terlalu rendah'
            });
        }
        
        client = await pool.connect();
        
        // Check user
        const userResult = await client.query(
            'SELECT id, nama_lengkap FROM users WHERE id = $1 AND is_active = true',
            [user_id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }
        
        const userName = userResult.rows[0].nama_lengkap;
        
        // Check if not checked in yet
        const existingCheckIn = await client.query(
            `SELECT id FROM attendances 
             WHERE user_id = $1 AND status = 'check_in' 
             AND DATE(timestamp) = CURRENT_DATE`,
            [user_id]
        );
        
        if (existingCheckIn.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Anda belum melakukan check-in hari ini'
            });
        }
        
        // Check if already checked out
        const existingCheckOut = await client.query(
            `SELECT id FROM attendances 
             WHERE user_id = $1 AND status = 'check_out' 
             AND DATE(timestamp) = CURRENT_DATE`,
            [user_id]
        );
        
        if (existingCheckOut.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Anda sudah check-out hari ini'
            });
        }
        
        // Insert checkout record
        const attendanceId = uuidv4();
        const ipAddress = req.ip || req.connection.remoteAddress;
        const deviceInfo = req.headers['user-agent'] || 'Unknown';
        const checkOutTime = timestamp ? new Date(timestamp) : new Date();
        
        const insertResult = await client.query(
            `INSERT INTO attendances (id, user_id, type, status, timestamp, face_confidence, face_image, location, ip_address, device_info)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                attendanceId,
                user_id,
                'face',
                'check_out',
                checkOutTime,
                confidence,
                Buffer.from(face_image, 'base64'),
                'Kantor',
                ipAddress,
                deviceInfo
            ]
        );
        
        // Log audit
        await client.query(
            `INSERT INTO audit_logs (user_id, action, description, ip_address, user_agent, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                user_id,
                'CHECKOUT_FACE',
                `Check-out dengan face recognition (confidence: ${confidence})`,
                ipAddress,
                deviceInfo,
                'success'
            ]
        );
        
        res.json({
            success: true,
            message: `Check-out berhasil untuk ${userName}`,
            data: {
                id: insertResult.rows[0].id,
                user_id: insertResult.rows[0].user_id,
                type: insertResult.rows[0].type,
                status: insertResult.rows[0].status,
                timestamp: insertResult.rows[0].timestamp,
                face_confidence: insertResult.rows[0].face_confidence,
                created_at: insertResult.rows[0].created_at
            }
        });
        
    } catch (error) {
        console.error('Error in checkout-face:', error);
        
        if (client) {
            await client.query(
                `INSERT INTO audit_logs (action, description, status)
                 VALUES ($1, $2, $3)`,
                ['CHECKOUT_FACE', error.message, 'failed']
            );
        }
        
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    } finally {
        if (client) client.release();
    }
});

// =============================================
// 3. CHECK-IN WITH QR CODE
// =============================================
router.post('/attendance/checkin-qr', verifyToken, async (req, res) => {
    let client;
    
    try {
        const { user_id, qr_code, timestamp } = req.body;
        
        // Validate input
        if (!user_id || !qr_code) {
            return res.status(400).json({
                success: false,
                message: 'User ID dan QR Code harus diisi'
            });
        }
        
        client = await pool.connect();
        
        // Validate QR code
        const qrResult = await client.query(
            `SELECT id, user_id FROM qr_codes 
             WHERE code = $1 
             AND valid_from <= CURRENT_TIMESTAMP 
             AND valid_until > CURRENT_TIMESTAMP
             AND is_used = false`,
            [qr_code]
        );
        
        if (qrResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'QR Code tidak valid atau sudah kadaluarsa'
            });
        }
        
        // Check user
        const userResult = await client.query(
            'SELECT id, nama_lengkap FROM users WHERE id = $1 AND is_active = true',
            [user_id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }
        
        const userName = userResult.rows[0].nama_lengkap;
        
        // Check if already checked in
        const existingCheckIn = await client.query(
            `SELECT id FROM attendances 
             WHERE user_id = $1 AND status = 'check_in' 
             AND DATE(timestamp) = CURRENT_DATE`,
            [user_id]
        );
        
        if (existingCheckIn.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Anda sudah check-in hari ini'
            });
        }
        
        // Insert attendance
        const attendanceId = uuidv4();
        const ipAddress = req.ip || req.connection.remoteAddress;
        const deviceInfo = req.headers['user-agent'] || 'Unknown';
        const checkInTime = timestamp ? new Date(timestamp) : new Date();
        
        const insertResult = await client.query(
            `INSERT INTO attendances (id, user_id, type, status, timestamp, qr_code, location, ip_address, device_info)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                attendanceId,
                user_id,
                'qr',
                'check_in',
                checkInTime,
                qr_code,
                'Kantor',
                ipAddress,
                deviceInfo
            ]
        );
        
        // Update QR code usage
        await client.query(
            `UPDATE qr_codes SET is_used = true, used_at = CURRENT_TIMESTAMP, usage_count = usage_count + 1
             WHERE code = $1`,
            [qr_code]
        );
        
        // Log audit
        await client.query(
            `INSERT INTO audit_logs (user_id, action, description, ip_address, user_agent, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                user_id,
                'CHECKIN_QR',
                `Check-in dengan QR Code: ${qr_code.substring(0, 10)}...`,
                ipAddress,
                deviceInfo,
                'success'
            ]
        );
        
        res.json({
            success: true,
            message: `Check-in berhasil untuk ${userName}`,
            data: {
                id: insertResult.rows[0].id,
                user_id: insertResult.rows[0].user_id,
                type: insertResult.rows[0].type,
                status: insertResult.rows[0].status,
                timestamp: insertResult.rows[0].timestamp,
                qr_code: insertResult.rows[0].qr_code,
                created_at: insertResult.rows[0].created_at
            }
        });
        
    } catch (error) {
        console.error('Error in checkin-qr:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    } finally {
        if (client) client.release();
    }
});

// =============================================
// 4. CHECK-OUT WITH QR CODE
// =============================================
router.post('/attendance/checkout-qr', verifyToken, async (req, res) => {
    let client;
    
    try {
        const { user_id, qr_code, timestamp } = req.body;
        
        if (!user_id || !qr_code) {
            return res.status(400).json({
                success: false,
                message: 'User ID dan QR Code harus diisi'
            });
        }
        
        client = await pool.connect();
        
        // Check user
        const userResult = await client.query(
            'SELECT id, nama_lengkap FROM users WHERE id = $1 AND is_active = true',
            [user_id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }
        
        const userName = userResult.rows[0].nama_lengkap;
        
        // Check if checked in
        const checkInRecord = await client.query(
            `SELECT id FROM attendances 
             WHERE user_id = $1 AND status = 'check_in' 
             AND DATE(timestamp) = CURRENT_DATE`,
            [user_id]
        );
        
        if (checkInRecord.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Anda belum melakukan check-in hari ini'
            });
        }
        
        // Insert checkout
        const attendanceId = uuidv4();
        const ipAddress = req.ip || req.connection.remoteAddress;
        const deviceInfo = req.headers['user-agent'] || 'Unknown';
        const checkOutTime = timestamp ? new Date(timestamp) : new Date();
        
        const insertResult = await client.query(
            `INSERT INTO attendances (id, user_id, type, status, timestamp, qr_code, location, ip_address, device_info)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                attendanceId,
                user_id,
                'qr',
                'check_out',
                checkOutTime,
                qr_code,
                'Kantor',
                ipAddress,
                deviceInfo
            ]
        );
        
        // Log audit
        await client.query(
            `INSERT INTO audit_logs (user_id, action, description, ip_address, user_agent, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                user_id,
                'CHECKOUT_QR',
                `Check-out dengan QR Code: ${qr_code.substring(0, 10)}...`,
                ipAddress,
                deviceInfo,
                'success'
            ]
        );
        
        res.json({
            success: true,
            message: `Check-out berhasil untuk ${userName}`,
            data: {
                id: insertResult.rows[0].id,
                user_id: insertResult.rows[0].user_id,
                type: insertResult.rows[0].type,
                status: insertResult.rows[0].status,
                timestamp: insertResult.rows[0].timestamp,
                qr_code: insertResult.rows[0].qr_code,
                created_at: insertResult.rows[0].created_at
            }
        });
        
    } catch (error) {
        console.error('Error in checkout-qr:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    } finally {
        if (client) client.release();
    }
});

// =============================================
// 5. GET ATTENDANCE HISTORY
// =============================================
router.get('/attendance/history/:userId', verifyToken, validateUserAccess, async (req, res) => {
    let client;
    
    try {
        const { userId } = req.params;
        const { start_date, end_date } = req.query;
        
        client = await pool.connect();
        
        let query = `SELECT * FROM attendances WHERE user_id = $1`;
        const params = [userId];
        
        if (start_date) {
            query += ` AND DATE(timestamp) >= $${params.length + 1}`;
            params.push(new Date(start_date));
        }
        
        if (end_date) {
            query += ` AND DATE(timestamp) <= $${params.length + 1}`;
            params.push(new Date(end_date));
        }
        
        query += ` ORDER BY timestamp DESC LIMIT 1000`;
        
        const result = await client.query(query, params);
        
        const formattedData = result.rows.map(row => ({
            id: row.id,
            user_id: row.user_id,
            type: row.type,
            status: row.status,
            timestamp: row.timestamp,
            face_confidence: row.face_confidence,
            qr_code: row.qr_code,
            location: row.location,
            created_at: row.created_at
        }));
        
        res.json({
            success: true,
            message: 'Riwayat presensi',
            data: formattedData
        });
        
    } catch (error) {
        console.error('Error in get history:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    } finally {
        if (client) client.release();
    }
});

// =============================================
// 6. GET TODAY'S ATTENDANCE
// =============================================
router.get('/attendance/today/:userId', verifyToken, validateUserAccess, async (req, res) => {
    let client;
    
    try {
        const { userId } = req.params;
        
        client = await pool.connect();
        
        const result = await client.query(
            `SELECT check_in_time, check_out_time, check_in_type, check_out_type, 
                    work_duration, face_confidence_in, face_confidence_out
             FROM attendance_summaries
             WHERE user_id = $1 AND date = CURRENT_DATE`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                success: true,
                message: 'Belum ada presensi hari ini',
                data: null
            });
        }
        
        const summary = result.rows[0];
        
        res.json({
            success: true,
            message: 'Presensi hari ini',
            data: {
                check_in_time: summary.check_in_time,
                check_out_time: summary.check_out_time,
                check_in_type: summary.check_in_type,
                check_out_type: summary.check_out_type,
                duration: summary.work_duration,
                face_confidence_in: summary.face_confidence_in,
                face_confidence_out: summary.face_confidence_out
            }
        });
        
    } catch (error) {
        console.error('Error in get today:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    } finally {
        if (client) client.release();
    }
});

// =============================================
// 7. GET ATTENDANCE STATISTICS
// =============================================
router.get('/attendance/statistics/:userId', verifyToken, validateUserAccess, async (req, res) => {
    let client;
    
    try {
        const { userId } = req.params;
        const { month, year } = req.query;
        
        const currentDate = new Date();
        const queryMonth = month || currentDate.getMonth() + 1;
        const queryYear = year || currentDate.getFullYear();
        
        client = await pool.connect();
        
        // Get statistics
        const statsResult = await client.query(
            `SELECT total_check_ins, total_check_outs, total_work_hours, average_daily_hours
             FROM attendance_statistics
             WHERE user_id = $1 AND month = $2 AND year = $3`,
            [userId, queryMonth, queryYear]
        );
        
        // Get daily summaries
        const dailyResult = await client.query(
            `SELECT date, check_in_time, check_out_time, work_duration
             FROM attendance_summaries
             WHERE user_id = $1 
             AND EXTRACT(MONTH FROM date) = $2 
             AND EXTRACT(YEAR FROM date) = $3
             ORDER BY date DESC`,
            [userId, queryMonth, queryYear]
        );
        
        const stats = statsResult.rows[0] || {
            total_check_ins: 0,
            total_check_outs: 0,
            total_work_hours: 0,
            average_daily_hours: 0
        };
        
        const dailySummaries = dailyResult.rows.map(row => ({
            date: row.date,
            check_ins: 1,
            check_outs: row.check_out_time ? 1 : 0,
            duration: row.work_duration ? `${Math.floor(row.work_duration / 3600)}h ${Math.floor((row.work_duration % 3600) / 60)}m` : '0h 0m'
        }));
        
        res.json({
            success: true,
            message: 'Statistik presensi',
            data: {
                total_check_ins: stats.total_check_ins,
                total_check_outs: stats.total_check_outs,
                daily_summaries: dailySummaries,
                month: queryMonth,
                year: queryYear
            }
        });
        
    } catch (error) {
        console.error('Error in statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    } finally {
        if (client) client.release();
    }
});

// =============================================
// 8. VERIFY FACE (Optional)
// =============================================
router.post('/attendance/verify-face', verifyToken, async (req, res) => {
    try {
        const { face_image } = req.body;
        
        if (!face_image) {
            return res.status(400).json({
                success: false,
                message: 'Face image diperlukan'
            });
        }
        
        // TODO: Implement actual face verification using Python/ML service
        // For now, just return a mock response
        res.json({
            success: true,
            message: 'Wajah valid',
            data: {
                is_valid: true,
                is_live: true,
                confidence: 0.95,
                face_detected: true
            }
        });
        
    } catch (error) {
        console.error('Error in verify face:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    }
});

// =============================================
// 9. VALIDATE QR CODE
// =============================================
router.post('/attendance/validate-qr', verifyToken, async (req, res) => {
    let client;
    
    try {
        const { qr_code } = req.body;
        
        if (!qr_code) {
            return res.status(400).json({
                success: false,
                message: 'QR Code diperlukan'
            });
        }
        
        client = await pool.connect();
        
        const result = await client.query(
            `SELECT user_id, valid_from, valid_until
             FROM qr_codes
             WHERE code = $1`,
            [qr_code]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'QR Code tidak ditemukan'
            });
        }
        
        const qrData = result.rows[0];
        const now = new Date();
        const isValid = qrData.valid_from <= now && qrData.valid_until > now;
        
        res.json({
            success: isValid,
            message: isValid ? 'QR code valid' : 'QR code kadaluarsa',
            data: {
                is_valid: isValid,
                user_id: qrData.user_id,
                valid_for_date: moment(qrData.valid_from).format('YYYY-MM-DD'),
                expiry_time: qrData.valid_until
            }
        });
        
    } catch (error) {
        console.error('Error in validate qr:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan: ' + error.message
        });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
