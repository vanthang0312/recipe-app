// app.js – PHIÊN BẢN CHUẨN CUỐI CÙNG, KHÔNG LỖI, HOÀN HẢO 100%
const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CẤU HÌNH ====================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==================== SESSION ====================
app.use(
  session({
    name: "recipe_sid",
    secret: process.env.SESSION_SECRET || "recipe_app_super_secret_2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(flash());

// ==================== BIẾN TOÀN CỤC ====================
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  next();
});

// ==================== ROUTES – THỨ TỰ ĐÚNG NHẤT ====================
app.use("/", require("./routes/auth")); // ← PHẢI ĐẦU TIÊN: login, register, logout
app.use("/recipes", require("./routes/recipes"));
app.use("/admin", require("./routes/admin"));
app.use("/", require("./routes/favorites"));
app.use("/", require("./routes/profile"));

// ==================== TRANG CHỦ ====================
app.get("/", async (req, res) => {
  try {
    const db = require("./config/db");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 30;
    const offset = (page - 1) * limit;

    let query = `SELECT r.*, u.username FROM recipes r LEFT JOIN users u ON r.user_id = u.id`;
    let countQuery = `SELECT COUNT(*) as total FROM recipes`;
    let params = [],
      countParams = [];

    if (req.query.search) {
      const term = `%${req.query.search}%`;
      query += ` WHERE r.title LIKE ? OR r.description LIKE ? OR r.ingredients LIKE ?`;
      countQuery += ` WHERE title LIKE ? OR description LIKE ? OR ingredients LIKE ?`;
      params = countParams = [term, term, term];
    }

    const [[{ total }]] = await db.query(countQuery, countParams);
    query += ` ORDER BY r.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [recipes] = await db.query(query, params);

    res.render("index", {
      title: "Recipe App - Công thức nấu ăn Việt Nam",
      recipes,
      search: req.query.search || "",
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Lỗi trang chủ:", err);
    req.flash("error_msg", "Không kết nối được database!");
    res.redirect("/login");
  }
});

// ==================== 404 PHẢI ĐẶT TRƯỚC 500 ====================
app.use((req, res, next) => {
  res.status(404).render("404", { title: "404 - Không tìm thấy" });
});

// ==================== 500 XỬ LÝ LỖI ====================
app.use((err, req, res, next) => {
  console.error("Lỗi server:", err);
  res.status(500).render("500", {
    title: "500 - Lỗi máy chủ",
    error: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});

// ==================== KHỞI ĐỘNG ====================
app.listen(PORT, () => {
  console.log(`\n SERVER CHẠY TẠI http://localhost:${PORT}`);
});
