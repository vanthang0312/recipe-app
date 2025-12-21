const express = require("express");
const router = express.Router();
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { body, validationResult } = require("express-validator");

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "public/uploads";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName =
      "recipe-" +
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error("Chỉ chấp nhận ảnh (jpg, png, gif, webp)"));
  },
}).single("recipeImage");

// Middleware require login
const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    req.flash(
      "error_msg",
      "Vui lòng đăng nhập để thực hiện hành động này!"
    );
    return res.redirect("/login");
  }
  next();
};

// Add recipe form
router.get("/add", requireLogin, (req, res) => {
  res.render("add-recipe", { title: "Thêm công thức mới" });
});

// Add recipe submit
router.post(
  "/add",
  requireLogin,
  upload,
  [
    body("title").trim().notEmpty().withMessage("Tiêu đề không được trống"),
    body("ingredients")
      .trim()
      .notEmpty()
      .withMessage("Nguyên liệu bắt buộc"),
    body("instructions")
      .trim()
      .notEmpty()
      .withMessage("Hướng dẫn bắt buộc"),
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
      return res.redirect("/recipes/add");
    }

    if (!req.file) {
      req.flash("error_msg", "Vui lòng chọn ảnh món ăn!");
      return res.redirect("/recipes/add");
    }

    const { title, description, ingredients, instructions, video } = req.body;
    const imagePath = "/uploads/" + req.file.filename;

    try {
      await db.query(
        `INSERT INTO recipes 
         (title, description, image, video, ingredients, instructions, user_id, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          title.trim(),
          description?.trim() || null,
          imagePath,
          video?.trim() || null,
          ingredients.trim(),
          instructions.trim(),
          req.session.user.id,
        ]
      );
      req.flash(
        "success_msg",
        "Đăng món thành công! Món đang chờ admin duyệt."
      );
      res.redirect("/");
    } catch (err) {
      console.error("Lỗi thêm món:", err);
      req.flash("error_msg", "Lỗi server, vui lòng thử lại!");
      res.redirect("/recipes/add");
    }
  }
);

// Edit recipe form
router.get("/:id/edit", requireLogin, async (req, res) => {
  try {
    const [recipes] = await db.query(
      "SELECT * FROM recipes WHERE id = ? AND user_id = ?",
      [req.params.id, req.session.user.id]
    );
    if (recipes.length === 0) {
      req.flash(
        "error_msg",
        "Không tìm thấy món hoặc bạn không phải chủ sở hữu!"
      );
      return res.redirect("/");
    }
    res.render("edit-recipe", {
      title: "Sửa công thức - " + recipes[0].title,
      recipe: recipes[0],
    });
  } catch (err) {
    req.flash("error_msg", "Lỗi tải trang sửa!");
    res.redirect("/");
  }
});

// Edit recipe submit
router.post(
  "/:id/edit",
  requireLogin,
  upload,
  [
    body("title").trim().notEmpty(),
    body("ingredients").trim().notEmpty(),
    body("instructions").trim().notEmpty(),
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
      return res.redirect(`/recipes/${req.params.id}/edit`);
    }

    const { title, description, ingredients, instructions, oldImage, video } =
      req.body;
    let imagePath = oldImage;

    if (req.file) {
      imagePath = "/uploads/" + req.file.filename;
      if (oldImage) {
        const oldPath = path.join(__dirname, "../public", oldImage);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    try {
      await db.query(
        `UPDATE recipes 
         SET title = ?, description = ?, image = ?, video = ?, ingredients = ?, instructions = ? 
         WHERE id = ? AND user_id = ?`,
        [
          title.trim(),
          description?.trim() || null,
          imagePath,
          video?.trim() || null,
          ingredients.trim(),
          instructions.trim(),
          req.params.id,
          req.session.user.id,
        ]
      );
      req.flash("success_msg", "Sửa món thành công!");
      res.redirect(`/recipes/${req.params.id}`);
    } catch (err) {
      console.error("Lỗi sửa món:", err);
      req.flash("error_msg", "Lỗi sửa món!");
      res.redirect(`/recipes/${req.params.id}/edit`);
    }
  }
);

// Delete recipe
router.post("/:id/delete", requireLogin, async (req, res) => {
  try {
    const [recipes] = await db.query(
      "SELECT image FROM recipes WHERE id = ? AND user_id = ?",
      [req.params.id, req.session.user.id]
    );

    if (recipes.length === 0) {
      req.flash(
        "error_msg",
        "Không tìm thấy món hoặc bạn không có quyền xóa!"
      );
      return res.redirect("/");
    }

    const image = recipes[0].image;
    if (image) {
      const imagePath = path.join(__dirname, "../public", image);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    await db.query("DELETE FROM favorites WHERE recipe_id = ?", [req.params.id]);
    await db.query("DELETE FROM ratings WHERE recipe_id = ?", [req.params.id]);
    await db.query("DELETE FROM comments WHERE recipe_id = ?", [req.params.id]);
    await db.query("DELETE FROM recipes WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.session.user.id,
    ]);

    req.flash("success_msg", "Đã xóa món thành công!");
    res.redirect("/");
  } catch (err) {
    console.error("Lỗi xóa món:", err);
    req.flash("error_msg", "Lỗi xóa món!");
    res.redirect("/");
  }
});

// View recipe detail
router.get("/:id", async (req, res) => {
  try {
    const [recipes] = await db.query(
      `SELECT r.*, u.username 
       FROM recipes r 
       LEFT JOIN users u ON r.user_id = u.id 
       WHERE r.id = ?`,
      [req.params.id]
    );

    if (recipes.length === 0) {
      req.flash("error_msg", "Không tìm thấy công thức!");
      return res.redirect("/");
    }

    const recipe = recipes[0];
    const user = req.session.user;
    const isOwner = user && recipe.user_id === user.id;
    const isAdmin =
      user &&
      ((user.role || "").toLowerCase() === "admin" ||
        ((process.env.ADMIN_USER || "").toLowerCase().trim() ===
          (user.username || "").toLowerCase().trim()));
    if (recipe.status && recipe.status !== "approved" && !isOwner && !isAdmin) {
      req.flash("error_msg", "Bài này đang chờ duyệt.");
      return res.redirect("/");
    }

    let isFavorited = false;
    if (req.session.user) {
      const [fav] = await db.query(
        "SELECT 1 FROM favorites WHERE user_id = ? AND recipe_id = ?",
        [req.session.user.id, req.params.id]
      );
      isFavorited = fav.length > 0;
    }

    res.render("recipe-detail", {
      title: recipe.title,
      recipe,
      isFavorited,
      isOwner,
      isAdmin,
    });
  } catch (err) {
    console.error("Lỗi xem chi tiết:", err);
    req.flash("error_msg", "Lỗi tải công thức!");
    res.redirect("/");
  }
});

// Favorite / unfavorite
router.post("/:id/favorite", requireLogin, async (req, res) => {
  try {
    await db.query(
      "INSERT IGNORE INTO favorites (user_id, recipe_id) VALUES (?, ?)",
      [req.session.user.id, req.params.id]
    );
    req.flash("success_msg", "Đã thêm vào món yêu thích");
  } catch (err) {
    req.flash("error_msg", "Lỗi thêm yêu thích");
  }
  res.redirect("back");
});

router.post("/:id/unfavorite", requireLogin, async (req, res) => {
  try {
    await db.query(
      "DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?",
      [req.session.user.id, req.params.id]
    );
    req.flash("success_msg", "Đã bỏ yêu thích");
  } catch (err) {
    req.flash("error_msg", "Lỗi bỏ yêu thích");
  }
  res.redirect("back");
});

// Rating + comments data
router.get("/:id/rating-comments", async (req, res) => {
  try {
    const recipeId = req.params.id;

    const [[ratingData]] = await db.query(
      "SELECT AVG(rating) as avgRating, COUNT(*) as totalRatings FROM ratings WHERE recipe_id = ?",
      [recipeId]
    );

    let userRating = 0;
    if (req.session.user) {
      const [[rating]] = await db.query(
        "SELECT rating FROM ratings WHERE recipe_id = ? AND user_id = ?",
        [recipeId, req.session.user.id]
      );
      userRating = rating?.rating || 0;
    }

    const [comments] = await db.query(
      `SELECT c.*, u.username as user_name 
       FROM comments c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.recipe_id = ? 
       ORDER BY c.created_at DESC`,
      [recipeId]
    );

    res.json({
      avgRating: Number(ratingData.avgRating || 0).toFixed(1),
      totalRatings: ratingData.totalRatings || 0,
      userRating,
      comments: comments || [],
    });
  } catch (err) {
    console.error("Lỗi lấy rating/comments:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Add rating
router.post("/:id/rating", requireLogin, async (req, res) => {
  try {
    const recipeId = req.params.id;
    const userId = req.session.user.id;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating phải từ 1-5 sao" });
    }

    await db.query(
      "INSERT INTO ratings (recipe_id, user_id, rating) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating)",
      [recipeId, userId, rating]
    );

    const [[{ avgRating }]] = await db.query(
      "SELECT AVG(rating) as avgRating FROM ratings WHERE recipe_id = ?",
      [recipeId]
    );

    res.json({ success: true, avgRating: Number(avgRating || 0).toFixed(1) });
  } catch (err) {
    console.error("Lỗi thêm rating:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Add comment
router.post("/:id/comment", requireLogin, async (req, res) => {
  try {
    const recipeId = req.params.id;
    const userId = req.session.user.id;
    const { content } = req.body;

    if (!content || content.trim().length < 5) {
      return res
        .status(400)
        .json({ error: "Comment phải ít nhất 5 ký tự" });
    }

    await db.query(
      "INSERT INTO comments (recipe_id, user_id, content) VALUES (?, ?, ?)",
      [recipeId, userId, content.trim()]
    );

    const [[newComment]] = await db.query(
      `SELECT c.*, u.username as user_name 
       FROM comments c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.id = LAST_INSERT_ID()`
    );

    res.json({ success: true, comment: newComment });
  } catch (err) {
    console.error("Lỗi thêm comment:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
