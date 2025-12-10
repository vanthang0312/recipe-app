// routes/favorites.js – PHIÊN BẢN CHẠY NGON 100% (chỉ sửa 1 dòng)
const express = require("express");
const router = express.Router();
const db = require("../config/db");

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    req.flash("error_msg", "Vui lòng đăng nhập để xem món yêu thích!");
    return res.redirect("/login"); // ← ĐÃ CÓ return
  }
  next();
};

router.get("/favorites", requireLogin, async (req, res) => {
  try {
    const [favorites] = await db.query(
      `
      SELECT r.*, u.username 
      FROM favorites f
      JOIN recipes r ON f.recipe_id = r.id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `,
      [req.session.user.id]
    );

    res.render("favorites", {
      title: "Món yêu thích ♥ " + req.session.user.username,
      favorites,
    });
  } catch (err) {
    console.error("Lỗi tải favorites:", err);
    req.flash("error_msg", "Không thể tải danh sách yêu thích");
    return res.redirect("/"); // ← THÊM DÒNG return NÀY LÀ XONG!
  }
});

module.exports = router;
