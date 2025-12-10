// routes/admin.js – PHIÊN BẢN HOÀN CHỈNH 2025
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

// ==================== MIDDLEWARE KIỂM TRA ADMIN ====================
const requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    req.flash("error_msg", "Vui lòng đăng nhập để truy cập khu vực Admin!");
    return res.redirect("/login");
  }
  if (req.session.user.role !== "admin") {
    req.flash("error_msg", "Bạn không có quyền truy cập khu vực Admin!");
    return res.redirect("/");
  }
  next();
};

// ==================== DASHBOARD ADMIN + PHÂN TRANG ====================
router.get("/dashboard", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    // Lấy danh sách công thức mới nhất (có phân trang)
    const [recipes] = await db.query(
      `SELECT r.*, u.username 
       FROM recipes r 
       LEFT JOIN users u ON r.user_id = u.id 
       ORDER BY r.id DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Tổng số công thức để tính trang
    const [[{ totalRecipes }]] = await db.query(
      "SELECT COUNT(*) as totalRecipes FROM recipes"
    );
    const totalPages = Math.ceil(totalRecipes / limit);

    // Danh sách người dùng (có phân trang nếu cần)
    const [users] = await db.query(
      `SELECT id, username, email, role, created_at 
       FROM users 
       ORDER BY id DESC 
       LIMIT 50`
    );

    // Thống kê tổng quan
    const [[stats]] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM recipes) AS total_recipes,
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM favorites) AS total_favorites,
        (SELECT COUNT(*) FROM recipes WHERE DATE(created_at) = CURDATE()) AS today_recipes
    `);

    res.render("admin/dashboard", {
      title: "Admin - Quản trị Recipe App",
      recipes,
      users,
      stats,
      pagination: {
        currentPage: page,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        prevPage: page - 1,
        nextPage: page + 1,
      },
    });
  } catch (err) {
    console.error("Lỗi admin dashboard:", err);
    req.flash("error_msg", "Lỗi tải trang quản trị!");
    res.redirect("/");
  }
});

// ==================== XÓA CÔNG THỨC (AN TOÀN + XÓA ẢNH) ====================
router.post("/recipe/delete/:id", requireAdmin, async (req, res) => {
  const recipeId = parseInt(req.params.id);

  if (isNaN(recipeId)) {
    req.flash("error_msg", "ID công thức không hợp lệ!");
    return res.redirect("/admin/dashboard");
  }

  try {
    // Lấy thông tin ảnh trước khi xóa (để xóa file thật)
    const [[recipe]] = await db.query(
      "SELECT image FROM recipes WHERE id = ?",
      [recipeId]
    );

    // Xóa các lượt yêu thích liên quan (nếu chưa có ON DELETE CASCADE)
    await db.query("DELETE FROM favorites WHERE recipe_id = ?", [recipeId]);

    // Xóa công thức
    const [result] = await db.query("DELETE FROM recipes WHERE id = ?", [
      recipeId,
    ]);

    if (result.affectedRows === 0) {
      req.flash("error_msg", "Không tìm thấy công thức để xóa!");
    } else {
      // Xóa file ảnh nếu tồn tại
      if (recipe && recipe.image) {
        const imagePath = path.join(__dirname, "../public", recipe.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log(`Đã xóa ảnh: ${recipe.image}`);
        }
      }
      req.flash("success_msg", `Đã xóa công thức ID ${recipeId} thành công!`);
    }
  } catch (err) {
    console.error("Lỗi xóa công thức:", err);
    req.flash("error_msg", "Lỗi khi xóa công thức! Vui lòng thử lại.");
  }

  res.redirect("/admin/dashboard");
});

// ==================== (TÙY CHỌN) KHÓA / MỞ KHÓA NGƯỜI DÙNG ====================
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
        `Đã ${newRole === "banned" ? "khóa" : "mở khóa"} tài khoản thành công!`
      );
    }
  } catch (err) {
    console.error("Lỗi thay đổi trạng thái user:", err);
    req.flash("error_msg", "Lỗi hệ thống!");
  }
  res.redirect("/admin/dashboard");
});

module.exports = router;
