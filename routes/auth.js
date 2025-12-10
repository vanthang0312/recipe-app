// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../config/db");
const nodemailer = require("nodemailer");
const { body, validationResult } = require("express-validator");

// Ensure must_change column exists for forced password change
const ensureResetColumn = async () => {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  );
  const names = cols.map((c) => c.COLUMN_NAME);
  if (!names.includes("must_change")) {
    await db.query(
      "ALTER TABLE users ADD COLUMN must_change TINYINT(1) NOT NULL DEFAULT 0"
    );
  }
};

// Mail transporter (SMTP via env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ========== LOGIN ==========
router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", { title: "Đăng nhập", old: {} });
});

router.post(
  "/login",
  [
    body("username")
      .trim()
      .notEmpty()
      .withMessage("Vui lòng nhập tên đăng nhập hoặc email"),
    body("password").notEmpty().withMessage("Vui lòng nhập mật khẩu"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash(
        "error_msg",
        errors
          .array()
          .map((e) => e.msg)
          .join(", ")
      );
      return res.render("login", { title: "Đăng nhập", old: req.body });
    }

    const { username, password } = req.body;

    try {
      await ensureResetColumn();

      const [users] = await db.query(
        "SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1",
        [username, username]
      );

      if (users.length === 0) {
        req.flash("error_msg", "Tài khoản không tồn tại");
        return res.render("login", { title: "Đăng nhập", old: req.body });
      }

      const user = users[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        req.flash("error_msg", "Mật khẩu không chính xác");
        return res.render("login", { title: "Đăng nhập", old: req.body });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
        must_change: user.must_change || 0,
      };

      req.session.save((err) => {
        if (err) {
          console.error("Lỗi lưu session:", err);
          req.flash("error_msg", "Lỗi hệ thống, vui lòng thử lại!");
          return res.redirect("/login");
        }
        if (user.must_change) {
          req.flash(
            "error_msg",
            "Đây là mật khẩu tạm. Vui lòng đổi mật khẩu ngay để bảo mật tài khoản."
          );
          return res.redirect("/profile/edit");
        }
        req.flash("success_msg", `Chào mừng trở lại, ${user.username}!`);
        res.redirect("/");
      });
    } catch (err) {
      console.error("Lỗi đăng nhập:", err);
      req.flash("error_msg", "Lỗi server, vui lòng thử lại sau");
      res.render("login", { title: "Đăng nhập", old: req.body });
    }
  }
);

// ========== REGISTER ==========
router.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("register", { title: "Đăng ký tài khoản", old: {} });
});

router.post(
  "/register",
  [
    body("username")
      .trim()
      .isLength({ min: 3, max: 20 })
      .withMessage("Tên đăng nhập từ 3-20 ký tự")
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage("Chỉ dùng chữ, số và dấu gạch dưới"),
    body("email").isEmail().normalizeEmail().withMessage("Email không hợp lệ"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Mật khẩu ít nhất 6 ký tự"),
    body("confirm_password")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Mật khẩu xác nhận không khớp"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash(
        "error_msg",
        errors
          .array()
          .map((e) => e.msg)
          .join(", ")
      );
      return res.render("register", { title: "Đăng ký", old: req.body });
    }

    const { username, email, password } = req.body;

    try {
      const [existing] = await db.query(
        "SELECT id FROM users WHERE username = ? OR email = ?",
        [username, email]
      );

      if (existing.length > 0) {
        req.flash("error_msg", "Tên đăng nhập hoặc email đã được sử dụng");
        return res.render("register", { title: "Đăng ký", old: req.body });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      await db.query(
        "INSERT INTO users (username, email, password, role, must_change) VALUES (?, ?, ?, 'user', 0)",
        [username, email, hashedPassword]
      );

      req.flash("success_msg", "Đăng ký thành công! Bạn có thể đăng nhập ngay");
      res.redirect("/login");
    } catch (err) {
      console.error("Lỗi đăng ký:", err);
      req.flash("error_msg", "Lỗi hệ thống, vui lòng thử lại");
      res.render("register", { title: "Đăng ký", old: req.body });
    }
  }
);

// ========== FORGOT PASSWORD ==========
router.get("/forgot", (req, res) => {
  res.render("forgot-password", { title: "Quên mật khẩu" });
});

router.post(
  "/forgot",
  [body("username").trim().notEmpty().withMessage("Vui lòng nhập tên đăng nhập")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash(
        "error_msg",
        errors
          .array()
          .map((e) => e.msg)
          .join(", ")
      );
      return res.redirect("/forgot");
    }

    const { username } = req.body;
    try {
      await ensureResetColumn();

      const [users] = await db.query(
        "SELECT id, email, username FROM users WHERE username = ? LIMIT 1",
        [username]
      );
      if (users.length === 0) {
        req.flash("error_msg", "Không tìm thấy tài khoản");
        return res.redirect("/forgot");
      }
      const user = users[0];
      if (!user.email) {
        req.flash(
          "error_msg",
          "Tài khoản chưa có email, không thể gửi mật khẩu tạm."
        );
        return res.redirect("/forgot");
      }

      const tempPass = Math.random().toString(36).slice(-8);
      const hashed = await bcrypt.hash(tempPass, 12);

      await db.query(
        "UPDATE users SET password = ?, must_change = 1 WHERE id = ?",
        [hashed, user.id]
      );

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: user.email,
        subject: "Mật khẩu tạm - Recipe App",
        text: `Xin chào ${user.username},\n\nMật khẩu tạm của bạn: ${tempPass}\nVui lòng đăng nhập và đổi mật khẩu ngay để bảo mật tài khoản.\n\nRecipe App`,
      });

      // Đăng nhập tạm và buộc đổi mật khẩu ngay
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
        must_change: 1,
      };
      req.flash(
        "success_msg",
        "Đã gửi mật khẩu tạm vào email. Vui lòng đổi mật khẩu ngay để bảo mật."
      );
      res.redirect("/profile/edit");
    } catch (err) {
      console.error("Lỗi quên mật khẩu:", err);
      req.flash("error_msg", "Không thể gửi mật khẩu tạm. Thử lại sau.");
      res.redirect("/forgot");
    }
  }
);

// ========== LOGOUT ==========
router.get("/logout", (req, res) => {
  req.flash("success_msg", "Đăng xuất thành công! Hẹn gặp lại bạn!");
  req.session.destroy((err) => {
    if (err) console.error("Lỗi destroy session:", err);
    res.clearCookie("recipe_sid");
    res.redirect("/");
  });
});

module.exports = router;
