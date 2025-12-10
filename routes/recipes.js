// routes/recipes.js ƒ?" PHIASN B §›N HOA?N CH ¯^NH 2025 (Ž?AŸ CA" VIDEO + BAONH LU §ªN + RATING + KHA"NG L ¯-I)
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { body, validationResult } = require("express-validator");

// B §rT BU ¯~C PH §›I CA" DA'NG NA?Y Ž? ¯, AJAX + COMMENT + RATING CH §ÿY Ž?’_ ¯›C!
router.use(express.json());

// ==================== C §U HAONH MULTER (UPLOAD  §›NH) ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "public/uploads";
    // T §­o th’ø m ¯c n §¨u ch’øa t ¯"n t §­i
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
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Ch ¯% ch §p nh §-n  §œnh (jpg, png, gif, webp)!"));
    }
  },
}).single("recipeImage");

// ==================== MIDDLEWARE Ž?Ž,NG NH §ªP ====================
const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    req.flash(
      "error_msg",
      "Vui lAýng Ž`ŽŸng nh §-p Ž` ¯Ÿ th ¯ñc hi ¯Øn hAÿnh Ž` ¯Tng nAÿy!"
    );
    return res.redirect("/login");
  }
  next();
};

// ==================== THASM MA"N M ¯sI (Ž?AŸ CA" VIDEO) ====================
// Lưu ý đặt /add tr’ø ¯>c /:id để tr ¯`nh b §_t /recipes/add thành id="add"
router.get("/add", requireLogin, (req, res) => {
  res.render("add-recipe", { title: "ThA¦m cA'ng th ¯cc m ¯>i" });
});

router.post(
  "/add",
  requireLogin,
  upload,
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("TiA¦u Ž` ¯? khA'ng Ž`’ø ¯œc Ž` ¯Ÿ tr ¯`ng"),
    body("ingredients")
      .trim()
      .notEmpty()
      .withMessage("NguyA¦n li ¯Øu b §_t bu ¯Tc"),
    body("instructions")
      .trim()
      .notEmpty()
      .withMessage("H’ø ¯>ng d §®n b §_t bu ¯Tc"),
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
      req.flash("error_msg", "Vui lAýng ch ¯?n  §œnh mA3n ŽŸn!");
      return res.redirect("/recipes/add");
    }

    const { title, description, ingredients, instructions, video } = req.body;
    const imagePath = "/uploads/" + req.file.filename;

    try {
      await db.query(
        `INSERT INTO recipes 
         (title, description, image, video, ingredients, instructions, user_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
        "Ž?ŽŸng mA3n thAÿnh cA'ng! M ¯?i ng’ø ¯?i Ž`ang ch ¯? khA­m phA­"
      );
      res.redirect("/");
    } catch (err) {
      console.error("L ¯-i thA¦m mA3n:", err);
      req.flash("error_msg", "L ¯-i server, vui lAýng th ¯- l §­i!");
      res.redirect("/recipes/add");
    }
  }
);

// ==================== S ¯ªA CA"NG TH ¯"C (Ž?AŸ CA" VIDEO) ====================
router.get("/:id/edit", requireLogin, async (req, res) => {
  try {
    const [recipes] = await db.query(
      "SELECT * FROM recipes WHERE id = ? AND user_id = ?",
      [req.params.id, req.session.user.id]
    );
    if (recipes.length === 0) {
      req.flash(
        "error_msg",
        "KhA'ng tAªm th §y mA3n ho §úc b §­n khA'ng ph §œi ch ¯ s ¯Y h ¯_u!"
      );
      return res.redirect("/");
    }
    res.render("edit-recipe", {
      title: "S ¯-a cA'ng th ¯cc - " + recipes[0].title,
      recipe: recipes[0],
    });
  } catch (err) {
    req.flash("error_msg", "L ¯-i t §œi trang s ¯-a!");
    res.redirect("/");
  }
});

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
      // XA3a  §œnh cc n §¨u cA3
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
      req.flash("success_msg", "S ¯-a mA3n thAÿnh cA'ng!");
      res.redirect(`/recipes/${req.params.id}`);
    } catch (err) {
      console.error("L ¯-i s ¯-a mA3n:", err);
      req.flash("error_msg", "L ¯-i s ¯-a mA3n!");
      res.redirect(`/recipes/${req.params.id}/edit`);
    }
  }
);

