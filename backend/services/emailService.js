const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ── Create reusable transporter ───────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// ── Base send function ────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'MedCare HMS'}" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    text,
    html
  });

  logger.info(`Email sent to ${to}: ${info.messageId}`);
  return info;
};

// ── Password Reset Email ──────────────────────────────────────
const sendPasswordResetEmail = async (user, resetToken) => {
  const resetURL = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
  const expiryMins = process.env.RESET_TOKEN_EXPIRE || 10;

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #0a6e5e; font-size: 28px; margin: 0;">MedCare <span style="color: #0d9b86;">HMS</span></h1>
        </div>

        <h2 style="color: #0f2027; font-size: 20px;">Password Reset Request</h2>
        <p style="color: #4a5568; line-height: 1.6;">Hello <strong>${user.name}</strong>,</p>
        <p style="color: #4a5568; line-height: 1.6;">
          We received a request to reset your password for your MedCare HMS account.
          Click the button below to set a new password.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetURL}"
             style="display: inline-block; background: #0a6e5e; color: white;
                    padding: 14px 32px; border-radius: 8px; text-decoration: none;
                    font-weight: bold; font-size: 16px;">
            Reset My Password
          </a>
        </div>

        <p style="color: #718096; font-size: 13px;">
          This link expires in <strong>${expiryMins} minutes</strong>.
          If you did not request a password reset, please ignore this email —
          your password will remain unchanged.
        </p>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 16px;">
          <p style="color: #a0aec0; font-size: 12px; margin: 0;">
            For security, this link can only be used once.<br>
            If the button doesn't work, copy this URL into your browser:<br>
            <span style="color: #0a6e5e; word-break: break-all;">${resetURL}</span>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: 'MedCare HMS — Password Reset',
    html,
    text: `Reset your password: ${resetURL} (expires in ${expiryMins} minutes)`
  });
};

// ── 2FA Setup Email ───────────────────────────────────────────
const sendTwoFactorSetupEmail = async (user) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: white; border-radius: 12px; padding: 40px;">
        <h1 style="color: #0a6e5e; text-align: center;">MedCare <span style="color: #0d9b86;">HMS</span></h1>
        <h2 style="color: #0f2027;">Two-Factor Authentication Enabled</h2>
        <p style="color: #4a5568; line-height: 1.6;">
          Hello <strong>${user.name}</strong>,<br><br>
          Two-factor authentication has been successfully enabled on your account.
          You will now need your authenticator app each time you log in.
        </p>
        <div style="background: #e6f4f2; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="color: #054d42; font-size: 13px; margin: 0;">
            <strong>Important:</strong> Keep your backup codes in a safe place.
            They are the only way to access your account if you lose your authenticator device.
          </p>
        </div>
        <p style="color: #718096; font-size: 13px;">
          If you did not enable 2FA, contact your administrator immediately.
        </p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: 'MedCare HMS — Two-Factor Authentication Enabled',
    html,
    text: 'Two-factor authentication has been enabled on your MedCare HMS account.'
  });
};

// ── Login Alert Email (new device/IP) ─────────────────────────
const sendLoginAlertEmail = async (user, ip, userAgent) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: white; border-radius: 12px; padding: 40px;">
        <h1 style="color: #0a6e5e; text-align: center;">MedCare <span style="color: #0d9b86;">HMS</span></h1>
        <h2 style="color: #0f2027;">New Login Detected</h2>
        <p style="color: #4a5568;">Hello <strong>${user.name}</strong>, a new login was detected on your account.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="background: #f7fafc;">
            <td style="padding: 10px; font-weight: bold; color: #4a5568; border-bottom: 1px solid #e2e8f0;">Time</td>
            <td style="padding: 10px; color: #0f2027; border-bottom: 1px solid #e2e8f0;">${new Date().toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; color: #4a5568; border-bottom: 1px solid #e2e8f0;">IP Address</td>
            <td style="padding: 10px; color: #0f2027; border-bottom: 1px solid #e2e8f0;">${ip || 'Unknown'}</td>
          </tr>
          <tr style="background: #f7fafc;">
            <td style="padding: 10px; font-weight: bold; color: #4a5568;">Device</td>
            <td style="padding: 10px; color: #0f2027;">${userAgent ? userAgent.substring(0, 80) : 'Unknown'}</td>
          </tr>
        </table>
        <p style="color: #718096; font-size: 13px;">
          If this was not you, change your password immediately and contact your administrator.
        </p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: 'MedCare HMS — New Login Detected',
    html,
    text: `New login on your account from IP: ${ip}`
  });
};

module.exports = { sendEmail, sendPasswordResetEmail, sendTwoFactorSetupEmail, sendLoginAlertEmail };
