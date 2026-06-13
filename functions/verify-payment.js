const { Client } = require('pg');
const nodemailer = require('nodemailer');

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let billcode, orderId;
  try {
    const body = JSON.parse(event.body);
    billcode = body.billcode;
    orderId  = body.orderId;
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid request' }) };
  }

  if (!billcode || !orderId) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing billcode or orderId' }) };
  }

  // Parse name and email from orderId (set as "name||email" in create-bill)
  if (!orderId.includes('||')) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid order reference' }) };
  }

  const [name, email] = orderId.split('||');
  if (!name || !email) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing buyer info' }) };
  }

  // Verify payment with ToyyibPay API
  try {
    const verifyParams = new URLSearchParams({
      userSecretKey: process.env.TOYYIBPAY_SECRET_KEY,
      billCode: billcode,
    });

    const verifyRes = await fetch('https://toyyibpay.com/index.php/api/getBillTransactions', {
      method: 'POST',
      body: verifyParams,
    });

    const transactions = await verifyRes.json();
    console.log('ToyyibPay transactions:', JSON.stringify(transactions));

    // Check if any transaction has billpaymentStatus "1" (paid)
    const paid = Array.isArray(transactions) && transactions.some(t => t.billpaymentStatus === '1');

    if (!paid) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, error: 'Pembayaran belum disahkan oleh ToyyibPay.' }),
      };
    }
  } catch (err) {
    console.error('ToyyibPay verify error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Gagal mengesahkan pembayaran.' }),
    };
  }

  // Payment confirmed — create buyer account
  const password = generatePassword();
  const client = new Client({ connectionString: process.env.NETLIFY_DATABASE_URL_UNPOOLED });

  try {
    await client.connect();

    // Check if buyer already exists (e.g. page refresh)
    const existing = await client.query('SELECT id FROM buyers WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      // Already created — just show success (don't send email again)
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Insert new buyer
    await client.query(
      'INSERT INTO buyers (name, email, password, active) VALUES ($1, $2, $3, $4)',
      [name.trim(), email.toLowerCase().trim(), password, true]
    );

    // Send welcome email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"Hati Sedar" <${process.env.GMAIL_USER}>`,
      to: email.trim(),
      subject: '✅ Akses Hati Sedar Anda Telah Diaktifkan',
      html: buildEmailHtml(name.trim(), email.toLowerCase().trim(), password),
    });

    console.log('Account created and email sent to:', email);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, debug: 'Account created and email sent to ' + email }) };

  } catch (err) {
    console.error('DB/email error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  } finally {
    await client.end();
  }
};

function buildEmailHtml(name, email, password) {
  return `
<div style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <div style="background:#2C2416;border-radius:24px 24px 0 0;padding:32px 28px 24px;text-align:center;">
    <div style="font-size:11px;letter-spacing:3px;color:#C4975A;margin-bottom:6px;">HATI SEDAR</div>
    <div style="font-size:22px;color:#F5F0E8;font-weight:300;letter-spacing:1px;">Muhasabah Journal</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:6px;letter-spacing:1px;">Jurnal Digital Harian Anda</div>
  </div>
  <div style="background:#FDFAF4;border:0.5px solid rgba(196,151,90,0.2);border-top:none;border-radius:0 0 24px 24px;padding:28px;">
    <p style="color:#2C2416;font-size:15px;margin:0 0 6px;font-weight:500;">Assalamualaikum warahmatullahi wabarakatuh, ${name},</p>
    <p style="color:#5C4F3A;font-size:14px;margin:0 0 22px;line-height:1.8;">Terima kasih kerana mempercayai <strong style="color:#2C2416;">Hati Sedar</strong>. Muhasabah Journal anda telah berjaya diaktifkan.</p>

    <div style="background:#F7F4EF;border-left:3px solid #C4975A;padding:20px 22px;margin-bottom:22px;">
      <div style="font-size:10px;letter-spacing:2px;color:#9A7040;margin-bottom:16px;font-weight:500;">MAKLUMAT AKSES ANDA</div>
      <div style="margin-bottom:14px;">
        <div style="font-size:10px;color:#9A7040;margin-bottom:3px;letter-spacing:1px;">LINK JURNAL</div>
        <a href="https://mymuhasabahjournal.netlify.app/journal.html" style="font-size:13px;color:#C4975A;font-family:monospace;">mymuhasabahjournal.netlify.app/journal.html</a>
      </div>
      <div style="height:0.5px;background:rgba(196,151,90,0.2);margin:12px 0;"></div>
      <div style="margin-bottom:14px;">
        <div style="font-size:10px;color:#9A7040;margin-bottom:3px;letter-spacing:1px;">EMEL AKSES</div>
        <div style="font-size:14px;font-weight:500;color:#2C2416;font-family:monospace;">${email}</div>
      </div>
      <div style="height:0.5px;background:rgba(196,151,90,0.2);margin:12px 0;"></div>
      <div>
        <div style="font-size:10px;color:#9A7040;margin-bottom:3px;letter-spacing:1px;">PASSWORD SEMENTARA</div>
        <div style="font-size:22px;font-weight:500;color:#2C2416;font-family:monospace;letter-spacing:3px;">${password}</div>
        <div style="font-size:11px;color:#9A7040;margin-top:3px;">Gunakan emel dan password ini untuk log masuk pertama kali</div>
      </div>
    </div>

    <div style="background:#FDFAF4;border:1px solid #E8C98A;border-radius:12px;padding:16px 18px;margin-bottom:22px;">
      <div style="font-size:10px;letter-spacing:2px;color:#9A7040;margin-bottom:10px;font-weight:500;">🔑 CARA TUKAR PASSWORD</div>
      <ol style="font-size:12px;color:#5C4F3A;line-height:1.6;margin:0;padding-left:18px;">
        <li>Log masuk menggunakan emel dan password sementara anda.</li>
        <li>Klik butang <strong>"🔑 Tukar Password"</strong> di bahagian bawah halaman.</li>
        <li>Masukkan password sementara di ruangan <strong>"Password Lama"</strong>.</li>
        <li>Masukkan password baru dan klik <strong>"Simpan Password Baru"</strong>.</li>
      </ol>
    </div>

    <div style="background:#F7F4EF;border-radius:24px;padding:16px 18px;margin-bottom:22px;">
      <p style="font-size:13px;font-style:italic;color:#5C4F3A;margin:0 0 6px;line-height:1.8;">"Hisablah dirimu sebelum kamu dihisab, dan timbanglah amalanmu sebelum ditimbang."</p>
      <p style="font-size:11px;color:#9A7040;margin:0;letter-spacing:1px;">— Umar ibn Al-Khattab r.a.</p>
    </div>

    <div style="height:0.5px;background:rgba(196,151,90,0.2);margin-bottom:16px;"></div>
    <p style="font-size:13px;color:#5C4F3A;margin:0 0 4px;">Sebarang pertanyaan, hubungi kami:</p>
    <p style="font-size:13px;color:#2C2416;margin:0 0 18px;">TikTok / Instagram: <strong>@hatisedar</strong></p>
    <p style="font-size:14px;color:#C4975A;margin:12px 0 0;font-weight:500;">— Hati Sedar</p>
  </div>
  <div style="text-align:center;padding:16px 0 4px;">
    <p style="font-size:11px;color:#9B8E7A;margin:0;letter-spacing:1px;">@hatisedar &nbsp;·&nbsp; linktr.ee/hatisedar</p>
  </div>
</div>`;
}
