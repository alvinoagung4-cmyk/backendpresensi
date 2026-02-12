const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// ============ MIDDLEWARE ============
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ DATABASE CONNECTION (PostgreSQL) ============
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'presensi_app',
  port: process.env.DB_PORT || 5433
});

// Test database connection
pool.connect()
  .then(client => {
    console.log('Database connected');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database error:', err.message);
    console.log('Pastikan PostgreSQL berjalan dan database sudah dibuat');
  });

// ============ EMAIL SETUP ============
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ============ HELPER FUNCTIONS ============

// Middleware untuk verifikasi JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token tidak valid' });
  }
};

// Fungsi untuk kirim email
const sendVerificationEmail = async (email, nama_lengkap, token) => {
  const verificationLink = `http://192.168.1.1:8080/verify-email?token=${token}`;
  
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: '✉️ Verifikasi Email - Aplikasi Presensi',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0;">Aplikasi Presensi</h1>
            <p style="margin: 10px 0 0 0; font-size: 14px;">Verifikasi Email Anda</p>
          </div>
          <div style="background: #f5f5f5; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Halo ${nama_lengkap},</h2>
            <p style="color: #666; line-height: 1.6;">Terima kasih telah mendaftar di Aplikasi Presensi. Silahkan klik tombol di bawah untuk memverifikasi email Anda:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verifikasi Email</a>
            </div>
            <p style="color: #999; font-size: 12px;">Atau copy link ini: <br><code style="background: #eee; padding: 5px 10px; border-radius: 3px;">${verificationLink}</code></p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">Link ini berlaku selama 24 jam.</p>
          </div>
        </div>
      `
    });
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// ============ API ROUTES ============

// Health check endpoint (untuk monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown'
  });
});

// Test endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API berjalan dengan baik',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown'
  });
});

// ============ REGISTER ============
app.post('/api/register', async (req, res) => {
  try {
    const { nama_lengkap, no_hp, email, password, konfirmasi_password } = req.body;

    // Validasi
    if (!nama_lengkap || !no_hp || !email || !password || !konfirmasi_password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Semua field harus diisi' 
      });
    }

    if (password !== konfirmasi_password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password dan konfirmasi password tidak cocok' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password minimal 6 karakter' 
      });
    }

    // Validasi email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Format email tidak valid' 
      });
    }

    // Cek email sudah terdaftar
    const checkEmail = await pool.query(
      'SELECT id FROM users WHERE email = $1', 
      [email]
    );

    if (checkEmail.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email sudah terdaftar' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = jwt.sign(
      { email }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    // Simpan ke database
    await pool.query(
      'INSERT INTO users (nama_lengkap, no_hp, email, password, verification_token, email_verified) VALUES ($1, $2, $3, $4, $5, $6)',
      [nama_lengkap, no_hp, email, hashedPassword, verificationToken, true] // email_verified = true
    );

    // Kirim email verifikasi
    const emailSent = await sendVerificationEmail(email, nama_lengkap, verificationToken);

    res.json({
      success: true,
      message: 'Registrasi berhasil! Silahkan login dengan nama lengkap dan password Anda',
      email: email
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server: ' + error.message 
    });
  }
});

// ============ VERIFY EMAIL ============
app.get('/api/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token tidak ditemukan' 
      });
    }

    // Decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    // Update email_verified
    await pool.query(
      'UPDATE users SET email_verified = true, verification_token = NULL WHERE email = $1',
      [email]
    );

    res.json({
      success: true,
      message: 'Email berhasil diverifikasi! Anda sekarang dapat login.'
    });

  } catch (error) {
    console.error(error);
    res.status(400).json({ 
      success: false, 
      message: 'Token tidak valid atau sudah kadaluarsa' 
    });
  }
});

// ============ LOGIN ============
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nama lengkap/Email dan password harus diisi' 
      });
    }

    // Cari user by email or nama_lengkap
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR nama_lengkap = $1', 
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Email tidak ditemukan' 
      });
    }

    const user = result.rows[0];

    // Cek password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Password salah' 
      });
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        nama_lengkap: user.nama_lengkap 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login berhasil',
      token: jwtToken,
      user: {
        id: user.id,
        nama_lengkap: user.nama_lengkap,
        email: user.email,
        no_hp: user.no_hp
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
});

// ============ GET CURRENT USER ============
app.get('/api/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nama_lengkap, email, no_hp FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User tidak ditemukan' 
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
});

// ============ CHECK-IN ============
app.post('/api/check-in', verifyToken, async (req, res) => {
  try {
    const { location } = req.body;
    const user_id = req.user.id;

    if (!location) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lokasi harus diisi' 
      });
    }

    // Cek sudah check-in hari ini
    const today = new Date().toISOString().split('T')[0];
    const existing = await pool.query(
      'SELECT id FROM attendance WHERE user_id = $1 AND DATE(check_in_time) = $2',
      [user_id, today]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sudah check-in hari ini' 
      });
    }

    // Insert check-in
    const result = await pool.query(
      'INSERT INTO attendance (user_id, check_in_time, location, status) VALUES ($1, NOW(), $2, $3) RETURNING id',
      [user_id, location, 'present']
    );

    res.json({ 
      success: true, 
      message: 'Check-in berhasil',
      data: {
        id: result.rows[0].id,
        check_in_time: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
});

// ============ CHECK-OUT ============
app.post('/api/check-out', verifyToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    // Cari check-in hari ini
    const today = new Date().toISOString().split('T')[0];
    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND DATE(check_in_time) = $2 AND check_out_time IS NULL',
      [user_id, today]
    );

    if (attendance.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Belum ada check-in hari ini' 
      });
    }

    // Update check-out
    await pool.query(
      'UPDATE attendance SET check_out_time = NOW(), status = $1 WHERE id = $2',
      ['present', attendance.rows[0].id]
    );

    res.json({ 
      success: true, 
      message: 'Check-out berhasil',
      data: {
        id: attendance.rows[0].id,
        check_out_time: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
});

// ============ GET TODAY'S ATTENDANCE ============
app.get('/api/attendance/today', verifyToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND DATE(check_in_time) = $2',
      [user_id, today]
    );

    if (result.rows.length === 0) {
      return res.json({ 
        success: true, 
        data: null 
      });
    }

    res.json({ 
      success: true, 
      data: result.rows[0] 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
});

// ============ GET ATTENDANCE HISTORY ============
app.get('/api/attendance/history', verifyToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 ORDER BY check_in_time DESC LIMIT 30',
      [user_id]
    );

    res.json({ 
      success: true, 
      data: result.rows 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
});

// ============ DELETE ATTENDANCE ============
app.delete('/api/attendance/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    // Verify ownership
    const result = await pool.query(
      'SELECT user_id FROM attendance WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Riwayat tidak ditemukan' 
      });
    }

    if (result.rows[0].user_id !== user_id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Anda tidak memiliki akses untuk menghapus riwayat ini' 
      });
    }

    // Delete attendance
    await pool.query(
      'DELETE FROM attendance WHERE id = $1',
      [id]
    );

    res.json({ 
      success: true, 
      message: 'Riwayat berhasil dihapus' 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
});

// ============ ERROR HANDLER ============
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Endpoint tidak ditemukan' 
  });
});

// ============ UPDATE PROFILE ============
app.put('/api/profile', verifyToken, async (req, res) => {
  try {
    const { email, no_hp } = req.body;
    const user_id = req.user.id;

    let updateQuery = 'UPDATE users SET ';
    let updateValues = [];
    let paramCount = 1;

    if (email) {
      updateQuery += `email = $${paramCount}, `;
      updateValues.push(email);
      paramCount++;
    }

    if (no_hp) {
      updateQuery += `no_hp = $${paramCount}, `;
      updateValues.push(no_hp);
      paramCount++;
    }

    // Remove trailing comma and space
    updateQuery = updateQuery.replace(/, $/, '');
    updateQuery += ` WHERE id = $${paramCount} RETURNING id, nama_lengkap, email, no_hp`;
    updateValues.push(user_id);

    const result = await pool.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User tidak ditemukan' 
      });
    }

    res.json({
      success: true,
      message: 'Profil berhasil diperbarui',
      user: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server: ' + error.message 
    });
  }
});

// ============ CHANGE PASSWORD ============
app.post('/api/change-password', verifyToken, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const user_id = req.user.id;

    if (!old_password || !new_password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password lama dan baru harus diisi' 
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password minimal 6 karakter' 
      });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT password FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User tidak ditemukan' 
      });
    }

    // Verify old password
    const isPasswordValid = await bcrypt.compare(old_password, userResult.rows[0].password);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Password lama tidak sesuai' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, user_id]
    );

    res.json({
      success: true,
      message: 'Password berhasil diubah'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});

module.exports = app;
