// routes/profile.js
const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Middleware bắt buộc đăng nhập
const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    req.flash("error_msg", "Vui lòng đăng nhập để xem trang cá nhân!");
    return res.redirect("/login");
  }
  next();
};

// Đảm bảo bảng users có cột avatar, cover (an toàn cho MySQL cũ)
const ensureMediaColumns = async () => {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  );
  const names = cols.map((c) => c.COLUMN_NAME);

  if (!names.includes("avatar")) {
    await db.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) NULL");
  }
  if (!names.includes("cover")) {
    await db.query("ALTER TABLE users ADD COLUMN cover VARCHAR(255) NULL");
  }
};

// Upload avatar/cover
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join("public", "uploads", "profile");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const name =
      file.fieldname +
      "-" +
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/.test(
      path.extname(file.originalname).toLowerCase()
    );
    if (ok) cb(null, true);
    else cb(new Error("Chỉ chấp nhận ảnh (jpg, png, gif, webp)"));
  },
}).fields([
  { name: "avatarFile", maxCount: 1 },
  { name: "coverFile", maxCount: 1 },
]);

// Trang cá nhân + danh sách món đã chia sẻ
router.get("/profile", requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;

    await ensureMediaColumns();

    const [[userRow]] = await db.query(
      "SELECT id, username, email, role, avatar, cover FROM users WHERE id = ?",
      [userId]
    );
    const userData = userRow || req.session.user;
    req.session.user = { ...req.session.user, ...userData };

    const [recipes] = await db.query(
      `SELECT id, title, image, created_at 
       FROM recipes 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.render("profile", {
      title: "Trang cá nhân - " + req.session.user.username,
      user: req.session.user,
      recipes,
    });
  } catch (err) {
    console.error("Lỗi tải trang cá nhân:", err);
    req.flash("error_msg", "Không thể tải trang cá nhân lúc này.");
    res.redirect("/");
  }
});

// Cập nhật avatar / ảnh bìa nhanh trên trang profile
router.post("/profile/media", requireLogin, (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      req.flash("error_msg", err.message || "Tải ảnh thất bại");
      return res.redirect("/profile");
    }
    try {
      const userId = req.session.user.id;

      await ensureMediaColumns();

      const avatarFile = req.files?.avatarFile?.[0];
      const coverFile = req.files?.coverFile?.[0];
      const newAvatar = avatarFile
        ? "/uploads/profile/" + avatarFile.filename
        : req.session.user.avatar || null;
      const newCover = coverFile
        ? "/uploads/profile/" + coverFile.filename
        : req.session.user.cover || null;

      await db.query("UPDATE users SET avatar = ?, cover = ? WHERE id = ?", [
        newAvatar,
        newCover,
        userId,
      ]);

      req.session.user = {
        ...req.session.user,
        avatar: newAvatar,
        cover: newCover,
      };

      req.flash("success_msg", "Cập nhật ảnh thành công!");
    } catch (error) {
      console.error("Lỗi cập nhật media:", error);
      req.flash(
        "error_msg",
        "Không thể cập nhật ảnh. Hãy đảm bảo bảng users có cột avatar và cover."
      );
    }
    res.redirect("/profile");
  });
});

// Trang chỉnh sửa thông tin
router.get("/profile/edit", requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    await ensureMediaColumns();
    const [[userRow]] = await db.query(
      "SELECT id, username, email, role, avatar, cover FROM users WHERE id = ?",
      [userId]
    );
    const userData = userRow || req.session.user;
    req.session.user = { ...req.session.user, ...userData };

    res.render("profile-edit", {
      title: "Thay đổi thông tin",
      user: req.session.user,
    });
  } catch (err) {
    console.error("Lỗi tải trang chỉnh sửa:", err);
    req.flash("error_msg", "Không thể tải trang chỉnh sửa thông tin.");
    res.redirect("/profile");
  }
});

// Lưu chỉnh sửa thông tin + ảnh
router.post("/profile/edit", requireLogin, (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      req.flash("error_msg", err.message || "Tải ảnh thất bại");
      return res.redirect("/profile/edit");
    }
    try {
      const userId = req.session.user.id;
      await ensureMediaColumns();

      const { email, new_password, confirm_password } = req.body;
      const emailTrim = email?.trim();
      const errors = [];

      if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
        errors.push("Email không hợp lệ");
      }
      if (new_password) {
        if (new_password.length < 6) {
          errors.push("Mật khẩu mới ít nhất 6 ký tự");
        }
        if (new_password !== confirm_password) {
          errors.push("Xác nhận mật khẩu không khớp");
        }
      }
      if (errors.length) {
        req.flash("error_msg", errors.join(", "));
        return res.redirect("/profile/edit");
      }

      const [[userRow]] = await db.query(
        "SELECT avatar, cover FROM users WHERE id = ?",
        [userId]
      );

      // Kiểm tra email trùng
      const [emailExists] = await db.query(
        "SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1",
        [emailTrim, userId]
      );
      if (emailExists.length > 0) {
        req.flash("error_msg", "Email đã được sử dụng bởi tài khoản khác");
        return res.redirect("/profile/edit");
      }

      const avatarFile = req.files?.avatarFile?.[0];
      const coverFile = req.files?.coverFile?.[0];
      const newAvatar = avatarFile
        ? "/uploads/profile/" + avatarFile.filename
        : userRow?.avatar || req.session.user.avatar || null;
      const newCover = coverFile
        ? "/uploads/profile/" + coverFile.filename
        : userRow?.cover || req.session.user.cover || null;

      const fields = ["email = ?", "avatar = ?", "cover = ?"];
      const params = [emailTrim, newAvatar, newCover];

      if (new_password) {
        const hashed = await bcrypt.hash(new_password, 12);
        fields.push("password = ?", "must_change = 0");
        params.push(hashed);
      }

      params.push(userId);

      await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);

      req.session.user = {
        ...req.session.user,
        email: emailTrim,
        avatar: newAvatar,
        cover: newCover,
        must_change: new_password ? 0 : req.session.user.must_change,
      };

      req.flash("success_msg", "Cập nhật thông tin thành công");
      res.redirect("/profile");
    } catch (error) {
      console.error("Lỗi lưu chỉnh sửa:", error);
      req.flash("error_msg", "Không thể lưu thay đổi. Thử lại sau.");
      res.redirect("/profile/edit");
    }
  });
});

module.exports = router;
