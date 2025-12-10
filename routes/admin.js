const express = require("express");
const router = express.Router();
const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

// Ensure recipes has status column for moderation
const ensureStatusColumn = async () => {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recipes'`
  );
  const names = cols.map((c) => c.COLUMN_NAME);
  if (!names.includes("status")) {
    await db.query(
      "ALTER TABLE recipes ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'"
    );
  }
};

// Middleware check admin
const requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    req.flash("error_msg", "Vui lòng đăng nhập để vào khu vực Admin!");
    return res.redirect("/login");
  }
  const role = (req.session.user.role || "").toLowerCase().trim();
  const envAdmin = (process.env.ADMIN_USER || "").toLowerCase().trim();
  const isAdmin =
    role === "admin" ||
    (envAdmin &&
      req.session.user.username &&
      req.session.user.username.toLowerCase().trim() === envAdmin);
  if (!isAdmin) {
    req.flash("error_msg", "Bạn không có quyền truy cập khu vực Admin!");
    return res.redirect("/");
  }
  next();
};

// Admin dashboard (giữ trống, dùng menu để điều hướng)
router.get("/dashboard", requireAdmin, async (req, res) => {
  try {
    res.render("admin/dashboard", { title: "Admin - Dashboard" });
  } catch (err) {
    console.error("Lỗi admin dashboard:", err);
    req.flash("error_msg", "Lỗi tải trang quản trị!");
    res.redirect("/");
  }
});

// Analytics page
router.get("/analytics", requireAdmin, async (req, res) => {
  try {
    const [userDates] = await db.query(
      `SELECT DATE(created_at) as day, COUNT(*) as count
       FROM users
       WHERE created_at IS NOT NULL
       GROUP BY DATE(created_at)
       ORDER BY day DESC
       LIMIT 14`
    );

    const [recipeDates] = await db.query(
      `SELECT DATE(created_at) as day, COUNT(*) as count
       FROM recipes
       WHERE created_at IS NOT NULL
       GROUP BY DATE(created_at)
       ORDER BY day DESC
       LIMIT 14`
    );

    const [recipeStatus] = await db.query(
      `SELECT status, COUNT(*) as count
       FROM recipes
       GROUP BY status`
    );

    res.render("admin/analytics", {
      title: "Biểu đồ",
      dataUsers: userDates.reverse(),
      dataRecipes: recipeDates.reverse(),
      dataStatus: recipeStatus,
    });
  } catch (err) {
    console.error("Lỗi tải trang biểu đồ:", err);
    req.flash("error_msg", "Không tải được dữ liệu biểu đồ.");
    res.redirect("/admin/dashboard");
  }
});