// ==================== XA"A CA"NG TH ¯"C ====================
router.post("/:id/delete", requireLogin, async (req, res) => {
  try {
    const [recipes] = await db.query(
      "SELECT image FROM recipes WHERE id = ? AND user_id = ?",
      [req.params.id, req.session.user.id]
    );

    if (recipes.length === 0) {
      req.flash(
        "error_msg",
        "KhA'ng tAªm th §y mA3n ho §úc b §­n khA'ng cA3 quy ¯?n xA3a!"
      );
      return res.redirect("/");
    }

    const image = recipes[0].image;
    if (image) {
      const imagePath = path.join(__dirname, "../public", image);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    await db.query("DELETE FROM recipes WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.session.user.id,
    ]);

    req.flash("success_msg", "Ž?Aœ xA3a mA3n thAÿnh cA'ng!");
    res.redirect("/");
  } catch (err) {
    console.error("L ¯-i xA3a mA3n:", err);
    req.flash("error_msg", "L ¯-i xA3a mA3n!");
    res.redirect("/");
  }
});

// ==================== XEM CHI TI §_T CA"NG TH ¯"C ====================
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
      req.flash("error_msg", "KhA'ng tAªm th §y cA'ng th ¯cc!");
      return res.redirect("/");
    }

    const recipe = recipes[0];

    // Ki ¯Ÿm tra Ž`Aœ yA¦u thA-ch ch’øa (n §¨u Ž`Aœ Ž`ŽŸng nh §-p)
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
    });
  } catch (err) {
    console.error("L ¯-i xem chi ti §¨t:", err);
    req.flash("error_msg", "L ¯-i t §œi cA'ng th ¯cc!");
    res.redirect("/");
  }
});

// ==================== YASU THA?CH / B ¯Z YASU THA?CH ====================
router.post("/:id/favorite", requireLogin, async (req, res) => {
  try {
    await db.query(
      "INSERT IGNORE INTO favorites (user_id, recipe_id) VALUES (?, ?)",
      [req.session.user.id, req.params.id]
    );
    req.flash("success_msg", "Ž?Aœ thA¦m vAÿo mA3n yA¦u thA-ch");
  } catch (err) {
    req.flash("error_msg", "L ¯-i thA¦m yA¦u thA-ch");
  }
  res.redirect("back");
});

router.post("/:id/unfavorite", requireLogin, async (req, res) => {
  try {
    await db.query(
      "DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?",
      [req.session.user.id, req.params.id]
    );
    req.flash("success_msg", "Ž?Aœ b ¯? yA¦u thA-ch");
  } catch (err) {
    req.flash("error_msg", "L ¯-i b ¯? yA¦u thA-ch");
  }
  res.redirect("back");
});

// ==================== L §Y RATING + COMMENT ƒ?" CHO M ¯OI NG’_ ¯oI XEM ====================
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
    console.error("L ¯-i l §y rating/comments:", err);
    res.status(500).json({ error: "L ¯-i server" });
  }
});

// ==================== THASM RATING ====================
router.post("/:id/rating", requireLogin, async (req, res) => {
  try {
    const recipeId = req.params.id;
    const userId = req.session.user.id;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating ph §œi t ¯® 1-5 sao" });
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
    console.error("L ¯-i thA¦m rating:", err);
    res.status(500).json({ error: "L ¯-i server" });
  }
});

// ==================== THASM COMMENT ====================
router.post("/:id/comment", requireLogin, async (req, res) => {
  try {
    const recipeId = req.params.id;
    const userId = req.session.user.id;
    const { content } = req.body;

    if (!content || content.trim().length < 5) {
      return res
        .status(400)
        .json({ error: "Comment ph §œi A-t nh §t 5 kA« t ¯ñ" });
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
    console.error("L ¯-i thA¦m comment:", err);
    res.status(500).json({ error: "L ¯-i server" });
  }
});

module.exports = router;
