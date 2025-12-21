const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { body, validationResult } = require("express-validator");
const recipesController = require("../controllers/recipesController");

router.use(express.json());

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

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    req.flash("error_msg", "Vui lòng đăng nhập để thực hiện hành động này!");
    return res.redirect("/login");
  }
  next();
};

router.get("/add", requireLogin, recipesController.showAddForm);
router.post(
  "/add",
  requireLogin,
  upload,
  [
    body("title").trim().notEmpty(),
    body("ingredients").trim().notEmpty(),
    body("instructions").trim().notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error_msg", errors.array().map((e) => e.msg).join(", "));
      return res.redirect("/recipes/add");
    }
    recipesController.createRecipe(req, res);
  }
);

router.get("/:id/edit", requireLogin, recipesController.showEditForm);
router.post(
  "/:id/edit",
  requireLogin,
  upload,
  [
    body("title").trim().notEmpty(),
    body("ingredients").trim().notEmpty(),
    body("instructions").trim().notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error_msg", errors.array().map((e) => e.msg).join(", "));
      return res.redirect(`/recipes/${req.params.id}/edit`);
    }
    recipesController.updateRecipe(req, res);
  }
);

router.post("/:id/delete", requireLogin, recipesController.deleteRecipe);
router.get("/:id", recipesController.viewDetail);
router.post("/:id/favorite", requireLogin, recipesController.favorite);
router.post("/:id/unfavorite", requireLogin, recipesController.unfavorite);
router.get("/:id/rating-comments", recipesController.ratingComments);
router.post("/:id/rating", requireLogin, recipesController.addRating);
router.post("/:id/comment", requireLogin, recipesController.addComment);

module.exports = router;