// Moderation page: list/search by status
router.get("/review", requireAdmin, async (req, res) => {
  try {
    await ensureStatusColumn();
    const status = req.query.status || "pending";
    const search = (req.query.search || "").trim();
    const params = [];

    let query = `
      SELECT r.id, r.title, r.description, r.status, r.created_at, u.username 
      FROM recipes r 
      LEFT JOIN users u ON r.user_id = u.id 
      WHERE 1=1`;

    if (status && status !== "all") {
      query += " AND r.status = ?";
      params.push(status);
    }
    if (search) {
      query += " AND (r.title LIKE ? OR r.description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    query += " ORDER BY r.created_at DESC LIMIT 100";

    const [recipes] = await db.query(query, params);

    res.render("admin/review", {
      title: "Kiểm duyệt bài đăng",
      recipes,
      filters: { status, search },
    });
  } catch (err) {
    console.error("Lỗi tải trang kiểm duyệt:", err);
    req.flash("error_msg", "Không thể tải trang kiểm duyệt.");
    res.redirect("/admin/dashboard");
  }
});

// Approve
router.post("/review/:id/approve", requireAdmin, async (req, res) => {
  try {
    await ensureStatusColumn();
    await db.query("UPDATE recipes SET status = 'approved' WHERE id = ?", [
      req.params.id,
    ]);
    req.flash("success_msg", "Đã phê duyệt bài viết.");
  } catch (err) {
    console.error("Lỗi phê duyệt:", err);
    req.flash("error_msg", "Không thể phê duyệt.");
  }
  res.redirect("/admin/review");
});

// Reject
router.post("/review/:id/reject", requireAdmin, async (req, res) => {
  try {
    await ensureStatusColumn();
    await db.query("UPDATE recipes SET status = 'rejected' WHERE id = ?", [
      req.params.id,
    ]);
    req.flash("success_msg", "Đã từ chối bài viết.");
  } catch (err) {
    console.error("Lỗi từ chối:", err);
    req.flash("error_msg", "Không thể từ chối.");
  }
  res.redirect("/admin/review");
});

// Delete violation
router.post("/review/:id/delete", requireAdmin, async (req, res) => {
  const recipeId = parseInt(req.params.id);
  if (isNaN(recipeId)) {
    req.flash("error_msg", "ID bài không hợp lệ!");
    return res.redirect("/admin/review");
  }
  try {
    const [[recipe]] = await db.query("SELECT image FROM recipes WHERE id = ?", [
      recipeId,
    ]);
    await db.query("DELETE FROM favorites WHERE recipe_id = ?", [recipeId]);
    await db.query("DELETE FROM recipes WHERE id = ?", [recipeId]);
    if (recipe && recipe.image) {
      const imagePath = path.join(__dirname, "../public", recipe.image);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
    req.flash("success_msg", "Đã xóa bài vi phạm.");
  } catch (err) {
    console.error("Lỗi xóa bài:", err);
    req.flash("error_msg", "Không thể xóa bài vi phạm.");
  }
  res.redirect("/admin/review");
});

// User management list
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT id, username, email, role, must_change, created_at
       FROM users
       ORDER BY id DESC
       LIMIT 200`
    );
    res.render("admin/users", {
      title: "Quản lý tài khoản",
      users,
    });
  } catch (err) {
    console.error("Lỗi tải danh sách user:", err);
    req.flash("error_msg", "Không tải được danh sách tài khoản.");
    res.redirect("/admin/dashboard");
  }
});

router.get("/users/add", requireAdmin, (req, res) => {
  res.render("admin/user-form", {
    title: "Thêm tài khoản",
    mode: "add",
    userData: {},
  });
});

router.post("/users/add", requireAdmin, async (req, res) => {
  const { username, email, password, role } = req.body;
  const errors = [];
  if (!username || username.trim().length < 3) errors.push("Tên đăng nhập tối thiểu 3 ký tự");
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) errors.push("Email không hợp lệ");
  if (!password || password.length < 6) errors.push("Mật khẩu tối thiểu 6 ký tự");
  if (errors.length) {
    req.flash("error_msg", errors.join(", "));
    return res.redirect("/admin/users/add");
  }
  try {
    const [dup] = await db.query(
      "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1",
      [username.trim(), email.trim()]
    );
    if (dup.length > 0) {
      req.flash("error_msg", "Tên đăng nhập hoặc email đã tồn tại");
      return res.redirect("/admin/users/add");
    }
    const hashed = await bcrypt.hash(password, 12);
    await db.query(
      "INSERT INTO users (username, email, password, role, must_change) VALUES (?, ?, ?, ?, 0)",
      [username.trim(), email.trim(), hashed, role || "user"]
    );
    req.flash("success_msg", "Đã thêm tài khoản mới.");
    res.redirect("/admin/users");
  } catch (err) {
    console.error("Lỗi thêm user:", err);
    req.flash("error_msg", "Không thể thêm tài khoản.");
    res.redirect("/admin/users/add");
  }
});

router.get("/users/:id/edit", requireAdmin, async (req, res) => {
  try {
    const [[user]] = await db.query(
      "SELECT id, username, email, role FROM users WHERE id = ?",
      [req.params.id]
    );
    if (!user) {
      req.flash("error_msg", "Không tìm thấy tài khoản.");
      return res.redirect("/admin/users");
    }
    res.render("admin/user-form", {
      title: "Chỉnh sửa tài khoản",
      mode: "edit",
      userData: user,
    });
  } catch (err) {
    console.error("Lỗi tải user:", err);
    req.flash("error_msg", "Không thể tải tài khoản.");
    res.redirect("/admin/users");
  }
});

router.post("/users/:id/edit", requireAdmin, async (req, res) => {
  const { username, email, password, role } = req.body;
  const userId = parseInt(req.params.id);
  const errors = [];
  if (!username || username.trim().length < 3) errors.push("Tên đăng nhập tối thiểu 3 ký tự");
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) errors.push("Email không hợp lệ");
  if (password && password.length < 6) errors.push("Mật khẩu mới tối thiểu 6 ký tự");
  if (errors.length) {
    req.flash("error_msg", errors.join(", "));
    return res.redirect(`/admin/users/${userId}/edit`);
  }

  try {
    const envAdmin = (process.env.ADMIN_USER || "").toLowerCase().trim();
    const [[existing]] = await db.query(
      "SELECT username FROM users WHERE id = ?",
      [userId]
    );
    if (!existing) {
      req.flash("error_msg", "Không tìm thấy tài khoản.");
      return res.redirect("/admin/users");
    }
    if (
      envAdmin &&
      existing.username &&
      existing.username.toLowerCase().trim() === envAdmin &&
      (role || "").toLowerCase().trim() !== "admin"
    ) {
      req.flash("error_msg", "Không thể hạ quyền tài khoản admin hệ thống.");
      return res.redirect(`/admin/users/${userId}/edit`);
    }

    const [dup] = await db.query(
      "SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ? LIMIT 1",
      [username.trim(), email.trim(), userId]
    );
    if (dup.length > 0) {
      req.flash("error_msg", "Tên đăng nhập hoặc email đã tồn tại");
      return res.redirect(`/admin/users/${userId}/edit`);
    }

    const fields = ["username = ?", "email = ?", "role = ?"];
    const params = [username.trim(), email.trim(), role || "user"];

    if (password) {
      const hashed = await bcrypt.hash(password, 12);
      fields.push("password = ?");
      params.push(hashed);
    }
    params.push(userId);

    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
    req.flash("success_msg", "Cập nhật tài khoản thành công.");
    res.redirect("/admin/users");
  } catch (err) {
    console.error("Lỗi cập nhật user:", err);
    req.flash("error_msg", "Không thể cập nhật tài khoản.");
    res.redirect(`/admin/users/${userId}/edit`);
  }
});

router.post("/users/:id/delete", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) {
    req.flash("error_msg", "ID người dùng không hợp lệ!");
    return res.redirect("/admin/users");
  }
  try {
    const envAdmin = (process.env.ADMIN_USER || "").toLowerCase().trim();
    const [[user]] = await db.query(
      "SELECT username FROM users WHERE id = ?",
      [userId]
    );
    if (!user) {
      req.flash("error_msg", "Không tìm thấy tài khoản.");
      return res.redirect("/admin/users");
    }
    if (
      envAdmin &&
      user.username &&
      user.username.toLowerCase().trim() === envAdmin
    ) {
      req.flash("error_msg", "Không thể xóa tài khoản admin hệ thống.");
      return res.redirect("/admin/users");
    }
    await db.query("DELETE FROM users WHERE id = ?", [userId]);
    req.flash("success_msg", "Đã xóa tài khoản.");
  } catch (err) {
    console.error("Lỗi xóa user:", err);
    req.flash("error_msg", "Không thể xóa tài khoản.");
  }
  res.redirect("/admin/users");
});

// Toggle user ban
router.post("/user/toggle/:id", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) {
    req.flash("error_msg", "ID người dùng không hợp lệ!");
    return res.redirect("/admin/dashboard");
  }
  try {
    const [[user]] = await db.query("SELECT role FROM users WHERE id = ?", [
      userId,
    ]);
    if (!user) {
      req.flash("error_msg", "Không tìm thấy người dùng!");
    } else {
      const newRole = user.role === "banned" ? "user" : "banned";
      await db.query("UPDATE users SET role = ? WHERE id = ?", [
        newRole,
        userId,
      ]);
      req.flash(
        "success_msg",
        `${newRole === "banned" ? "Đã khóa" : "Đã mở khóa"} tài khoản thành công!`
      );
    }
  } catch (err) {
    console.error("Lỗi thay đổi trạng thái user:", err);
    req.flash("error_msg", "Lỗi hệ thống!");
  }
  res.redirect("/admin/dashboard");
});

module.exports = router;
