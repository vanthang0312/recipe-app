// config/db.js
const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "recipe_app",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test kết nối ngay khi khởi động
pool
  .getConnection()
  .then((connection) => {
    console.log("✅ Kết nối MySQL thành công!");
    connection.release();
  })
  .catch((err) => {
    console.error("❌ Không kết nối được MySQL:", err.message);
  });

module.exports = pool;
